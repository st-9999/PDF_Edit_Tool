import {
  PDFDict,
  PDFName,
  PDFNumber,
  PDFRef,
  type PDFDocument,
  type PDFObject,
} from "pdf-lib";
import { writeToUnicodeCMap } from "./cmap";
import { FallbackFontEmbedder } from "./fallback-font";
import { loadFontModel, type FontModel } from "./font";
import type { PageText } from "./page-text";
import { getArray, getDict, resolve } from "./pdf-objects";

/**
 * 新しい文字を、どのフォントのどのコードで描くかを決める。
 *
 * 優先順（書体が変わらないものから）:
 * 1. `same-font`: 元のフォントの ToUnicode で描ける
 * 2. `same-font-program`: 元のフォントの埋め込み TrueType の cmap に字形がある
 *    → ToUnicode と W に対応を追記して、元のフォントのまま描く
 * 3. `same-typeface`: 同じ書体の別フォント（文書内の別サブセット）が描ける
 *    → そのフォントをページのリソースに加え、Tf を切り替えて描く
 * 4. `fallback`: 同梱フォントで描く（書体が変わる）
 *
 * `resolve` は文書を変更しない。書き換え全体が成功したときだけ `commit` で追記を反映する。
 */

export type GlyphSource =
  | "same-font"
  | "same-font-program"
  | "same-typeface"
  | "fallback";

export interface ResolvedGlyph {
  char: string;
  /** ページのフォントリソース名。 */
  resource: string;
  code: number;
  codeLength: 1 | 2;
  /** 送り幅（1/1000 em）。 */
  width: number;
  /** アセント・ディセント（1/1000 em）。 */
  ascent: number;
  descent: number;
  isWordSpace: boolean;
  source: GlyphSource;
}

export interface GlyphResolverOptions {
  /** 元の PDF のフォントで描けない文字に使う TrueType フォント（例: Noto Sans JP）。 */
  fallbackFont?: Uint8Array;
}

interface DocumentFont {
  /** フォント辞書への参照（直接オブジェクトの場合は辞書そのもの）。 */
  value: PDFRef | PDFDict;
  model: FontModel;
}

/** 追加するリソース名の接頭辞。 */
const RESOURCE_PREFIX = "TRW";

function sameObject(a: PDFObject | undefined, b: PDFRef | PDFDict): boolean {
  if (!a) return false;
  if (a instanceof PDFRef && b instanceof PDFRef) {
    return (
      a.objectNumber === b.objectNumber &&
      a.generationNumber === b.generationNumber
    );
  }
  return a === b;
}

export class GlyphResolver {
  private readonly ctx;
  /** ページのフォントリソース辞書（無ければ commit 時に作る）。 */
  private readonly pageFonts: PDFDict | undefined;
  private documentFonts: DocumentFont[] | null = null;
  private readonly usedNames = new Set<string>();

  /** 元のフォント（リソース名）ごとに、ToUnicode と W へ追記する対応。 */
  private readonly programAdditions = new Map<
    string,
    Map<number, { char: string; width: number }>
  >();
  /** ページのリソースに追加するフォント（名前 → 参照）。 */
  private readonly resourceAdditions = new Map<string, PDFRef | PDFDict>();
  /** 同梱フォントで使うコード → 文字と、そのリソース名。 */
  private readonly fallbackCodes = new Map<number, string>();
  private fallbackName: string | null = null;

  constructor(
    private readonly doc: PDFDocument,
    private readonly pageIndex: number,
    private readonly page: PageText,
    private readonly options: GlyphResolverOptions = {},
  ) {
    this.ctx = doc.context;
    const resources = resolve(
      this.ctx,
      doc.getPage(pageIndex).node.Resources(),
    );
    this.pageFonts =
      resources instanceof PDFDict
        ? getDict(this.ctx, resources, "Font")
        : undefined;
    for (const key of this.pageFonts?.keys() ?? []) {
      this.usedNames.add(key.decodeText());
    }
  }

