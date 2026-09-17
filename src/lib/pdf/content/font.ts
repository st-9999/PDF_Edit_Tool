import {
  PDFArray,
  PDFDict,
  PDFName,
  PDFNumber,
  type PDFContext,
} from "pdf-lib";
import { parseToUnicodeCMap, type ToUnicodeCMap } from "./cmap";
import { fontStyleOf, type FontStyle } from "./font-style";
import { parseTrueType, type TrueTypeFont } from "./truetype";
import {
  getArray,
  getDict,
  getName,
  getNumber,
  getStream,
  resolve,
  streamBytes,
} from "./pdf-objects";

/** 文字列中の 1 つの文字コード。 */
export interface CharCode {
  code: number;
  /** 文字列内のバイト位置。 */
  offset: number;
  /** コードのバイト長。 */
  length: number;
}

/**
 * 位置計算・書き換えに未対応な理由。
 * - `vertical`: 縦書き（Identity-V など）
 * - `encoding`: Identity 以外の CMap（コードの区切りや CID が特定できない）
 * - `metrics`: 文字幅が PDF 内に無い（Widths の無い標準 14 フォント）
 * - `type3`: Type3 フォント（FontMatrix による独自座標系）
 */
export type FontUnsupportedReason =
  | "vertical"
  | "encoding"
  | "metrics"
  | "type3";

export interface FontModel {
  /** ページリソース上の名前（`/F1` の `F1`）。 */
  resourceName: string;
  subtype: string;
  baseFont: string | null;
  /** サブセット接頭辞（`ABCDEF+`）を除いたベースフォント名。 */
  postScriptName: string | null;
  vertical: boolean;
  unsupportedReason: FontUnsupportedReason | null;
  /** グリフ空間（1/1000 em）での上端・下端。 */
  ascent: number;
  descent: number;
  toUnicode: ToUnicodeCMap | null;
  splitCodes(bytes: Uint8Array): CharCode[];
  /** コードに対応する文字（不明なら null）。 */
  unicode(code: number): string | null;
  /** グリフ空間（1/1000 em）での送り幅。 */
  width(code: number): number;
  /** ワード間隔（Tw）の対象となる空白か（1 バイトのコード 32 のみ。仕様 9.3.3）。 */
  isWordSpace(c: CharCode): boolean;
  /**
   * 1 文字を、このフォントで実際に描けるコードに変換する（描けなければ null）。
   * - 文字との対応（ToUnicode・エンコーディング）を逆に引いて候補を出す
   * - 埋め込み TrueType があれば、その字形の輪郭データが残っているかを確かめる
   *   （サブセットでは使っていない字形の輪郭が空になっている。空白は輪郭が空でもよい）
   * - 埋め込みが無い・TrueType 以外で確かめられない場合は対応表を信用する
   */
  encode(char: string): number | null;
  /**
   * ToUnicode に無い文字を、埋め込み TrueType の cmap から探す（Type0 / Identity-H のみ）。
   * 使うには ToUnicode と W に対応を追記する必要があるため、そのためのコードと幅（1/1000 em）を返す。
   * その CID が ToUnicode で別の文字に対応づいている場合は使わない。
   */
  encodeViaFontProgram(char: string): { code: number; width: number } | null;
  /**
   * 同じ書体の別サブセットを見分けるためのキー（ファミリ名・グリフ総数・unitsPerEm）。
   * 埋め込み TrueType が無ければ null。
   */
  typefaceKey: string | null;
  /** 明朝体（serif）かゴシック体（sans）か。元のフォントに無い文字を描く同梱フォントの選択に使う。 */
  style: FontStyle;
}

const DEFAULT_ASCENT = 880;
const DEFAULT_DESCENT = -120;
const DEFAULT_CID_WIDTH = 1000;

/** WinAnsiEncoding の 0x80〜0x9F（それ以外は ASCII / Latin-1 と一致）。 */
const WIN_ANSI_HIGH: Record<number, string> = {
  0x80: "€",
  0x82: "‚",
  0x83: "ƒ",
  0x84: "„",
  0x85: "…",
  0x86: "†",
  0x87: "‡",
  0x88: "ˆ",
  0x89: "‰",
  0x8a: "Š",
  0x8b: "‹",
  0x8c: "Œ",
  0x8e: "Ž",
  0x91: "‘",
  0x92: "’",
  0x93: "“",
  0x94: "”",
  0x95: "•",
  0x96: "–",
  0x97: "—",
  0x98: "˜",
  0x99: "™",
  0x9a: "š",
  0x9b: "›",
  0x9c: "œ",
  0x9e: "ž",
  0x9f: "Ÿ",
};

