import { describe, it, expect } from "vitest";
import type { OutlineNode } from "@/lib/pdf/outline";
import {
  addChild,
  addNode,
  createNode,
  fromResolved,
  indent,
  moveDown,
  moveUp,
  outdent,
  removeNode,
  renameNode,
  toBuildNodes,
  type EditableOutlineNode,
} from "./edit";

/** テスト用に決定的なツリーを組み立てる（createId に依存しない）。 */
function node(
  id: string,
  title: string,
  children: EditableOutlineNode[] = [],
  sourceIndex: number | null = 0,
): EditableOutlineNode {
  return { id, title, sourceId: "A", sourceIndex, children };
}

/** ツリーを {id: [childIds]} の浅い形へ落として構造を比較しやすくする。 */
function shape(nodes: EditableOutlineNode[]): unknown {
  return nodes.map((n) => ({ id: n.id, children: shape(n.children) }));
}

describe("createNode", () => {
  it("一意 ID・空の子・指定の宛先を持つノードを作る", () => {
    const a = createNode({ title: "A", sourceId: "S", sourceIndex: 3 });
    const b = createNode({ title: "B", sourceId: "S", sourceIndex: null });
    expect(a.title).toBe("A");
    expect(a.sourceIndex).toBe(3);
    expect(a.children).toEqual([]);
    expect(b.sourceIndex).toBeNull();
    expect(a.id).not.toBe(b.id); // 一意
  });
});

describe("fromResolved / toBuildNodes", () => {
  it("OutlineNode に sourceId を付与して編集ツリー化する", () => {
    const resolved: OutlineNode[] = [
      {
        id: "x",
        title: "Ch1",
        sourceIndex: 0,
        children: [{ id: "y", title: "S1", sourceIndex: 2, children: [] }],
      },
    ];
    const tree = fromResolved(resolved, "SRC");
    expect(tree[0]!.sourceId).toBe("SRC");
    expect(tree[0]!.children[0]!.sourceId).toBe("SRC");
    expect(tree[0]!.children[0]!.sourceIndex).toBe(2);
  });

  it("toBuildNodes は id を落とし title/sourceId/sourceIndex/children を保つ", () => {
    const tree = [node("a", "A", [node("b", "B", [], 5)], 1)];
    expect(toBuildNodes(tree)).toEqual([
      {
        title: "A",
        sourceId: "A",
        sourceIndex: 1,
        children: [{ title: "B", sourceId: "A", sourceIndex: 5, children: [] }],
      },
    ]);
  });
});

describe("renameNode", () => {
  it("ネストしたノードのタイトルだけを変える（不変）", () => {
    const tree = [node("a", "A", [node("b", "B")])];
    const out = renameNode(tree, "b", "B2");
    expect(out[0]!.children[0]!.title).toBe("B2");
    expect(out[0]!.title).toBe("A");
    expect(out).not.toBe(tree); // 新しい配列
  });

  it("存在しない ID ではツリーが変化しない", () => {
    const tree = [node("a", "A", [node("b", "B")])];
    expect(renameNode(tree, "zzz", "X")).toEqual(tree);
  });
});

describe("removeNode", () => {
  it("子孫ごと削除する", () => {
    const tree = [node("a", "A", [node("b", "B")]), node("c", "C")];
    expect(shape(removeNode(tree, "a"))).toEqual([{ id: "c", children: [] }]);
  });

  it("ネストした子だけを削除する", () => {
    const tree = [node("a", "A", [node("b", "B"), node("c", "C")])];
    expect(shape(removeNode(tree, "b"))).toEqual([
      { id: "a", children: [{ id: "c", children: [] }] },
    ]);
  });
});

describe("addNode", () => {
  it("afterId=null でルート末尾へ追加", () => {
    const tree = [node("a", "A")];
    const out = addNode(tree, null, node("n", "N"));
    expect(out.map((n) => n.id)).toEqual(["a", "n"]);
  });

  it("指定兄弟の直後へ挿入（ネスト）", () => {
    const tree = [node("a", "A", [node("b", "B"), node("c", "C")])];
    const out = addNode(tree, "b", node("n", "N"));
    expect(out[0]!.children.map((n) => n.id)).toEqual(["b", "n", "c"]);
  });
});

describe("addChild", () => {
  it("親の子の末尾へ追加", () => {
    const tree = [node("a", "A", [node("b", "B")])];
    const out = addChild(tree, "a", node("n", "N"));
    expect(out[0]!.children.map((n) => n.id)).toEqual(["b", "n"]);
  });
});

describe("moveUp / moveDown", () => {
  const tree = () => [node("a", "A"), node("b", "B"), node("c", "C")];

  it("兄弟内で上下に入れ替える", () => {
    expect(moveUp(tree(), "b").map((n) => n.id)).toEqual(["b", "a", "c"]);
    expect(moveDown(tree(), "b").map((n) => n.id)).toEqual(["a", "c", "b"]);
  });

  it("端では移動しない（同一参照）", () => {
    const t = tree();
    expect(moveUp(t, "a")).toBe(t);
    expect(moveDown(t, "c")).toBe(t);
  });

  it("ネストした兄弟内でも動く", () => {
    const t = [node("p", "P", [node("a", "A"), node("b", "B")])];
    const out = moveDown(t, "a");
    expect(out[0]!.children.map((n) => n.id)).toEqual(["b", "a"]);
  });
});

describe("indent", () => {
  it("直前の兄弟の子末尾へ移す", () => {
    const tree = [node("a", "A", [node("x", "X")]), node("b", "B")];
    const out = indent(tree, "b");
    expect(shape(out)).toEqual([
      {
        id: "a",
        children: [
          { id: "x", children: [] },
          { id: "b", children: [] },
        ],
      },
    ]);
  });

  it("先頭（直前の兄弟が無い）では変化しない", () => {
    const tree = [node("a", "A"), node("b", "B")];
    expect(indent(tree, "a")).toBe(tree);
  });
});

describe("outdent", () => {
  it("親の直後の兄弟へ繰り上げる", () => {
    const tree = [
      node("p", "P", [node("a", "A"), node("b", "B")]),
      node("q", "Q"),
    ];
    const out = outdent(tree, "a");
    expect(shape(out)).toEqual([
      { id: "p", children: [{ id: "b", children: [] }] },
      { id: "a", children: [] },
      { id: "q", children: [] },
    ]);
  });

  it("ルート直下（親が無い）では変化しない", () => {
    const tree = [node("a", "A"), node("b", "B")];
    const out = outdent(tree, "a");
    expect(shape(out)).toEqual(shape(tree)); // 構造不変
  });

  it("indent → outdent で元の構造に戻る（往復）", () => {
    const tree = [node("a", "A"), node("b", "B")];
    const indented = indent(tree, "b"); // b を a の子へ
    const back = outdent(indented, "b"); // b を a の兄弟へ戻す
    expect(shape(back)).toEqual(shape(tree));
  });
});
