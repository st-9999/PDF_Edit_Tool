import { describe, it, expect } from "vitest";
import { followScrollDelta } from "./follow-scroll";

// コンテナ: 可視 top=100, 高さ=400（=> 可視範囲 100..500）。要素高さ=50。
const VIEW_TOP = 100;
const VIEW_HEIGHT = 400;
const ELEM_HEIGHT = 50;

describe("followScrollDelta", () => {
  it("要素が完全に見えていれば 0（スクロールしない）", () => {
    // 要素 top=200 => 範囲 200..250、可視内
    expect(followScrollDelta(VIEW_TOP, VIEW_HEIGHT, 200, ELEM_HEIGHT)).toBe(0);
  });

  it("要素が下に外れていれば正の差分（下へスクロール）で中央へ寄せる", () => {
    // 要素 top=700 => 範囲 700..750、下に外れ
    const delta = followScrollDelta(VIEW_TOP, VIEW_HEIGHT, 700, ELEM_HEIGHT);
    // relativeTop(600) - (400-50)/2(175) = 425
    expect(delta).toBe(425);
    expect(delta).toBeGreaterThan(0);
  });

  it("要素が上に外れていれば負の差分（上へスクロール）で中央へ寄せる", () => {
    // 要素 top=20 => 範囲 20..70、上に外れ（relativeTop=-80）
    const delta = followScrollDelta(VIEW_TOP, VIEW_HEIGHT, 20, ELEM_HEIGHT);
    // -80 - 175 = -255
    expect(delta).toBe(-255);
    expect(delta).toBeLessThan(0);
  });

  it("中央寄せ後は対象が可視領域中央に来る（差分適用で relativeTop が中央値になる）", () => {
    const elemTop = 700;
    const delta = followScrollDelta(
      VIEW_TOP,
      VIEW_HEIGHT,
      elemTop,
      ELEM_HEIGHT,
    );
    // scrollTop に delta を足す = 可視 top が delta だけ下がるのと等価。
    // 適用後の要素の相対位置 = (elemTop - (VIEW_TOP + delta))
    const relativeAfter = elemTop - (VIEW_TOP + delta);
    expect(relativeAfter).toBe((VIEW_HEIGHT - ELEM_HEIGHT) / 2);
  });

  it("要素がコンテナより高い場合も中央寄せの差分を返す（0 ではない）", () => {
    // 要素高さ=500 > 可視 400、top=120（一部見え）。relativeTop=20>=0 だが
    // 20+500=520 > 400 なので「完全に見えてはいない」=> 中央寄せ
    const delta = followScrollDelta(VIEW_TOP, VIEW_HEIGHT, 120, 500);
    expect(delta).not.toBe(0);
    // 20 - (400-500)/2 = 20 - (-50) = 70
    expect(delta).toBe(70);
  });
});