function winAnsi(code: number): string | null {
  if (code >= 0x20 && code <= 0x7e) return String.fromCharCode(code);
  if (code >= 0xa0 && code <= 0xff) return String.fromCharCode(code);
  return WIN_ANSI_HIGH[code] ?? null;
}

/** グリフ名から文字を得る（`uniXXXX` / `uXXXX[XX]` 形式のみ）。 */
function glyphNameToUnicode(name: string): string | null {
  let m = /^uni([0-9A-Fa-f]{4})$/.exec(name);
  if (m) return String.fromCharCode(parseInt(m[1]!, 16));
  m = /^u([0-9A-Fa-f]{4,6})$/.exec(name);
  if (m) return String.fromCodePoint(parseInt(m[1]!, 16));
  return null;
}

function stripSubsetTag(name: string | null): string | null {
  if (!name) return null;
  return name.replace(/^[A-Z]{6}\+/, "");
}

function readToUnicode(ctx: PDFContext, dict: PDFDict): ToUnicodeCMap | null {
  const stream = getStream(ctx, dict, "ToUnicode");
  if (!stream) return null;
  try {
    return parseToUnicodeCMap(streamBytes(stream));
  } catch {
    return null;
  }
}

/** CIDFont の /W 配列（`c [w…]` と `c1 c2 w` の混在）を読む。 */
function readCidWidths(
  ctx: PDFContext,
  w: PDFArray | undefined,
): Map<number, number> {
  const widths = new Map<number, number>();
  if (!w) return widths;
  const items = w.asArray().map((o) => resolve(ctx, o));
  for (let i = 0; i < items.length; ) {
    const first = items[i];
    const next = items[i + 1];
    if (!(first instanceof PDFNumber)) break;
    const c = first.asNumber();
    if (next instanceof PDFArray) {
      next.asArray().forEach((v, k) => {
        const n = resolve(ctx, v);
        if (n instanceof PDFNumber) widths.set(c + k, n.asNumber());
      });
      i += 2;
      continue;
    }
    const width = items[i + 2];
    if (next instanceof PDFNumber && width instanceof PDFNumber) {
      for (let x = c; x <= next.asNumber(); x += 1)
        widths.set(x, width.asNumber());
      i += 3;
      continue;
    }
    break;
  }
  return widths;
}

/** 単純フォントのエンコーディングからコード → 文字の関数を作る。 */
function simpleEncoding(
  ctx: PDFContext,
  dict: PDFDict,
): (code: number) => string | null {
  const encName = getName(ctx, dict, "Encoding");
  if (encName) return winAnsi; // WinAnsi / MacRoman / Standard とも ASCII 部分は一致
  const encDict = getDict(ctx, dict, "Encoding");
  if (!encDict) return winAnsi;
  const differences = new Map<number, string>();
  const diff = getArray(ctx, encDict, "Differences");
  if (diff) {
    let code = 0;
    for (const item of diff.asArray()) {
      const v = resolve(ctx, item);
      if (v instanceof PDFNumber) {
        code = v.asNumber();
      } else if (v instanceof PDFName) {
        differences.set(code, v.decodeText());
        code += 1;
      }
    }
  }
  return (code) => {
    const glyph = differences.get(code);
    if (glyph !== undefined) return glyphNameToUnicode(glyph);
    return winAnsi(code);
  };
}

const isBlank = (ch: string) => /^\s$/u.test(ch);

/** FontDescriptor の FontFile2（TrueType）を解析する。埋め込みが無い・解析できなければ null。 */
function readTrueTypeProgram(
  ctx: PDFContext,
  descriptor: PDFDict | undefined,
): TrueTypeFont | null {
  if (!descriptor) return null;
  const stream = getStream(ctx, descriptor, "FontFile2");
  if (!stream) return null;
  try {
    return parseTrueType(streamBytes(stream));
  } catch {
    return null;
  }
}

