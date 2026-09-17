import { describe, it, expect } from "vitest";
import { parseTrueType, readTableDirectory } from "./truetype";
import { subsetTrueTypeKeepingGids } from "./truetype-subset";
import { buildTestTrueType, testGlyphBytes } from "./truetype.test-helper";

/** フォント内の指定 GID の輪郭データ（glyf の該当範囲）を取り出す。 */
function glyphData(bytes: Uint8Array, gid: number): Uint8Array {
  const tables = readTableDirectory(bytes)!;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const head = tables.get("head")!;
  const loca = tables.get("loca")!;
  const glyf = tables.get("glyf")!;
  const long = view.getInt16(head.offset + 50) === 1;
  const at = (i: number) =>
    long
      ? view.getUint32(loca.offset + i * 4)
      : view.getUint16(loca.offset + i * 2) * 2;
  return bytes.subarray(glyf.offset + at(gid), glyf.offset + at(gid + 1));
}

/** OpenType のチェックサム（4 バイト単位の和）。 */
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

const SOURCE = buildTestTrueType({
  outlines: [true, true, true, true, true, true, true],
  composites: { 5: [2, 6], 6: [3] },
  advanceWidths: [500, 510, 520, 530, 540, 550, 560],
  unitsPerEm: 1000,
  ascender: 1160,
  descender: -288,
  unicodeBmp: { 0x41: 1 },
  familyName: "Noto Sans JP",
  hinting: true,
});

describe("subsetTrueTypeKeepingGids（GID を保った部分埋め込み）", () => {
  it("GID の総数を保ち、指定した字形だけ輪郭データを残す", () => {
    const out = parseTrueType(subsetTrueTypeKeepingGids(SOURCE, [1, 4])!)!;
    expect(out.numGlyphs).toBe(7);
    expect([0, 1, 2, 3, 4, 5, 6].map((g) => out.hasOutline(g))).toEqual([
      true, // .notdef は常に残す
      true,
      false,
      false,
      true,
      false,
      false,
    ]);
  });

  it("残した字形の輪郭データは元フォントとバイト単位で一致する", () => {
    const bytes = subsetTrueTypeKeepingGids(SOURCE, [1, 4])!;
    expect(glyphData(bytes, 1)).toEqual(testGlyphBytes(1));
    expect(glyphData(bytes, 4)).toEqual(testGlyphBytes(4));
    expect(glyphData(bytes, 4)).toEqual(glyphData(SOURCE, 4));
  });

  it("複合字形の部品を、部品の部品までたどって残す", () => {
    const out = parseTrueType(subsetTrueTypeKeepingGids(SOURCE, [5])!)!;
    // 5 → [2, 6]、6 → [3]
    expect([1, 2, 3, 4, 5, 6].map((g) => out.hasOutline(g))).toEqual([
      false,
      true,
      true,
      false,
      true,
      true,
    ]);
    expect(out.glyphComponents(5)).toEqual([2, 6]);
  });

  it("送り幅・unitsPerEm・アセンダ・ディセンダ・ファミリ名を保つ", () => {
    const out = parseTrueType(subsetTrueTypeKeepingGids(SOURCE, [1])!)!;
    expect([0, 1, 2, 3, 4, 5, 6].map((g) => out.advanceWidth(g))).toEqual([
      500, 510, 520, 530, 540, 550, 560,
    ]);
    expect([out.unitsPerEm, out.ascender, out.descender]).toEqual([
      1000, 1160, -288,
    ]);
    expect(out.familyName).toBe("Noto Sans JP");
  });

  it("PDF の CID フォントに必要な表だけを持ち、cmap は含めない", () => {
    const tables = readTableDirectory(subsetTrueTypeKeepingGids(SOURCE, [1])!)!;
    expect([...tables.keys()].sort()).toEqual(
      [
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
      ].sort(),
    );
  });

  it("各表のチェックサムと、フォント全体のチェックサム調整値が正しい", () => {
    const bytes = subsetTrueTypeKeepingGids(SOURCE, [1, 5])!;
    const tables = readTableDirectory(bytes)!;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const numTables = view.getUint16(4);
    for (let i = 0; i < numTables; i += 1) {
      const o = 12 + i * 16;
      const tag = String.fromCharCode(...bytes.subarray(o, o + 4));
      const { offset, length } = tables.get(tag)!;
      const data = Uint8Array.from(bytes.subarray(offset, offset + length));
      if (tag === "head") data.fill(0, 8, 12); // checkSumAdjustment を除いて計算する
      expect([tag, view.getUint32(o + 4)]).toEqual([tag, checksum(data)]);
    }
    // フォント全体の和 = 0xB1B0AFBA
    expect(checksum(bytes)).toBe(0xb1b0afba);
  });

  it("範囲外の GID は無視し、TrueType でない入力は null", () => {
    const out = parseTrueType(subsetTrueTypeKeepingGids(SOURCE, [1, 99, -1])!)!;
    expect(out.hasOutline(1)).toBe(true);
    expect(
      subsetTrueTypeKeepingGids(new Uint8Array([1, 2, 3]), [1]),
    ).toBeNull();
  });
});
