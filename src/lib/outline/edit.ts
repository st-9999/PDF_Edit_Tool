import { createId } from "@/lib/id";
import type { BuildOutlineNode } from "@/lib/editor/build";
import type { OutlineNode } from "@/lib/pdf/outline";

/**
 * 編集可能なしおり（アウトライン）ノード。
 * - `sourceId` + `sourceIndex` で宛先ページを表す（保存時に出力ページへ再マッピング）
 * - `sourceIndex` が null は宛先なしの見出し
 * すべての編集操作は純関数で、新しいツリー（不変）を返す。
 */
export interface EditableOutlineNode {
  id: string;
  title: string;
  sourceId: string;
  sourceIndex: number | null;
  children: EditableOutlineNode[];
}

/** 新規ノードを生成する（一意 ID を付与）。 */
export function createNode(input: {
  title: string;
  sourceId: string;
  sourceIndex: number | null;
}): EditableOutlineNode {
  return {
    id: createId("outline"),
    title: input.title,
    sourceId: input.sourceId,
    sourceIndex: input.sourceIndex,
    children: [],
  };
}

/** 解決済みアウトライン（read 用 OutlineNode）に sourceId を付与して編集ツリーへ変換。 */
export function fromResolved(
  nodes: OutlineNode[],
  sourceId: string,
): EditableOutlineNode[] {
  return nodes.map((n) => ({
    id: n.id,
    title: n.title,
    sourceId,
    sourceIndex: n.sourceIndex,
    children: fromResolved(n.children, sourceId),
  }));
}

/** 編集ツリーを保存用ツリー（BuildOutlineNode）へ変換する（id を除去）。 */
export function toBuildNodes(nodes: EditableOutlineNode[]): BuildOutlineNode[] {
  return nodes.map((n) => ({
    title: n.title,
    sourceId: n.sourceId,
    sourceIndex: n.sourceIndex,
    children: toBuildNodes(n.children),
  }));
}

/** 指定 ID のタイトルを変更する。 */
export function renameNode(
  nodes: EditableOutlineNode[],
  id: string,
  title: string,
): EditableOutlineNode[] {
  return nodes.map((n) => {
    if (n.id === id) return { ...n, title };
    const children = renameNode(n.children, id, title);
    return children === n.children ? n : { ...n, children };
  });
}

/** 指定 ID のノード（とその子孫）を削除する。 */
export function removeNode(
  nodes: EditableOutlineNode[],
  id: string,
): EditableOutlineNode[] {
  const out: EditableOutlineNode[] = [];
  for (const n of nodes) {
    if (n.id === id) continue;
    const children = removeNode(n.children, id);
    out.push(children === n.children ? n : { ...n, children });
  }
  return out;
}

/**
 * 兄弟として `afterId` の直後に挿入する。`afterId` が null のときは
 * ルート末尾へ追加する。`afterId` が見つからない場合は変化しない。
 */
export function addNode(
  nodes: EditableOutlineNode[],
  afterId: string | null,
  newNode: EditableOutlineNode,
): EditableOutlineNode[] {
  if (afterId === null) return [...nodes, newNode];
  const out: EditableOutlineNode[] = [];
  for (const n of nodes) {
    const children = addNode(n.children, afterId, newNode);
    out.push(children === n.children ? n : { ...n, children });
    if (n.id === afterId) out.push(newNode);
  }
  return out;
}

/** `parentId` の子の末尾へ追加する。見つからなければ変化しない。 */
export function addChild(
  nodes: EditableOutlineNode[],
  parentId: string,
  newNode: EditableOutlineNode,
): EditableOutlineNode[] {
  return nodes.map((n) => {
    if (n.id === parentId) {
      return { ...n, children: [...n.children, newNode] };
    }
    const children = addChild(n.children, parentId, newNode);
    return children === n.children ? n : { ...n, children };
  });
}

/** 同じ親の中で兄弟の前後へ移動する（dir=-1 上 / dir=+1 下）。端では変化しない。 */
function moveWithinSiblings(
  nodes: EditableOutlineNode[],
  id: string,
  dir: -1 | 1,
): EditableOutlineNode[] {
  const i = nodes.findIndex((n) => n.id === id);
  if (i !== -1) {
    const j = i + dir;
    if (j < 0 || j >= nodes.length) return nodes; // 端：移動なし
    const copy = [...nodes];
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
    return copy;
  }
  return nodes.map((n) => {
    const children = moveWithinSiblings(n.children, id, dir);
    return children === n.children ? n : { ...n, children };
  });
}

export function moveUp(
  nodes: EditableOutlineNode[],
  id: string,
): EditableOutlineNode[] {
  return moveWithinSiblings(nodes, id, -1);
}

export function moveDown(
  nodes: EditableOutlineNode[],
  id: string,
): EditableOutlineNode[] {
  return moveWithinSiblings(nodes, id, 1);
}

/**
 * インデント（階層を 1 段下げる）: 直前の兄弟の子の末尾へ移動する。
 * 先頭（直前の兄弟が無い）では変化しない。
 */
export function indent(
  nodes: EditableOutlineNode[],
  id: string,
): EditableOutlineNode[] {
  const i = nodes.findIndex((n) => n.id === id);
  if (i !== -1) {
    if (i === 0) return nodes; // 直前の兄弟が無い
    const node = nodes[i]!;
    const prev = nodes[i - 1]!;
    const newPrev = { ...prev, children: [...prev.children, node] };
    return [...nodes.slice(0, i - 1), newPrev, ...nodes.slice(i + 1)];
  }
  return nodes.map((n) => {
    const children = indent(n.children, id);
    return children === n.children ? n : { ...n, children };
  });
}

/**
 * アウトデント（階層を 1 段上げる）: 親の兄弟として親の直後へ移動する。
 * ルート直下（親が無い）では変化しない。
 */
export function outdent(
  nodes: EditableOutlineNode[],
  id: string,
): EditableOutlineNode[] {
  const out: EditableOutlineNode[] = [];
  for (const n of nodes) {
    const ci = n.children.findIndex((c) => c.id === id);
    if (ci !== -1) {
      const child = n.children[ci]!;
      const newParent = {
        ...n,
        children: [...n.children.slice(0, ci), ...n.children.slice(ci + 1)],
      };
      out.push(newParent);
      out.push(child); // 親の直後の兄弟になる
    } else {
      const children = outdent(n.children, id);
      out.push(children === n.children ? n : { ...n, children });
    }
  }
  return out;
}
