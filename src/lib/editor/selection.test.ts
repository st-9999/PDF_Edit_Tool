import { describe, it, expect } from "vitest";
import {
  clearSelection,
  collapseToSingle,
  emptySelection,
  selectAll,
  selectRange,
  selectSingle,
  toggle,
} from "./selection";

const order = ["a", "b", "c", "d", "e"];
const arr = (s: { selected: ReadonlySet<string> }) => [...s.selected].sort();

describe("selectSingle", () => {
  it("単一選択して anchor を設定", () => {
    const s = selectSingle("c");
    expect(arr(s)).toEqual(["c"]);
    expect(s.anchor).toBe("c");
  });
});

describe("toggle (Ctrl)", () => {
  it("未選択は追加・選択済みは解除", () => {
    let s = selectSingle("a");
    s = toggle(s, "c");
    expect(arr(s)).toEqual(["a", "c"]);
    s = toggle(s, "a");
    expect(arr(s)).toEqual(["c"]);
    expect(s.anchor).toBe("a");
  });
});

describe("selectRange (Shift)", () => {
  it("anchor から順方向の範囲を選択", () => {
    const s = selectRange(selectSingle("b"), order, "d");
    expect(arr(s)).toEqual(["b", "c", "d"]);
    expect(s.anchor).toBe("b");
  });

  it("逆方向でも範囲を選択し anchor を維持", () => {
    const s = selectRange(selectSingle("d"), order, "a");
    expect(arr(s)).toEqual(["a", "b", "c", "d"]);
    expect(s.anchor).toBe("d");
  });

  it("anchor 未設定なら単一選択にフォールバック", () => {
    const s = selectRange(emptySelection(), order, "c");
    expect(arr(s)).toEqual(["c"]);
    expect(s.anchor).toBe("c");
  });

  it("範囲再選択は前の範囲を置き換える", () => {
    let s = selectRange(selectSingle("a"), order, "c"); // a,b,c
    s = selectRange(s, order, "b"); // anchor a → a,b
    expect(arr(s)).toEqual(["a", "b"]);
  });
});

describe("selectAll / clear", () => {
  it("全選択は全 ID・anchor は先頭", () => {
    const s = selectAll(order);
    expect(arr(s)).toEqual(["a", "b", "c", "d", "e"]);
    expect(s.anchor).toBe("a");
  });

  it("clear は空集合", () => {
    expect(arr(clearSelection())).toEqual([]);
    expect(clearSelection().anchor).toBeNull();
  });
});

describe("collapseToSingle (複数選択モード解除)", () => {
  it("preferId が選択中ならそれを残す", () => {
    const s = selectAll(order); // a..e, anchor=a
    const r = collapseToSingle(s, order, "c");
    expect(arr(r)).toEqual(["c"]);
    expect(r.anchor).toBe("c");
  });

  it("preferId 未指定なら anchor を残す", () => {
    const s = selectRange(selectSingle("b"), order, "d"); // b,c,d anchor=b
    const r = collapseToSingle(s, order);
    expect(arr(r)).toEqual(["b"]);
    expect(r.anchor).toBe("b");
  });

  it("preferId が選択外・anchor も選択外なら並び順で先頭の選択を残す", () => {
    // c,d を選択（anchor は選択外の状態を作る）
    const s = { selected: new Set(["d", "c"]), anchor: "x" };
    const r = collapseToSingle(s, order, "a");
    expect(arr(r)).toEqual(["c"]);
    expect(r.anchor).toBe("c");
  });

  it("選択が 1 件以下なら現状維持", () => {
    const single = selectSingle("b");
    expect(collapseToSingle(single, order)).toBe(single);
    const empty = emptySelection();
    expect(collapseToSingle(empty, order)).toBe(empty);
  });
});
