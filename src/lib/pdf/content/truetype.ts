/**
 * PDF に埋め込まれた TrueType フォント（FontFile2）の最小解析。
 *
 * テキスト書き換えでは「新しい文字の字形がサブセットに本当に入っているか」を確かめる必要がある。
 * サブセットは GID の番号を元フォントのまま保ち、使っていない字形の輪郭データを空（長さ 0）にするため、
 * `loca` 表で輪郭データの有無を判定する。
 * 仕様: OpenType 仕様（head / maxp / loca / cmap / name）。
 */

export interface TrueTypeFont {
  numGlyphs: number;
  /** GID の輪郭データが空でないか。 */
  hasOutline(gid: number): boolean;
  /** Unicode コードポイント → GID（(3,10) → (3,1) → (0,*) の順）。 */
  glyphForUnicode(codePoint: number): number | null;
  /** 記号フォント (3,0) でのコード → GID（コードそのもの、または 0xF000 + コード）。 */
  glyphForSymbolCode(code: number): number | null;
  /** (1,0) Mac Roman でのコード → GID。 */
  glyphForMacCode(code: number): number | null;
  /** name 表のファミリ名（nameID 1）。 */
  familyName: string | null;
  /** head 表の 1 em あたりの単位数。 */
  unitsPerEm: number;
  /** head 表のフォント全体の外接矩形 [xMin, yMin, xMax, yMax]（フォント単位）。 */
  bbox: [number, number, number, number];
  /** hhea 表のアセンダ・ディセンダ（フォント単位）。表が無ければ 0。 */
  ascender: number;
  descender: number;
  /** hmtx 表の送り幅（フォント単位）。GID が範囲外・表が無ければ null。 */
  advanceWidth(gid: number): number | null;
  /** 複合字形が参照する部品の GID（単純字形・空の字形は空配列）。 */
  glyphComponents(gid: number): number[];
}

type CmapLookup = (code: number) => number | null;

class Reader {
  constructor(private readonly view: DataView) {}
  get length() {
    return this.view.byteLength;
  }
  u8(o: number) {
    return this.view.getUint8(o);
  }
  u16(o: number) {
    return this.view.getUint16(o);
  }
  i16(o: number) {
    return this.view.getInt16(o);
  }
  u32(o: number) {
    return this.view.getUint32(o);
  }
}

export interface TableEntry {
  offset: number;
  length: number;
}

/** 複合字形のフラグ（OpenType glyf 表）。 */
const ARG_1_AND_2_ARE_WORDS = 0x0001;
const WE_HAVE_A_SCALE = 0x0008;
const MORE_COMPONENTS = 0x0020;
const WE_HAVE_AN_X_AND_Y_SCALE = 0x0040;
const WE_HAVE_A_TWO_BY_TWO = 0x0080;

/** TrueType のテーブルディレクトリを読む（TrueType でなければ null）。 */
export function readTableDirectory(
  bytes: Uint8Array,
): Map<string, TableEntry> | null {
  try {
    return readTables(
      new Reader(
        new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
      ),
    );
  } catch {
    return null;
  }
}

function readTables(r: Reader): Map<string, TableEntry> | null {
  if (r.length < 12) return null;
  const version = r.u32(0);
  // 0x00010000 または 'true'（Mac の TrueType）
  if (version !== 0x00010000 && version !== 0x74727565) return null;
  const numTables = r.u16(4);
  if (12 + numTables * 16 > r.length) return null;
  const tables = new Map<string, TableEntry>();
  for (let i = 0; i < numTables; i += 1) {
    const o = 12 + i * 16;
    const tag = String.fromCharCode(
      r.u8(o),
      r.u8(o + 1),
      r.u8(o + 2),
      r.u8(o + 3),
    );
    const offset = r.u32(o + 8);
    const length = r.u32(o + 12);
    if (offset + length > r.length) continue;
    tables.set(tag, { offset, length });
  }
  return tables;
}

function format4(r: Reader, base: number): CmapLookup {
  const segX2 = r.u16(base + 6);
  const segCount = segX2 / 2;
  const ends = base + 14;
  const starts = ends + segX2 + 2;
  const deltas = starts + segX2;
  const rangeOffsets = deltas + segX2;
  return (code) => {
    if (code > 0xffff) return null;
    for (let s = 0; s < segCount; s += 1) {
      const end = r.u16(ends + s * 2);
      if (code > end) continue;
      const start = r.u16(starts + s * 2);
      if (code < start) return null;
      const delta = r.i16(deltas + s * 2);
      const ro = r.u16(rangeOffsets + s * 2);
      let gid: number;
      if (ro === 0) {
        gid = (code + delta) & 0xffff;
      } else {
        const addr = rangeOffsets + s * 2 + ro + (code - start) * 2;
        if (addr + 2 > r.length) return null;
        const g = r.u16(addr);
        gid = g === 0 ? 0 : (g + delta) & 0xffff;
      }
      return gid === 0 ? null : gid;
    }
    return null;
  };
}

function format12(r: Reader, base: number): CmapLookup {
  const groups = r.u32(base + 12);
  return (code) => {
    for (let i = 0; i < groups; i += 1) {
      const o = base + 16 + i * 12;
      const start = r.u32(o);
      const end = r.u32(o + 4);
      if (code >= start && code <= end) {
        const gid = r.u32(o + 8) + (code - start);
        return gid === 0 ? null : gid;
      }
    }
    return null;
  };
}

function format0(r: Reader, base: number): CmapLookup {
  return (code) => {
    if (code < 0 || code > 255) return null;
    const gid = r.u8(base + 6 + code);
    return gid === 0 ? null : gid;
  };
}