  resolve(fontResource: string, char: string): ResolvedGlyph | null {
    const font = this.page.fonts.get(fontResource);
    if (!font || font.unsupportedReason) return null;

    // 1. 元のフォントの ToUnicode
    const code = font.encode(char);
    if (code !== null)
      return this.fromModel(font, fontResource, code, char, "same-font");

    // 2. 元のフォントの cmap（ToUnicode・W への追記が必要）
    const pending = this.programAdditions.get(fontResource);
    for (const [c, entry] of pending ?? []) {
      if (entry.char === char) {
        return this.fromProgram(font, fontResource, c, entry.width, char);
      }
    }
    const viaProgram = font.encodeViaFontProgram(char);
    if (viaProgram && !pending?.has(viaProgram.code)) {
      const additions = pending ?? new Map();
      additions.set(viaProgram.code, { char, width: viaProgram.width });
      this.programAdditions.set(fontResource, additions);
      return this.fromProgram(
        font,
        fontResource,
        viaProgram.code,
        viaProgram.width,
        char,
      );
    }

    // 3. 同じ書体の別フォント
    if (font.typefaceKey) {
      const own = this.pageFonts?.get(PDFName.of(fontResource));
      for (const candidate of this.allDocumentFonts()) {
        if (candidate.model.typefaceKey !== font.typefaceKey) continue;
        if (sameObject(own, candidate.value)) continue;
        const c = candidate.model.encode(char);
        if (c === null) continue;
        const name = this.resourceNameFor(candidate.value);
        return this.fromModel(candidate.model, name, c, char, "same-typeface");
      }
    }

    // 4. 同梱フォント
    if (this.options.fallbackFont) {
      const embedder = FallbackFontEmbedder.for(
        this.doc,
        this.options.fallbackFont,
      );
      const glyph = embedder.lookup(char);
      if (glyph) {
        this.fallbackCodes.set(glyph.code, char);
        return {
          char,
          resource: this.fallbackResourceName(),
          code: glyph.code,
          codeLength: 2,
          width: glyph.width,
          ascent: embedder.ascent,
          descent: embedder.descent,
          isWordSpace: false,
          source: "fallback",
        };
      }
    }
    return null;
  }

  /** 解決時に決めた追記（ToUnicode・W・リソース・同梱フォント）を文書に反映する。 */
  commit(): void {
    const ctx = this.ctx;
    const fonts = this.ensurePageFonts();

    for (const [resource, additions] of this.programAdditions) {
      const ref = fonts.get(PDFName.of(resource));
      const dict = resolve(ctx, ref);
      if (!(dict instanceof PDFDict)) continue;
      const model = this.page.fonts.get(resource)!;
      const entries = new Map(model.toUnicode?.entries() ?? []);
      for (const [code, { char }] of additions) entries.set(code, char);
      const stream = ctx.flateStream(writeToUnicodeCMap(entries, 2));
      const current = dict.get(PDFName.of("ToUnicode"));
      if (current instanceof PDFRef) ctx.assign(current, stream);
      else dict.set(PDFName.of("ToUnicode"), ctx.register(stream));

      const descendant = resolve(
        ctx,
        getArray(ctx, dict, "DescendantFonts")?.get(0),
      );
      if (!(descendant instanceof PDFDict)) continue;
      let widths = getArray(ctx, descendant, "W");
      if (!widths) {
        widths = ctx.obj([]);
        descendant.set(PDFName.of("W"), widths);
      }
      for (const [code, { width }] of additions) {
        widths.push(PDFNumber.of(code));
        widths.push(ctx.obj([width]));
      }
    }

    for (const [name, value] of this.resourceAdditions) {
      fonts.set(PDFName.of(name), value);
    }

    if (this.fallbackName && this.options.fallbackFont) {
      const ref = FallbackFontEmbedder.for(
        this.doc,
        this.options.fallbackFont,
      ).commit(this.fallbackCodes);
      fonts.set(PDFName.of(this.fallbackName), ref);
    }
  }

