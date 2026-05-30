import { describe, it, expect } from "vitest";
import type { EditableOutlineNode } from "./edit";
import { arrayMove } from "@dnd-kit/sortable";
import {
  buildTree,
  flattenTree,
  getDescendantIds,
  getProjection,
  removeChildrenOf,
} from "./tree-dnd";

/** UI の handleDragEnd と同じ手順でドロップ後ツリーを再構築する。 */
function applyDrag(
  nodes: EditableOutlineNode[],
  activeId: string,
  overId: string,
  offset: number,
  indent = 24,
): EditableOutlineNode[] {
  const visible = removeChildrenOf(flattenTree(nodes), [activeId]);
  const proj = getProjection(visible, activeId, overId, offset, indent);
  if (!proj) return nodes;
  const clone = flattenTree(nodes);
  const ai = clone.findIndex((i) => i.id === activeId);
  const oi = clone.findIndex((i) => i.id === overId);
  clone[ai] = { ...clone[ai]!, depth: proj.depth, parentId: proj.parentId };
  return buildTree(arrayMove(clone, ai, oi));
}

function node(
  id: string,
  children: EditableOutlineNode[] = [],
): EditableOutlineNode {
  return {
    id,
    title: id.toUpperCase(),
    sourceId: "A",
    sourceIndex: 0,
    children,
  };
}

/** a > (b > (c), d) , e の 3 階層ツリー。 */
const tree = (): EditableOutlineNode[] => [
  node("a", [node("b", [node("c")]), node("d")]),
  node("e"),
];

describe("flattenTree / buildTree", () => {
  it("pre-order で平坦化し depth/parentId を付ける", () => {
    const flat = flattenTree(tree());
    expect(flat.map((f) => [f.id, f.depth, f.parentId])).toEqual([
      ["a", 0, null],
      ["b", 1, "a"],
      ["c", 2, "b"],
      ["d", 1, "a"],
      ["e", 0, null],
    ]);
  });

  it("flatten→build で元のツリー構造に戻る（往復）", () => {
    expect(buildTree(flattenTree(tree()))).toEqual(tree());
  });

  it("buildTree は parentId で親子を対応付け、順序を保つ", () => {
    const flat = flattenTree(tree());
    // d を a の子から外して b の子へ付け替える（parentId 変更）
    const moved = flat.map((f) =>
      f.id === "d" ? { ...f, parentId: "b", depth: 2 } : f,
    );
    const rebuilt = buildTree(moved);
    expect(rebuilt).toEqual([
      node("a", [node("b", [node("c"), node("d")])]),
      node("e"),
    ]);
  });
});

describe("getDescendantIds / removeChildrenOf", () => {
  it("子孫 ID を列挙する（自身は含まない）", () => {
    const flat = flattenTree(tree());
    expect(getDescendantIds(flat, "a").sort()).toEqual(["b", "c", "d"]);
    expect(getDescendantIds(flat, "b")).toEqual(["c"]);
    expect(getDescendantIds(flat, "e")).toEqual([]);
  });

  it("removeChildrenOf はつかんだ枝の子孫を除外する（自身は残す）", () => {
    const flat = flattenTree(tree());
    const ids = removeChildrenOf(flat, ["a"]).map((f) => f.id);
    expect(ids).toEqual(["a", "e"]);
  });
});

describe("getProjection", () => {
  // 平坦リスト: a(0), b(1,a), c(2,b), d(1,a), e(0) からつかんだ枝の子孫を除いて使う
  const items = () => removeChildrenOf(flattenTree(tree()), []);

  it("右ドラッグで 1 段深くなり、直前アイテムが親になる", () => {
    // e を d の直後（同位置）に置き、右へ 1 段 → d の子（depth 2, parent d）
    const proj = getProjection(items(), "e", "e", 100, 24);
    // e の直前は d(depth1)。maxDepth = 2。projectedDepth = 0 + round(100/24)=4 → clamp 2
    expect(proj).toEqual({
      depth: 2,
      maxDepth: 2,
      minDepth: 0,
      parentId: "d",
    });
  });

  it("オフセット 0 で over の手前に置くと、その文脈の深さ・親になる", () => {
    // d を b の位置（b の手前）へドラッグ（over=b, offset 0）。
    // 並べ替え後の直前は a(0) → maxDepth=1、projectedDepth=1 → depth1・parent=a（b の兄弟）
    const proj = getProjection(items(), "d", "b", 0, 24);
    expect(proj?.depth).toBe(1);
    expect(proj?.parentId).toBe("a");
  });

  it("左ドラッグでルート（depth 0・parent null）になる", () => {
    // c を e の位置へ。left に大きく振る → depth 0
    const proj = getProjection(items(), "c", "e", -200, 24);
    expect(proj?.depth).toBe(0);
    expect(proj?.parentId).toBeNull();
  });

  it("不明な id では null", () => {
    expect(getProjection(items(), "zzz", "a", 0, 24)).toBeNull();
  });
});

describe("ドラッグ適用（再構築の統合）", () => {
  it("横ドラッグで末尾の e を直前の d の子へ（階層を下げる）", () => {
    // e は位置そのまま（over=e）＋右オフセットで直上 d の子になる
    const out = applyDrag(tree(), "e", "e", 100);
    expect(out).toEqual([
      node("a", [node("b", [node("c")]), node("d", [node("e")])]),
    ]);
  });

  it("縦ドラッグで順序だけ入れ替えられる（階層は維持）", () => {
    // e をルート先頭 a の位置へ、オフセット 0 → ルートのまま順序入替
    const out = applyDrag(tree(), "e", "a", 0);
    expect(out.map((n) => n.id)).toEqual(["e", "a"]);
    // a の子構造は保持
    expect(out[1]!.children.map((n) => n.id)).toEqual(["b", "d"]);
  });

  it("枝（子を持つノード）を動かすと子も一緒に移動する", () => {
    // b（c を持つ）を e の子へ
    const out = applyDrag(tree(), "b", "e", 100);
    // a は d のみ、e の下に b>(c)
    expect(out).toEqual([
      node("a", [node("d")]),
      node("e", [node("b", [node("c")])]),
    ]);
  });
});
