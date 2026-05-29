import { describe, it, expect } from "vitest";
import {
  applyOperation,
  createInitialPages,
  derivePages,
  normalizeRotation,
  type PageRef,
} from "./operations";

const mk = (id: string, sourceIndex: number, rotation = 0): PageRef => ({
  id,
  sourceId: "s",
  sourceIndex,
  rotation,
});

const ids = (pages: PageRef[]) => pages.map((p) => p.id);

describe("normalizeRotation", () => {
  it("90 の倍数で [0,360) に正規化する", () => {
    expect(normalizeRotation(0)).toBe(0);
    expect(normalizeRotation(360)).toBe(0);
    expect(normalizeRotation(450)).toBe(90);
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(-360)).toBe(0);
  });
});

describe("createInitialPages", () => {
  it("ページ数分の連番エントリを回転 0 で生成する", () => {
    let n = 0;
    const pages = createInitialPages("doc1", 3, () => `p${n++}`);
    expect(pages).toEqual([
      { id: "p0", sourceId: "doc1", sourceIndex: 0, rotation: 0 },
      { id: "p1", sourceId: "doc1", sourceIndex: 1, rotation: 0 },
      { id: "p2", sourceId: "doc1", sourceIndex: 2, rotation: 0 },
    ]);
  });

  it("0 ページなら空配列", () => {
    expect(createInitialPages("d", 0)).toEqual([]);
  });
});

describe("applyOperation: reorder", () => {
  const base = [mk("a", 0), mk("b", 1), mk("c", 2), mk("d", 3)];

  it("単一ページを先頭へ移動", () => {
    const r = applyOperation(base, { type: "reorder", ids: ["b"], toIndex: 0 });
    expect(ids(r)).toEqual(["b", "a", "c", "d"]);
  });

  it("複数ページを相対順を保って移動", () => {
    const r = applyOperation(base, {
      type: "reorder",
      ids: ["a", "c"],
      toIndex: 1,
    });
    expect(ids(r)).toEqual(["b", "a", "c", "d"]);
  });

  it("toIndex は除去後配列の範囲にクランプ", () => {
    const r = applyOperation(base, {
      type: "reorder",
      ids: ["a"],
      toIndex: 99,
    });
    expect(ids(r)).toEqual(["b", "c", "d", "a"]);
  });
});

describe("applyOperation: rotate", () => {
  const base = [mk("a", 0), mk("b", 1, 90)];

  it("対象のみ回転を加算・正規化する", () => {
    const r = applyOperation(base, { type: "rotate", ids: ["b"], delta: 90 });
    expect(r[1]!.rotation).toBe(180);
    expect(r[0]!.rotation).toBe(0);
  });

  it("負の回転も正規化", () => {
    const r = applyOperation(base, { type: "rotate", ids: ["a"], delta: -90 });
    expect(r[0]!.rotation).toBe(270);
  });

  it("360 度で 0 に戻る", () => {
    let r = applyOperation(base, { type: "rotate", ids: ["a"], delta: 270 });
    r = applyOperation(r, { type: "rotate", ids: ["a"], delta: 90 });
    expect(r[0]!.rotation).toBe(0);
  });
});

describe("applyOperation: delete / merge", () => {
  const base = [mk("a", 0), mk("b", 1), mk("c", 2)];

  it("delete は対象を除去", () => {
    const r = applyOperation(base, { type: "delete", ids: ["a", "c"] });
    expect(ids(r)).toEqual(["b"]);
  });

  it("merge は index に挿入", () => {
    const r = applyOperation(base, {
      type: "merge",
      index: 1,
      pages: [mk("x", 0), mk("y", 1)],
    });
    expect(ids(r)).toEqual(["a", "x", "y", "b", "c"]);
  });
});

describe("derivePages", () => {
  it("操作ログを順に畳み込む（合成順序が反映される）", () => {
    const initial = [mk("a", 0), mk("b", 1), mk("c", 2)];
    const result = derivePages(initial, [
      { type: "rotate", ids: ["a"], delta: 90 },
      { type: "delete", ids: ["b"] },
      { type: "reorder", ids: ["a"], toIndex: 1 },
    ]);
    expect(ids(result)).toEqual(["c", "a"]);
    expect(result.find((p) => p.id === "a")!.rotation).toBe(90);
  });

  it("元の配列を破壊しない", () => {
    const initial = [mk("a", 0), mk("b", 1)];
    derivePages(initial, [{ type: "delete", ids: ["a"] }]);
    expect(ids(initial)).toEqual(["a", "b"]);
  });
});
