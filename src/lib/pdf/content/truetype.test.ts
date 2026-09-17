import { describe, it, expect } from "vitest";
import { parseTrueType } from "./truetype";
import { buildTestTrueType } from "./truetype.test-helper";

describe("parseTrueType（埋め込み TrueType の最小解析）", () => {
  it("グリフ数と、各グリフの輪郭データの有無を返す（16 ビット loca）", () => {
    const font = parseTrueType(
      buildTestTrueType({ outlines: [false, true, false, true] }),
    )!;
    expect(font.numGlyphs).toBe(4);
    expect([0, 1, 2, 3].map((g) => font.hasOutline(g))).toEqual([
      false,
      true,
      false,
      true,
    ]);
    expect(font.hasOutline(4)).toBe(false); // 範囲外
    expect(font.hasOutline(-1)).toBe(false);
  });

  it("32 ビット loca でも輪郭データの有無を返す", () => {
    const font = parseTrueType(
      buildTestTrueType({ outlines: [true, false, true], longLoca: true }),
    )!;
    expect([0, 1, 2].map((g) => font.hasOutline(g))).toEqual([
      true,
      false,
      true,
    ]);
  });

  describe("cmap", () => {
    it("(3,1) format 4 の idDelta 方式で Unicode → GID を引く", () => {
      const font = parseTrueType(
        buildTestTrueType({
          outlines: [false, true, true],
          unicodeBmp: { 0x31: 1, 0x53f7: 2 },
        }),
      )!;
      expect(font.glyphForUnicode(0x31)).toBe(1);
      expect(font.glyphForUnicode(0x53f7)).toBe(2);
      expect(font.glyphForUnicode(0x32)).toBeNull();
    });

    it("(3,1) format 4 の idRangeOffset（glyphIdArray）方式で引く", () => {
      const font = parseTrueType(
        buildTestTrueType({
          outlines: [false, true, true, true],
          unicodeBmp: { 0x41: 3, 0x42: 1, 0x7b: 2 },
          useGlyphIdArray: true,
        }),
      )!;
      expect(font.glyphForUnicode(0x41)).toBe(3);
      expect(font.glyphForUnicode(0x42)).toBe(1);
      expect(font.glyphForUnicode(0x7b)).toBe(2);
      expect(font.glyphForUnicode(0x43)).toBeNull();
    });

    it("(3,10) format 12 で BMP 外の文字を引き、BMP 内も format 4 より優先する", () => {
      const font = parseTrueType(
        buildTestTrueType({
          outlines: [false, true, true],
          unicodeBmp: { 0x31: 1 },
          unicodeFull: { 0x20bb7: 2, 0x31: 2 },
        }),
      )!;
      expect(font.glyphForUnicode(0x20bb7)).toBe(2);
      expect(font.glyphForUnicode(0x31)).toBe(2);
    });

    it("記号フォント (3,0) はコードそのものと 0xF000 + コードの両方で引く", () => {
      const font = parseTrueType(
        buildTestTrueType({
          outlines: [false, true, true],
          symbol: { 0xf031: 1, 0x32: 2 },
        }),
      )!;
      expect(font.glyphForSymbolCode(0x31)).toBe(1);
      expect(font.glyphForSymbolCode(0x32)).toBe(2);
      expect(font.glyphForSymbolCode(0x33)).toBeNull();
    });

    it("(1,0) format 0 で Mac コード → GID を引く", () => {
      const font = parseTrueType(
        buildTestTrueType({ outlines: [false, true], mac: { 0x31: 1 } }),
      )!;
      expect(font.glyphForMacCode(0x31)).toBe(1);
      expect(font.glyphForMacCode(0x32)).toBeNull();
    });

    it("cmap 表が無い（Excel の MS P ゴシック等）場合はどれも null", () => {
      const font = parseTrueType(
        buildTestTrueType({ outlines: [false, true] }),
      )!;
      expect(font.glyphForUnicode(0x31)).toBeNull();
      expect(font.glyphForSymbolCode(0x31)).toBeNull();
      expect(font.glyphForMacCode(0x31)).toBeNull();
    });
  });

  describe("字形の寸法", () => {
    it("head 表のフォント全体の外接矩形を読む", () => {
      const font = parseTrueType(
        buildTestTrueType({ outlines: [true], bbox: [-100, -300, 2000, 1500] }),
      )!;
      expect(font.bbox).toEqual([-100, -300, 2000, 1500]);
    });

    it("unitsPerEm・アセンダ・ディセンダを読む", () => {
      const font = parseTrueType(
        buildTestTrueType({
          outlines: [true],
          unitsPerEm: 2048,
          ascender: 1854,
          descender: -434,
        }),
      )!;
      expect(font.unitsPerEm).toBe(2048);
      expect(font.ascender).toBe(1854);
      expect(font.descender).toBe(-434);
    });

    it("hmtx から GID ごとの送り幅を読み、numberOfHMetrics 以降は最後の値を使う", () => {
      const font = parseTrueType(
        buildTestTrueType({
          outlines: [false, true, true, true],
          advanceWidths: [0, 555, 1000],
          numberOfHMetrics: 3,
        }),
      )!;
      expect(font.advanceWidth(1)).toBe(555);
      expect(font.advanceWidth(2)).toBe(1000);
      expect(font.advanceWidth(3)).toBe(1000);
      expect(font.advanceWidth(99)).toBeNull();
    });
  });

  it("複合字形が参照する部品の GID を返す（単純字形・空の字形は空配列）", () => {
    const font = parseTrueType(
      buildTestTrueType({
        outlines: [false, true, true, true],
        composites: { 3: [1, 2] },
      }),
    )!;
    expect(font.glyphComponents(3)).toEqual([1, 2]);
    expect(font.glyphComponents(1)).toEqual([]);
    expect(font.glyphComponents(0)).toEqual([]);
  });

  it("name 表からファミリ名を読む（無ければ null）", () => {
    expect(
      parseTrueType(
        buildTestTrueType({ outlines: [true], familyName: "MS Mincho" }),
      )!.familyName,
    ).toBe("MS Mincho");
    expect(
      parseTrueType(buildTestTrueType({ outlines: [true] }))!.familyName,
    ).toBeNull();
  });

  it("TrueType でないデータ（CFF の OTTO・壊れたバイト列）は null", () => {
    // "OTTO" で始まる CFF ベースの OpenType
    expect(
      parseTrueType(new Uint8Array([0x4f, 0x54, 0x54, 0x4f, 0, 1])),
    ).toBeNull();
    expect(parseTrueType(new Uint8Array([0, 1, 0, 0, 0, 9]))).toBeNull();
    expect(parseTrueType(new Uint8Array())).toBeNull();
  });
});