/** CIDFont の CIDToGIDMap（Identity または 2 バイトずつの対応表ストリーム）と、その逆引き。 */
function readCidToGid(
  ctx: PDFContext,
  cidFont: PDFDict | undefined,
): { toGid: (cid: number) => number; toCid: (gid: number) => number | null } {
  const stream = cidFont ? getStream(ctx, cidFont, "CIDToGIDMap") : undefined;
  if (!stream) return { toGid: (cid) => cid, toCid: (gid) => gid };
  const map = streamBytes(stream);
  let inverse: Map<number, number> | null = null;
  return {
    toGid: (cid) =>
      cid * 2 + 1 < map.length ? (map[cid * 2]! << 8) | map[cid * 2 + 1]! : 0,
    toCid(gid) {
      if (!inverse) {
        inverse = new Map();
        for (let cid = 0; cid * 2 + 1 < map.length; cid += 1) {
          const g = (map[cid * 2]! << 8) | map[cid * 2 + 1]!;
          if (g !== 0 && !inverse.has(g)) inverse.set(g, cid);
        }
      }
      return inverse.get(gid) ?? null;
    },
  };
}

function typefaceKeyOf(
  program: TrueTypeFont | null,
  postScriptName: string | null,
): string | null {
  if (!program) return null;
  const family = program.familyName ?? postScriptName;
  if (!family) return null;
  return `${family}|${program.numGlyphs}|${program.unitsPerEm}`;
}

function descriptorMetrics(ctx: PDFContext, descriptor: PDFDict | undefined) {
  const ascent = getNumber(ctx, descriptor, "Ascent");
  const descent = getNumber(ctx, descriptor, "Descent");
  return {
    ascent: ascent && ascent > 0 ? ascent : DEFAULT_ASCENT,
    descent: descent && descent < 0 ? descent : DEFAULT_DESCENT,
  };
}

function loadType0(
  ctx: PDFContext,
  resourceName: string,
  dict: PDFDict,
): FontModel {
  const baseFont = getName(ctx, dict, "BaseFont") ?? null;
  const encoding = getName(ctx, dict, "Encoding");
  const descendantRef = getArray(ctx, dict, "DescendantFonts")?.get(0);
  const descendant = resolve(ctx, descendantRef);
  const cidFont = descendant instanceof PDFDict ? descendant : undefined;

  const vertical = encoding === "Identity-V";
  const identity = encoding === "Identity-H" || encoding === "Identity-V";
  const widths = cidFont
    ? readCidWidths(ctx, getArray(ctx, cidFont, "W"))
    : new Map<number, number>();
  const dw = getNumber(ctx, cidFont, "DW") ?? DEFAULT_CID_WIDTH;
  const toUnicode = readToUnicode(ctx, dict);
  const descriptor = cidFont
    ? getDict(ctx, cidFont, "FontDescriptor")
    : undefined;
  const metrics = descriptorMetrics(ctx, descriptor);
  const program = readTrueTypeProgram(ctx, descriptor);
  const cidToGid = readCidToGid(ctx, cidFont);
  const postScriptName = stripSubsetTag(baseFont);
  const unsupportedReason: FontUnsupportedReason | null = vertical
    ? "vertical"
    : identity
      ? null
      : "encoding";

  return {
    resourceName,
    subtype: "Type0",
    baseFont,
    postScriptName,
    vertical,
    unsupportedReason,
    ...metrics,
    toUnicode,
    splitCodes(bytes) {
      const codes: CharCode[] = [];
      for (let i = 0; i < bytes.length; i += 2) {
        if (i + 1 < bytes.length) {
          codes.push({
            code: (bytes[i]! << 8) | bytes[i + 1]!,
            offset: i,
            length: 2,
          });
        } else {
          codes.push({ code: bytes[i]!, offset: i, length: 1 });
        }
      }
      return codes;
    },
    unicode: (code) => toUnicode?.lookup(code) ?? null,
    width: (code) => widths.get(code) ?? dw,
    isWordSpace: () => false,
    encode(char) {
      if (unsupportedReason || [...char].length !== 1) return null;
      for (const code of toUnicode?.codesFor(char) ?? []) {
        if (!program) return code;
        const gid = cidToGid.toGid(code);
        if (program.hasOutline(gid)) return code;
        if (isBlank(char) && gid > 0 && gid < program.numGlyphs) return code;
      }
      return null;
    },
    encodeViaFontProgram(char) {
      if (unsupportedReason || !program || [...char].length !== 1) return null;
      const gid = program.glyphForUnicode(char.codePointAt(0)!);
      if (gid === null) return null;
      if (!program.hasOutline(gid) && !isBlank(char)) return null;
      const code = cidToGid.toCid(gid);
      if (code === null) return null;
      const mapped = toUnicode?.lookup(code);
      if (mapped !== undefined && mapped !== null && mapped !== char)
        return null;
      const advance = program.advanceWidth(gid);
      if (advance === null) return null;
      return { code, width: (advance * 1000) / program.unitsPerEm };
    },
    typefaceKey: typefaceKeyOf(program, postScriptName),
    style: fontStyleOf({
      flags: getNumber(ctx, descriptor, "Flags"),
      names: [postScriptName, program?.familyName],
    }),
  };
}

