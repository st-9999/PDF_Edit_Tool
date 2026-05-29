import { describe, it, expect } from "vitest";
import {
  applyToHistory,
  canRedo,
  canUndo,
  createHistory,
  currentPages,
  isDirty,
  redoHistory,
  undoHistory,
} from "./history";
import type { PageRef } from "./operations";

const mk = (id: string, sourceIndex: number, rotation = 0): PageRef => ({
  id,
  sourceId: "s",
  sourceIndex,
  rotation,
});
const ids = (pages: PageRef[]) => pages.map((p) => p.id);
const initial = [mk("a", 0), mk("b", 1), mk("c", 2)];

describe("EditHistory", () => {
  it("初期状態は dirty でなく undo/redo 不可", () => {
    const h = createHistory(initial);
    expect(isDirty(h)).toBe(false);
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
    expect(currentPages(h)).toEqual(initial);
  });

  it("操作→Undo で元状態に戻る", () => {
    const h0 = createHistory(initial);
    const h1 = applyToHistory(h0, { type: "delete", ids: ["b"] });
    expect(ids(currentPages(h1))).toEqual(["a", "c"]);
    expect(isDirty(h1)).toBe(true);

    const h2 = undoHistory(h1);
    expect(ids(currentPages(h2))).toEqual(["a", "b", "c"]);
    expect(isDirty(h2)).toBe(false);
    expect(canRedo(h2)).toBe(true);
  });

  it("Undo→Redo で再適用される", () => {
    let h = createHistory(initial);
    h = applyToHistory(h, { type: "rotate", ids: ["a"], delta: 90 });
    h = undoHistory(h);
    expect(currentPages(h)[0]!.rotation).toBe(0);
    h = redoHistory(h);
    expect(currentPages(h)[0]!.rotation).toBe(90);
  });

  it("複数操作の Undo は逆順で 1 段ずつ戻る", () => {
    let h = createHistory(initial);
    h = applyToHistory(h, { type: "rotate", ids: ["a"], delta: 90 });
    h = applyToHistory(h, { type: "delete", ids: ["b"] });
    expect(ids(currentPages(h))).toEqual(["a", "c"]);

    h = undoHistory(h); // delete を取り消し
    expect(ids(currentPages(h))).toEqual(["a", "b", "c"]);
    expect(currentPages(h)[0]!.rotation).toBe(90);

    h = undoHistory(h); // rotate を取り消し
    expect(currentPages(h)[0]!.rotation).toBe(0);
  });

  it("Undo 後に新規操作するとやり直しスタックが破棄される", () => {
    let h = createHistory(initial);
    h = applyToHistory(h, { type: "delete", ids: ["a"] });
    h = undoHistory(h);
    expect(canRedo(h)).toBe(true);
    h = applyToHistory(h, { type: "delete", ids: ["c"] });
    expect(canRedo(h)).toBe(false);
    expect(ids(currentPages(h))).toEqual(["a", "b"]);
  });

  it("空履歴の undo/redo は no-op", () => {
    const h = createHistory(initial);
    expect(undoHistory(h)).toEqual(h);
    expect(redoHistory(h)).toEqual(h);
  });
});