  // -------------------------------------------------------------------------

  private fromModel(
    font: FontModel,
    resource: string,
    code: number,
    char: string,
    source: GlyphSource,
  ): ResolvedGlyph {
    const codeLength = font.subtype === "Type0" ? 2 : 1;
    return {
      char,
      resource,
      code,
      codeLength,
      width: font.width(code),
      ascent: font.ascent,
      descent: font.descent,
      isWordSpace: font.isWordSpace({ code, offset: 0, length: codeLength }),
      source,
    };
  }

  private fromProgram(
    font: FontModel,
    resource: string,
    code: number,
    width: number,
    char: string,
  ): ResolvedGlyph {
    return {
      char,
      resource,
      code,
      codeLength: 2,
      width,
      ascent: font.ascent,
      descent: font.descent,
      isWordSpace: false,
      source: "same-font-program",
    };
  }

  /** 文書内の全ページのフォントリソース（重複を除く）。 */
  private allDocumentFonts(): DocumentFont[] {
    if (this.documentFonts) return this.documentFonts;
    const seen: (PDFRef | PDFDict)[] = [];
    const list: DocumentFont[] = [];
    for (const page of this.doc.getPages()) {
      const resources = resolve(this.ctx, page.node.Resources());
      if (!(resources instanceof PDFDict)) continue;
      const fonts = getDict(this.ctx, resources, "Font");
      if (!fonts) continue;
      for (const [key, value] of fonts.entries()) {
        const target =
          value instanceof PDFRef
            ? value
            : value instanceof PDFDict
              ? value
              : undefined;
        if (!target || seen.some((s) => sameObject(s, target))) continue;
        seen.push(target);
        const dict = resolve(this.ctx, target);
        if (!(dict instanceof PDFDict)) continue;
        list.push({
          value: target,
          model: loadFontModel(this.ctx, key.decodeText(), dict),
        });
      }
    }
    this.documentFonts = list;
    return list;
  }

  /** フォントをこのページで使うためのリソース名（既にあればその名前）。 */
  private resourceNameFor(value: PDFRef | PDFDict): string {
    for (const [key, v] of this.pageFonts?.entries() ?? []) {
      if (sameObject(v, value)) return key.decodeText();
    }
    for (const [name, v] of this.resourceAdditions) {
      if (sameObject(v, value)) return name;
    }
    const name = this.newName();
    this.resourceAdditions.set(name, value);
    return name;
  }

  private fallbackResourceName(): string {
    if (this.fallbackName) return this.fallbackName;
    // 同じ文書で既に組み込み済みなら、ページ上の既存の名前を再利用する
    const existing = FallbackFontEmbedder.for(
      this.doc,
      this.options.fallbackFont!,
    ).fontRef;
    if (existing) {
      for (const [key, v] of this.pageFonts?.entries() ?? []) {
        if (sameObject(v, existing)) {
          this.fallbackName = key.decodeText();
          return this.fallbackName;
        }
      }
    }
    this.fallbackName = this.newName();
    return this.fallbackName;
  }

  private newName(): string {
    for (let i = 1; ; i += 1) {
      const name = `${RESOURCE_PREFIX}${i}`;
      if (!this.usedNames.has(name)) {
        this.usedNames.add(name);
        return name;
      }
    }
  }

  private ensurePageFonts(): PDFDict {
    if (this.pageFonts) return this.pageFonts;
    const ctx = this.ctx;
    const node = this.doc.getPage(this.pageIndex).node;
    let resources = resolve(ctx, node.Resources());
    if (!(resources instanceof PDFDict)) {
      resources = ctx.obj({});
      node.set(PDFName.of("Resources"), resources);
    }
    const fonts = ctx.obj({});
    (resources as PDFDict).set(PDFName.of("Font"), fonts);
    return fonts;
  }
}