function format6(r: Reader, base: number): CmapLookup {
  const first = r.u16(base + 6);
  const count = r.u16(base + 8);
  return (code) => {
    if (code < first || code >= first + count) return null;
    const gid = r.u16(base + 10 + (code - first) * 2);
    return gid === 0 ? null : gid;
  };
}

function subtableLookup(r: Reader, base: number): CmapLookup | null {
  switch (r.u16(base)) {
    case 0:
      return format0(r, base);
    case 4:
      return format4(r, base);
    case 6:
      return format6(r, base);
    case 12:
      return format12(r, base);
    default:
      return null;
  }
}

function readFamilyName(
  r: Reader,
  table: TableEntry | undefined,
): string | null {
  if (!table) return null;
  const count = r.u16(table.offset + 2);
  const strings = table.offset + r.u16(table.offset + 4);
  let fallback: string | null = null;
  for (let i = 0; i < count; i += 1) {
    const o = table.offset + 6 + i * 12;
    const platform = r.u16(o);
    const nameId = r.u16(o + 6);
    if (nameId !== 1) continue;
    const length = r.u16(o + 8);
    const start = strings + r.u16(o + 10);
    if (start + length > r.length) continue;
    if (platform === 3 || platform === 0) {
      let s = "";
      for (let k = 0; k + 1 < length; k += 2)
        s += String.fromCharCode(r.u16(start + k));
      return s;
    }
    if (platform === 1 && fallback === null) {
      let s = "";
      for (let k = 0; k < length; k += 1)
        s += String.fromCharCode(r.u8(start + k));
      fallback = s;
    }
  }
  return fallback;
}

/** TrueType フォントを解析する。TrueType でない・必要な表が無い場合は null。 */
export function parseTrueType(bytes: Uint8Array): TrueTypeFont | null {
  try {
    const r = new Reader(
      new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    );
    const tables = readTables(r);
    if (!tables) return null;
    const head = tables.get("head");
    const maxp = tables.get("maxp");
    const loca = tables.get("loca");
    if (!head || !maxp || !loca || head.length < 54) return null;

    const numGlyphs = r.u16(maxp.offset + 4);
    const unitsPerEm = r.u16(head.offset + 18) || 1000;
    const longLoca = r.i16(head.offset + 50) === 1;
    const hhea = tables.get("hhea");
    const hmtx = tables.get("hmtx");
    const glyf = tables.get("glyf");
    const numberOfHMetrics =
      hhea && hhea.length >= 36 ? r.u16(hhea.offset + 34) : 0;
    const locaAt = (i: number) =>
      longLoca ? r.u32(loca.offset + i * 4) : r.u16(loca.offset + i * 2) * 2;
    const locaEntries = longLoca ? loca.length / 4 : loca.length / 2;

    const lookups = new Map<string, CmapLookup>();
    const cmap = tables.get("cmap");
    if (cmap) {
      const count = r.u16(cmap.offset + 2);
      for (let i = 0; i < count; i += 1) {
        const o = cmap.offset + 4 + i * 8;
        const key = `${r.u16(o)},${r.u16(o + 2)}`;
        const lookup = subtableLookup(r, cmap.offset + r.u32(o + 4));
        if (lookup && !lookups.has(key)) lookups.set(key, lookup);
      }
    }
    const first = (keys: string[], code: number): number | null => {
      for (const k of keys) {
        const gid = lookups.get(k)?.(code) ?? null;
        if (gid !== null) return gid;
      }
      return null;
    };

    const hasOutline = (gid: number) => {
      if (!Number.isInteger(gid) || gid < 0 || gid >= numGlyphs) return false;
      if (gid + 1 >= locaEntries) return false;
      return locaAt(gid + 1) > locaAt(gid);
    };

    return {
      numGlyphs,
      hasOutline,
      glyphForUnicode: (cp) => first(["3,10", "3,1", "0,4", "0,3"], cp),
      glyphForSymbolCode: (code) =>
        first(["3,0"], code) ?? first(["3,0"], 0xf000 + code),
      glyphForMacCode: (code) => first(["1,0"], code),
      familyName: readFamilyName(r, tables.get("name")),
      unitsPerEm,
      bbox: [
        r.i16(head.offset + 36),
        r.i16(head.offset + 38),
        r.i16(head.offset + 40),
        r.i16(head.offset + 42),
      ],
      ascender: hhea ? r.i16(hhea.offset + 4) : 0,
      descender: hhea ? r.i16(hhea.offset + 6) : 0,
      advanceWidth(gid) {
        if (!hmtx || numberOfHMetrics === 0) return null;
        if (!Number.isInteger(gid) || gid < 0 || gid >= numGlyphs) return null;
        const index = Math.min(gid, numberOfHMetrics - 1);
        if ((index + 1) * 4 > hmtx.length) return null;
        return r.u16(hmtx.offset + index * 4);
      },
      glyphComponents(gid) {
        if (!glyf || !hasOutline(gid)) return [];
        let o = glyf.offset + locaAt(gid);
        if (r.i16(o) >= 0) return []; // 単純字形
        o += 10;
        const components: number[] = [];
        for (;;) {
          const flags = r.u16(o);
          components.push(r.u16(o + 2));
          o += 4 + (flags & ARG_1_AND_2_ARE_WORDS ? 4 : 2);
          if (flags & WE_HAVE_A_SCALE) o += 2;
          else if (flags & WE_HAVE_AN_X_AND_Y_SCALE) o += 4;
          else if (flags & WE_HAVE_A_TWO_BY_TWO) o += 8;
          if (!(flags & MORE_COMPONENTS)) break;
        }
        return components;
      },
    };
  } catch {
    return null;
  }
}
