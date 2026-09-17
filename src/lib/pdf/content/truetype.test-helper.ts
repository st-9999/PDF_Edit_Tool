/**
 * テスト専用: 解析に必要な表だけを持つ最小の TrueType フォントを組み立てる。
 * 輪郭データの中身は解析しないため、字形は「空（長さ 0）」か「ダミーの 12 バイト」で表す。
 */

export interface TestTrueTypeSpec {
  /** 各 GID に輪郭データがあるか（index = GID）。 */
  outlines: boolean[];
  /** (3,1) format 4 の Unicode → GID。 */
  unicodeBmp?: Record<number, number>;
  /** format 4 で idRangeOffset（glyphIdArray）方式を使う。 */
  useGlyphIdArray?: boolean;
  /** (3,10) format 12 の Unicode → GID。 */
  unicodeFull?: Record<number, number>;
  /** (3,0) format 4 の記号フォント用コード → GID。 */
  symbol?: Record<number, number>;
  /** (1,0) format 0 の Mac コード → GID。 */
  mac?: Record<number, number>;
  /** name 表のファミリ名（nameID 1, Windows Unicode）。 */
  familyName?: string;
  /** loca を 32 ビット形式にする。 */
  longLoca?: boolean;
}

class Writer {
  private bytes: number[] = [];
  u8(v: number) {
    this.bytes.push(v & 0xff);
  }
  u16(v: number) {
    this.u8(v >> 8);
    this.u8(v);
  }
  i16(v: number) {
    this.u16(v < 0 ? v + 0x10000 : v);
  }
  u32(v: number) {
    this.u16(Math.floor(v / 0x10000));
    this.u16(v & 0xffff);
  }
  raw(b: number[] | Uint8Array) {
    for (const x of b) this.u8(x);
  }
  get length() {
    return this.bytes.length;
  }
  toArray() {
    return Uint8Array.from(this.bytes);
  }
}

function cmapFormat4(map: Record<number, number>, useGlyphIdArray: boolean) {
  const codes = Object.keys(map)
    .map(Number)
    .sort((a, b) => a - b);
  const segs = codes.map((c) => ({ start: c, end: c, gid: map[c]! }));
  segs.push({ start: 0xffff, end: 0xffff, gid: 0 });
  const segX2 = segs.length * 2;
  const w = new Writer();
  const glyphIds: number[] = [];
  const header = 14 + segX2 * 4 + 2;
  w.u16(4);
  w.u16(header + (useGlyphIdArray ? (segs.length - 1) * 2 : 0));
  w.u16(0);
  w.u16(segX2);
  w.u16(0);
  w.u16(0);
  w.u16(0);
  for (const s of segs) w.u16(s.end);
  w.u16(0);
  for (const s of segs) w.u16(s.start);
  for (const s of segs) {
    w.i16(s.start === 0xffff ? 1 : useGlyphIdArray ? 0 : s.gid - s.start);
  }
  segs.forEach((s, i) => {
    if (s.start === 0xffff || !useGlyphIdArray) {
      w.u16(0);
      return;
    }
    // idRangeOffset: この要素位置から glyphIdArray 内の対応位置までのバイト距離
    const remainingOffsets = segs.length - i;
    w.u16(remainingOffsets * 2 + glyphIds.length * 2);
    glyphIds.push(s.gid);
  });
  for (const g of glyphIds) w.u16(g);
  return w.toArray();
}

function cmapFormat12(map: Record<number, number>) {
  const codes = Object.keys(map)
    .map(Number)
    .sort((a, b) => a - b);
  const w = new Writer();
  w.u16(12);
  w.u16(0);
  w.u32(16 + codes.length * 12);
  w.u32(0);
  w.u32(codes.length);
  for (const c of codes) {
    w.u32(c);
    w.u32(c);
    w.u32(map[c]!);
  }
  return w.toArray();
}

function cmapFormat0(map: Record<number, number>) {
  const w = new Writer();
  w.u16(0);
  w.u16(262);
  w.u16(0);
  for (let c = 0; c < 256; c += 1) w.u8(map[c] ?? 0);
  return w.toArray();
}

export function buildTestTrueType(spec: TestTrueTypeSpec): Uint8Array {
  const numGlyphs = spec.outlines.length;

  // glyf / loca
  const glyf = new Writer();
  const offsets: number[] = [];
  for (const has of spec.outlines) {
    offsets.push(glyf.length);
    if (has) glyf.raw(new Array(12).fill(1));
  }
  offsets.push(glyf.length);
  const loca = new Writer();
  for (const o of offsets) {
    if (spec.longLoca) loca.u32(o);
    else loca.u16(o / 2);
  }

  // head（indexToLocFormat は先頭から 50 バイト目）
  const head = new Writer();
  head.raw(new Array(50).fill(0));
  head.i16(spec.longLoca ? 1 : 0);
  head.i16(0);

  // maxp version 0.5
  const maxp = new Writer();
  maxp.u32(0x00005000);
  maxp.u16(numGlyphs);

  // cmap
  const subtables: { pid: number; eid: number; data: Uint8Array }[] = [];
  if (spec.mac) subtables.push({ pid: 1, eid: 0, data: cmapFormat0(spec.mac) });
  if (spec.symbol) {
    subtables.push({ pid: 3, eid: 0, data: cmapFormat4(spec.symbol, false) });
  }
  if (spec.unicodeBmp) {
    subtables.push({
      pid: 3,
      eid: 1,
      data: cmapFormat4(spec.unicodeBmp, !!spec.useGlyphIdArray),
    });
  }
  if (spec.unicodeFull) {
    subtables.push({ pid: 3, eid: 10, data: cmapFormat12(spec.unicodeFull) });
  }
  const cmap = new Writer();
  cmap.u16(0);
  cmap.u16(subtables.length);
  let off = 4 + subtables.length * 8;
  for (const t of subtables) {
    cmap.u16(t.pid);
    cmap.u16(t.eid);
    cmap.u32(off);
    off += t.data.length;
  }
  for (const t of subtables) cmap.raw(t.data);

  // name
  const tables: [string, Uint8Array][] = [
    ["cmap", cmap.toArray()],
    ["glyf", glyf.toArray()],
    ["head", head.toArray()],
    ["loca", loca.toArray()],
    ["maxp", maxp.toArray()],
  ];
  if (spec.familyName !== undefined) {
    const str = new Writer();
    for (const ch of spec.familyName) str.u16(ch.charCodeAt(0));
    const name = new Writer();
    name.u16(0);
    name.u16(1);
    name.u16(6 + 12);
    name.u16(3);
    name.u16(1);
    name.u16(0x409);
    name.u16(1);
    name.u16(str.length);
    name.u16(0);
    name.raw(str.toArray());
    tables.push(["name", name.toArray()]);
    tables.sort((a, b) => (a[0] < b[0] ? -1 : 1));
  }

  const font = new Writer();
  font.u32(0x00010000);
  font.u16(tables.length);
  font.u16(0);
  font.u16(0);
  font.u16(0);
  let dataOffset = 12 + tables.length * 16;
  const padded = tables.map(
    ([, data]) => data.length + ((4 - (data.length % 4)) % 4),
  );
  tables.forEach(([tag, data], i) => {
    for (const ch of tag) font.u8(ch.charCodeAt(0));
    font.u32(0);
    font.u32(dataOffset);
    font.u32(data.length);
    dataOffset += padded[i]!;
  });
  tables.forEach(([, data], i) => {
    font.raw(data);
    for (let k = data.length; k < padded[i]!; k += 1) font.u8(0);
  });
  return font.toArray();
}
