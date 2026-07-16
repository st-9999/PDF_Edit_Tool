import { describe, expect, it } from "vitest";
import { computeFitScale } from "@/lib/pdf/render";

/** サムネイルの基準幅（px）。`THUMBNAIL_WIDTH` の既定値と同じ前提で検証する。 */
const WIDTH = 140;
/** サムネイルセルの縦横比（A4 縦相当）。`thumbnail.tsx` の THUMBNAIL_ASPECT と同値。 */
const ASPECT = 1.414;

/** サムネイルの描画実寸（CSS px）を、ページ実寸とセル寸法から求める。 */
function thumbnailBox(pageWidth: number, pageHeight: number) {
  const scale = computeFitScale(
    pageWidth,
    pageHeight,
    "page",
    WIDTH,
    WIDTH * ASPECT,
  );
  return { w: pageWidth * scale, h: pageHeight * scale };
}

describe("computeFitScale", () => {
  it("width モードでは高さを無視して幅いっぱいに合わせる", () => {
    expect(computeFitScale(500, 1000, "width", 250, 100)).toBe(0.5);
  });

  it("page モードでは幅・高さの両方が収まる小さい方のスケールを選ぶ", () => {
    // 幅基準 250/500=0.5、高さ基準 100/1000=0.1 → 小さい 0.1
    expect(computeFitScale(500, 1000, "page", 250, 100)).toBe(0.1);
  });

  it("padding を左右上下ぶん差し引いてから計算する", () => {
    // 利用可能幅 = 250 - 25*2 = 200 → 200/500 = 0.4
    expect(computeFitScale(500, 1000, "width", 250, 100, 25)).toBe(0.4);
  });

  it("コンテナが padding より小さくても 0 以下のスケールを返さない", () => {
    expect(computeFitScale(500, 1000, "width", 10, 10, 20)).toBeGreaterThan(0);
  });
});

describe("サムネイルのセル収め（A3 横のはみ出し防止）", () => {
  it("A4 縦は従来どおり基準幅いっぱいに描画される", () => {
    // 実際の A4（595×842）の比は 1.41513 で、セル比 1.414 よりわずかに縦長。
    // よって高さ側が上限に張り付き、幅は 140px をごくわずかに下回る（139.89px＝差 0.11px）。
    // 見た目は従来と変わらないが、セルから溢れないことが重要。
    const box = thumbnailBox(595, 842);
    expect(box.w).toBeLessThanOrEqual(WIDTH);
    expect(box.w).toBeGreaterThan(WIDTH - 1);
    expect(box.h).toBeCloseTo(WIDTH * ASPECT, 1);
  });

  it("A3 横は基準幅を超えない（旧実装では 198px になり隣と重なっていた）", () => {
    const box = thumbnailBox(1191, 842);
    expect(box.w).toBeCloseTo(WIDTH, 1);
    expect(box.h).toBeCloseTo(99, 0);
    // 回帰の要点: 短辺基準だと width*1.414 = 198px にふくらんでいた
    expect(box.w).toBeLessThanOrEqual(WIDTH);
  });

  it("縦横比が極端なページでも幅・高さの両方がセル内に収まる", () => {
    const cases: Array<[number, number]> = [
      [595, 842], // A4 縦
      [842, 595], // A4 横
      [1191, 842], // A3 横
      [842, 1191], // A3 縦
      [2000, 200], // 極端な横長
      [200, 2000], // 極端な縦長
    ];
    for (const [w, h] of cases) {
      const box = thumbnailBox(w, h);
      expect(box.w).toBeLessThanOrEqual(WIDTH + 0.01);
      expect(box.h).toBeLessThanOrEqual(WIDTH * ASPECT + 0.01);
      // アスペクト比が保たれている
      expect(box.w / box.h).toBeCloseTo(w / h, 5);
    }
  });

  it("サムネ幅を拡大しても実寸は基準幅に比例して収まる", () => {
    for (const width of [70, 140, 420]) {
      const scale = computeFitScale(1191, 842, "page", width, width * ASPECT);
      expect(1191 * scale).toBeLessThanOrEqual(width + 0.01);
    }
  });
});
