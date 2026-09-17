import { parseTrueType, readTableDirectory } from "./truetype";

/**
 * TrueType フォントを「GID を保ったまま」部分埋め込み用に縮小する。
 *
 * - 使う字形（＋ .notdef、複合字形の部品）の輪郭データだけを元のバイト列のまま複写し、
 *   それ以外の字形は空（長さ 0）にする。GID の番号は変えないため、CIDToGIDMap は Identity で済む
 *   （Excel などが出力する PDF と同じ方式）。
 * - 字形を作り直さないので、字形データが壊れる心配がない
 *   （@pdf-lib/fontkit の部分埋め込みでは一部の字形が表示されなかったため、自前で実装した）。
 * - PDF の CIDFontType2 で使う表だけを残す（cmap や GSUB などは PDF では使われない）。
 */

/** 残す表（それ以外は捨てる）。 */
const KEEP_TABLES = [
  "OS/2",
  "cvt ",
  "fpgm",
  "glyf",
  "head",
  "hhea",
  "hmtx",
  "loca",
  "maxp",
  "name",
  "prep",
];

const CHECKSUM_MAGIC = 0xb1b0afba;

function checksum(bytes: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < bytes.length; i += 4) {
    const word =
      ((bytes[i] ?? 0) << 24) |
      ((bytes[i + 1] ?? 0) << 16) |
      ((bytes[i + 2] ?? 0) << 8) |
      (bytes[i + 3] ?? 0);
    sum = (sum + (word >>> 0)) >>> 0;
  }
  return sum;
}

const pad4 = (n: number) => (4 - (n % 4)) % 4;

/**
 * 指定した GID の字形だけを残したフォントを返す。TrueType でなければ null。
 * 範囲外の GID は無視する。
 */
export function subsetTrueTypeKeepingGids(
  bytes: Uint8Array,
  gids: Iterable<number>,
): Uint8Array | null {
  const font = parseTrueType(bytes);
  const tables = readTableDirectory(bytes);
  if (!font || !tables) return null;
  const head = tables.get("head");
  const loca = tables.get("loca");
  const glyf = tables.get("glyf");
  if (!head || !loca || !glyf) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const longLoca = view.getInt16(head.offset + 50) === 1;
  const locaAt = (i: number) =>
    longLoca
      ? view.getUint32(loca.offset + i * 4)
      : view.getUint16(loca.offset + i * 2) * 2;

  // 残す GID（.notdef と複合字形の部品を含む）
  const keep = new Set<number>([0]);
  const queue = [...gids].filter(
    (g) => Number.isInteger(g) && g >= 0 && g < font.numGlyphs,
  );
  while (queue.length > 0) {
    const gid = queue.pop()!;
    if (keep.has(gid) && gid !== 0) continue;
    keep.add(gid);
    for (const c of font.glyphComponents(gid)) {
      if (!keep.has(c) && c < font.numGlyphs) queue.push(c);
    }
  }
  for (const c of font.glyphComponents(0)) keep.add(c);

  // glyf と 32 ビットの loca を作り直す
  const pieces: Uint8Array[] = [];
  const newLoca = new DataView(new ArrayBuffer((font.numGlyphs + 1) * 4));
  let glyfLength = 0;
  for (let gid = 0; gid < font.numGlyphs; gid += 1) {
    newLoca.setUint32(gid * 4, glyfLength);
    if (!keep.has(gid)) continue;
    const start = glyf.offset + locaAt(gid);
    const end = glyf.offset + locaAt(gid + 1);
    if (end <= start) continue;
    const data = bytes.subarray(start, end);
    pieces.push(data);
    glyfLength += data.length;
    const padding = pad4(data.length);
    if (padding > 0) {
      pieces.push(new Uint8Array(padding));
      glyfLength += padding;
    }
  }
  newLoca.setUint32(font.numGlyphs * 4, glyfLength);
  const newGlyf = new Uint8Array(glyfLength);
  let pos = 0;
  for (const p of pieces) {
    newGlyf.set(p, pos);
    pos += p.length;
  }

  // head: loca を 32 ビット形式に、チェックサム調整値はいったん 0 に
  const newHead = Uint8Array.from(
    bytes.subarray(head.offset, head.offset + head.length),
  );
  const headView = new DataView(newHead.buffer);
  headView.setUint32(8, 0);
  headView.setInt16(50, 1);

  const out = new Map<string, Uint8Array>();
  for (const tag of KEEP_TABLES) {
    const entry = tables.get(tag);
    if (!entry) continue;
    out.set(tag, bytes.subarray(entry.offset, entry.offset + entry.length));
  }
  out.set("head", newHead);
  out.set("loca", new Uint8Array(newLoca.buffer));
  out.set("glyf", newGlyf);

  // フォントファイルとして書き出す
  const tags = [...out.keys()].sort();
  const numTables = tags.length;
  let entrySelector = 0;
  while (2 ** (entrySelector + 1) <= numTables) entrySelector += 1;
  const searchRange = 2 ** entrySelector * 16;
  const headerLength = 12 + numTables * 16;
  const total = tags.reduce(
    (n, t) => n + out.get(t)!.length + pad4(out.get(t)!.length),
    headerLength,
  );
  const result = new Uint8Array(total);
  const w = new DataView(result.buffer);
  w.setUint32(0, 0x00010000);
  w.setUint16(4, numTables);
  w.setUint16(6, searchRange);
  w.setUint16(8, entrySelector);
  w.setUint16(10, numTables * 16 - searchRange);
  let offset = headerLength;
  let headOffset = 0;
  tags.forEach((tag, i) => {
    const data = out.get(tag)!;
    const record = 12 + i * 16;
    for (let k = 0; k < 4; k += 1) result[record + k] = tag.charCodeAt(k);
    w.setUint32(record + 4, checksum(data));
    w.setUint32(record + 8, offset);
    w.setUint32(record + 12, data.length);
    result.set(data, offset);
    if (tag === "head") headOffset = offset;
    offset += data.length + pad4(data.length);
  });
  w.setUint32(headOffset + 8, (CHECKSUM_MAGIC - checksum(result)) >>> 0);
  return result;
}
