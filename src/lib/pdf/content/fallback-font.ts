import { PDFHexString, PDFName, type PDFDocument, type PDFRef } from "pdf-lib";
import { writeToUnicodeCMap } from "./cmap";
import { parseTrueType, type TrueTypeFont } from "./truetype";
import { subsetTrueTypeKeepingGids } from "./truetype-subset";

/**
 * 元の PDF のフォントで描けない文字を描くための同梱フォント（例: Noto Sans JP）を、
 * Type0 / Identity-H・CIDToGIDMap Identity のフォントとして文書に組み込む。
 *
 * - コード（CID）＝ 同梱フォントの GID。字形は GID を保った部分埋め込み（`subsetTrueTypeKeepingGids`）。
 * - `lookup` は文書を変更しない。書き換え全体が成功した時点で `commit` し、フォント辞書を作る／更新する。
 * - 同じ文書では 1 つのフォント辞書を使い回し、2 回目以降は字形・ToUnicode・W を作り直して同じ参照に書き込む。
 */

export interface FallbackGlyph {
  /** 文字コード（＝ GID）。 */
  code: number;
  /** 送り幅（1/1000 em）。 */
  width: number;
}

/** PDF のサブセットフォント名の接頭辞（6 文字の英大文字。仕様 9.6.4）。 */
const SUBSET_TAG = "PDFEDT";

const isBlank = (ch: string) => /^\s$/u.test(ch);

interface FontRefs {
  font: PDFRef;
  descendant: PDFRef;
  descriptor: PDFRef;
  fontFile: PDFRef;
  toUnicode: PDFRef;
}

const instances = new WeakMap<
  PDFDocument,
  WeakMap<Uint8Array, FallbackFontEmbedder>
>();

export class FallbackFontEmbedder {
  private readonly program: TrueTypeFont;
  private readonly glyphs = new Map<number, string>();
  private refs: FontRefs | null = null;

  /** 文書とフォントデータの組ごとに 1 つの組み込み器を返す。 */
  static for(doc: PDFDocument, fontBytes: Uint8Array): FallbackFontEmbedder {
    let byBytes = instances.get(doc);
    if (!byBytes) {
      byBytes = new WeakMap();
      instances.set(doc, byBytes);
    }
    let embedder = byBytes.get(fontBytes);
    if (!embedder) {
      embedder = new FallbackFontEmbedder(doc, fontBytes);
      byBytes.set(fontBytes, embedder);
    }
    return embedder;
  }

  private constructor(
    private readonly doc: PDFDocument,
    private readonly fontBytes: Uint8Array,
  ) {
    const program = parseTrueType(fontBytes);
    if (!program) throw new Error("同梱フォントが TrueType として読めません");
    this.program = program;
  }

  private toEm(units: number): number {
    return (units * 1000) / this.program.unitsPerEm;
  }

  /** 組み込み済みのフォント辞書の参照（まだ commit していなければ null）。 */
  get fontRef(): PDFRef | null {
    return this.refs?.font ?? null;
  }

  /** アセント（1/1000 em）。 */
  get ascent(): number {
    return this.toEm(this.program.ascender);
  }

  /** ディセント（1/1000 em）。 */
  get descent(): number {
    return this.toEm(this.program.descender);
  }

  /** 1 文字を描ける字形を探す（文書は変更しない）。 */
  lookup(char: string): FallbackGlyph | null {
    if ([...char].length !== 1) return null;
    const gid = this.program.glyphForUnicode(char.codePointAt(0)!);
    if (gid === null) return null;
    if (!this.program.hasOutline(gid) && !isBlank(char)) return null;
    const advance = this.program.advanceWidth(gid);
    if (advance === null) return null;
    return { code: gid, width: this.toEm(advance) };
  }

  /**
   * 使う字形（コード → 文字）を追加してフォントを作る／更新し、フォント辞書の参照を返す。
   */
  commit(additions: Map<number, string>): PDFRef {
    for (const [code, char] of additions) this.glyphs.set(code, char);
    const ctx = this.doc.context;
    const refs: FontRefs = this.refs ?? {
      font: ctx.nextRef(),
      descendant: ctx.nextRef(),
      descriptor: ctx.nextRef(),
      fontFile: ctx.nextRef(),
      toUnicode: ctx.nextRef(),
    };
    this.refs = refs;

    const program = subsetTrueTypeKeepingGids(
      this.fontBytes,
      this.glyphs.keys(),
    );
    if (!program) throw new Error("同梱フォントの部分埋め込みに失敗しました");
    const baseFont = `${SUBSET_TAG}+${(this.program.familyName ?? "Fallback").replace(/\s+/g, "")}`;
    const [xMin, yMin, xMax, yMax] = this.program.bbox;
    const codes = [...this.glyphs.keys()].sort((a, b) => a - b);

    ctx.assign(
      refs.fontFile,
      ctx.flateStream(program, { Length1: program.length }),
    );
    ctx.assign(
      refs.toUnicode,
      ctx.flateStream(writeToUnicodeCMap(this.glyphs.entries(), 2)),
    );
    ctx.assign(
      refs.descriptor,
      ctx.obj({
        Type: "FontDescriptor",
        FontName: baseFont,
        // Symbolic（CIDFont は標準ラテン文字集合の外の文字を含むため）
        Flags: 4,
        FontBBox: [xMin, yMin, xMax, yMax].map((v) => this.toEm(v)),
        ItalicAngle: 0,
        Ascent: this.ascent,
        Descent: this.descent,
        CapHeight: this.ascent,
        StemV: 80,
        FontFile2: refs.fontFile,
      }),
    );
    ctx.assign(
      refs.descendant,
      ctx.obj({
        Type: "Font",
        Subtype: "CIDFontType2",
        BaseFont: baseFont,
        CIDSystemInfo: {
          Registry: PDFHexString.fromText("Adobe"),
          Ordering: PDFHexString.fromText("Identity"),
          Supplement: 0,
        },
        FontDescriptor: refs.descriptor,
        DW: 1000,
        W: codes.flatMap((code) => [
          code,
          [this.toEm(this.program.advanceWidth(code) ?? 0)],
        ]),
        CIDToGIDMap: PDFName.of("Identity"),
      }),
    );
    ctx.assign(
      refs.font,
      ctx.obj({
        Type: "Font",
        Subtype: "Type0",
        BaseFont: baseFont,
        Encoding: "Identity-H",
        DescendantFonts: [refs.descendant],
        ToUnicode: refs.toUnicode,
      }),
    );
    return refs.font;
  }
}
