import { describe, it, expect } from "vitest";
import { glyphAt, selectionRect, type PointMapper } from "./hit-test";
import type { PageGlyph } from "./text-layout";

/** 指定した四隅（ユーザー空間）だけを持つテスト用グリフ。 */
function glyph(quad: number[]): PageGlyph {
  return { quad } as unknown as PageGlyph;
}

/** 幅 10・高さ 12 の横書きグリフを x = 100, 110, 120 に並べる（ベースライン y = 700）。 */
const ROW = [100, 110, 120].map((x) =>
  glyph([x, 698, x + 10, 698, x + 10, 710, x, 710]),
);

/** PDF 座標（原点左下）→ 画面座標（原点左上、2 倍）。高さ 792。 */
const toScreen: PointMapper = (x, y) => [x * 2, (792 - y) * 2];

describe("glyphAt（画面上の点にあるグリフ）", () => {
  it("点を含むグリフの番号を返す", () => {
    // グリフ 1 の中央（PDF 115, 704 → 画面 230, 176）
    expect(glyphAt(ROW, [230, 176], toScreen)).toBe(1);
    expect(glyphAt(ROW, [201, 187], toScreen)).toBe(0);
  });

  it("どのグリフにも含まれない点は、許容距離内の最も近いグリフ、無ければ null", () => {
    // グリフ 2 の右端（画面 x = 260）から 3px 右
    expect(glyphAt(ROW, [263, 176], toScreen, 4)).toBe(2);
    expect(glyphAt(ROW, [270, 176], toScreen, 4)).toBeNull();
    expect(glyphAt(ROW, [230, 100], toScreen, 4)).toBeNull();
  });

  it("回転した（斜めの）グリフでも、四隅の多角形で判定する", () => {
    // 45 度回転した正方形（中心 0,0）
    const diamond = glyph([0, -10, 10, 0, 0, 10, -10, 0]);
    const identity: PointMapper = (x, y) => [x, y];
    expect(glyphAt([diamond], [0, 0], identity)).toBe(0);
    expect(glyphAt([diamond], [8, 8], identity, 0)).toBeNull();
  });
});

describe("selectionRect（選択範囲を囲む画面上の矩形）", () => {
  it("範囲内のグリフの四隅をすべて含む最小の矩形を返す", () => {
    expect(selectionRect(ROW, 0, 2, toScreen)).toEqual({
      left: 200,
      top: 164,
      width: 40,
      height: 24,
    });
    expect(selectionRect(ROW, 2, 3, toScreen)).toEqual({
      left: 240,
      top: 164,
      width: 20,
      height: 24,
    });
  });

  it("空の範囲は null", () => {
    expect(selectionRect(ROW, 1, 1, toScreen)).toBeNull();
  });
});