function loadSimple(
  ctx: PDFContext,
  resourceName: string,
  dict: PDFDict,
  subtype: string,
): FontModel {
  const baseFont = getName(ctx, dict, "BaseFont") ?? null;
  const descriptor = getDict(ctx, dict, "FontDescriptor");
  const firstChar = getNumber(ctx, dict, "FirstChar") ?? 0;
  const widthsArr = getArray(ctx, dict, "Widths");
  const widths = widthsArr
    ? widthsArr.asArray().map((o) => {
        const v = resolve(ctx, o);
        return v instanceof PDFNumber ? v.asNumber() : 0;
      })
    : null;
  const missingWidth = getNumber(ctx, descriptor, "MissingWidth") ?? 0;
  const toUnicode = readToUnicode(ctx, dict);
  const fromEncoding = simpleEncoding(ctx, dict);
  const program = readTrueTypeProgram(ctx, descriptor);
  const flags = getNumber(ctx, descriptor, "Flags") ?? 0;
  // Flags: bit 3（4）= Symbolic、bit 6（32）= Nonsymbolic
  const symbolic = (flags & 4) !== 0 && (flags & 32) === 0;
  const unicodeOf = (code: number) =>
    toUnicode?.lookup(code) ?? fromEncoding(code);
  const inWidths = (code: number) =>
    !!widths && code >= firstChar && code < firstChar + widths.length;
  /** 単純 TrueType のコード → GID（仕様 9.6.6.4 の探索順に準じる）。 */
  const glyphFor = (tt: TrueTypeFont, code: number): number | null => {
    if (symbolic) {
      return tt.glyphForSymbolCode(code) ?? tt.glyphForMacCode(code);
    }
    const ch = fromEncoding(code);
    const byUnicode = ch ? tt.glyphForUnicode(ch.codePointAt(0)!) : null;
    return byUnicode ?? tt.glyphForMacCode(code) ?? tt.glyphForSymbolCode(code);
  };

  // 標準 14 フォントは Widths を省略できるが、字幅表を同梱していないため位置を計算できない
  let unsupportedReason: FontUnsupportedReason | null = null;
  if (subtype === "Type3") unsupportedReason = "type3";
  else if (!widths) unsupportedReason = "metrics";

  return {
    resourceName,
    subtype,
    baseFont,
    postScriptName: stripSubsetTag(baseFont),
    vertical: false,
    unsupportedReason,
    ...descriptorMetrics(ctx, descriptor),
    toUnicode,
    splitCodes: (bytes) =>
      Array.from(bytes, (code, offset) => ({ code, offset, length: 1 })),
    unicode: (code) => toUnicode?.lookup(code) ?? fromEncoding(code),
    width(code) {
      if (!widths) return missingWidth;
      const w = widths[code - firstChar];
      return w === undefined ? missingWidth : w;
    },
    isWordSpace: (c) => c.length === 1 && c.code === 32,
    encode(char) {
      if (unsupportedReason || [...char].length !== 1) return null;
      const candidates = new Set(toUnicode?.codesFor(char) ?? []);
      for (let code = 0; code < 256; code += 1) {
        if (fromEncoding(code) === char) candidates.add(code);
      }
      for (const code of candidates) {
        if (code > 0xff || !inWidths(code) || unicodeOf(code) !== char) {
          continue;
        }
        if (!program) return code;
        const gid = glyphFor(program, code);
        if (gid === null) continue;
        if (program.hasOutline(gid) || isBlank(char)) return code;
      }
      return null;
    },
    encodeViaFontProgram: () => null,
    typefaceKey: typefaceKeyOf(program, stripSubsetTag(baseFont)),
    style: fontStyleOf({
      flags,
      names: [stripSubsetTag(baseFont), program?.familyName],
    }),
  };
}

/** フォント辞書から位置計算・文字判定に使うモデルを作る。 */
export function loadFontModel(
  ctx: PDFContext,
  resourceName: string,
  dict: PDFDict,
): FontModel {
  const subtype = getName(ctx, dict, "Subtype") ?? "Type1";
  if (subtype === "Type0") return loadType0(ctx, resourceName, dict);
  return loadSimple(ctx, resourceName, dict, subtype);
}
