import { nanoid } from "nanoid";
import type { BookmarkNode } from "@/types/pdf";

/** 新しい空のしおりノードを作成 */
export function createBookmarkNode(
  title = "新しいしおり",
  pageNumber = 1
): BookmarkNode {
  return {
    id: nanoid(),
    title,
    pageNumber,
    children: [],
  };
}

/** ツリー内の指定ノードの後ろに兄弟ノードを追加 */
export function addSibling(
  tree: BookmarkNode[],
  targetId: string
): BookmarkNode[] {
  const result: BookmarkNode[] = [];
  for (const node of tree) {
    result.push(node);
    if (node.id === targetId) {
      result.push(createBookmarkNode());
    } else {
      // 子にターゲットがあるかもしれないので再帰
      const updatedChildren = addSibling(node.children, targetId);
      if (updatedChildren !== node.children) {
        result[result.length - 1] = { ...node, children: updatedChildren };
      }
    }
  }
  // 参照が変わっていなければ元の配列を返す（変更なし検出用）
  if (result.length === tree.length && result.every((n, i) => n === tree[i])) {
    return tree;
  }
  return result;
}

/** 指定ノードの子として新しいノードを追加 */
export function addChild(
  tree: BookmarkNode[],
  parentId: string
): BookmarkNode[] {
  return tree.map((node) => {
    if (node.id === parentId) {
      return {
        ...node,
        children: [...node.children, createBookmarkNode()],
      };
    }
    const updatedChildren = addChild(node.children, parentId);
    if (updatedChildren !== node.children) {
      return { ...node, children: updatedChildren };
    }
    return node;
  });
}

/** ツリーからノードを削除（子も含む） */
export function removeNode(
  tree: BookmarkNode[],
  targetId: string
): BookmarkNode[] {
  const result: BookmarkNode[] = [];
  for (const node of tree) {
    if (node.id === targetId) continue;
    const updatedChildren = removeNode(node.children, targetId);
    if (updatedChildren !== node.children) {
      result.push({ ...node, children: updatedChildren });
    } else {
      result.push(node);
    }
  }
  return result;
}

/** ノードのタイトルを更新 */
export function updateTitle(
  tree: BookmarkNode[],
  targetId: string,
  title: string
): BookmarkNode[] {
  return tree.map((node) => {
    if (node.id === targetId) {
      return { ...node, title };
    }
    const updatedChildren = updateTitle(node.children, targetId, title);
    if (updatedChildren !== node.children) {
      return { ...node, children: updatedChildren };
    }
    return node;
  });
}

/** ノードのページ番号を更新 */
export function updatePageNumber(
  tree: BookmarkNode[],
  targetId: string,
  pageNumber: number
): BookmarkNode[] {
  return tree.map((node) => {
    if (node.id === targetId) {
      return { ...node, pageNumber };
    }
    const updatedChildren = updatePageNumber(
      node.children,
      targetId,
      pageNumber
    );
    if (updatedChildren !== node.children) {
      return { ...node, children: updatedChildren };
    }
    return node;
  });
}

/** ノードを上下に移動（兄弟間） */
export function moveNode(
  tree: BookmarkNode[],
  targetId: string,
  direction: "up" | "down"
): BookmarkNode[] {
  const idx = tree.findIndex((n) => n.id === targetId);
  if (idx !== -1) {
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= tree.length) return tree;
    const newTree = [...tree];
    [newTree[idx], newTree[targetIdx]] = [newTree[targetIdx], newTree[idx]];
    return newTree;
  }
  // 子ノード内を再帰探索
  return tree.map((node) => {
    const updatedChildren = moveNode(node.children, targetId, direction);
    if (updatedChildren !== node.children) {
      return { ...node, children: updatedChildren };
    }
    return node;
  });
}

/** ノードを1つ上の兄弟の最後の子に移動する（インデント） */
export function indentNode(
  tree: BookmarkNode[],
  targetId: string
): BookmarkNode[] {
  const idx = tree.findIndex((n) => n.id === targetId);
  if (idx > 0) {
    // 上の兄弟が見つかった — targetをその兄弟の子の末尾に移動
    const prevSibling = tree[idx - 1];
    const target = tree[idx];
    const newTree = [...tree];
    newTree.splice(idx, 1); // targetを除去
    newTree[idx - 1] = {
      ...prevSibling,
      children: [...prevSibling.children, target],
    };
    return newTree;
  }
  if (idx === 0) {
    // 先頭なのでインデント不可 — 子ノード内を再帰探索
    return tree.map((node) => {
      const updatedChildren = indentNode(node.children, targetId);
      if (updatedChildren !== node.children) {
        return { ...node, children: updatedChildren };
      }
      return node;
    });
  }
  // この階層にはない — 子ノード内を再帰探索
  return tree.map((node) => {
    const updatedChildren = indentNode(node.children, targetId);
    if (updatedChildren !== node.children) {
      return { ...node, children: updatedChildren };
    }
    return node;
  });
}

/** ノードを親の次の兄弟として移動する（アウトデント） */
export function outdentNode(
  tree: BookmarkNode[],
  targetId: string
): BookmarkNode[] {
  // ルートレベルではアウトデント不可 — 子の中を探す
  for (let i = 0; i < tree.length; i++) {
    const parent = tree[i];
    const childIdx = parent.children.findIndex((n) => n.id === targetId);
    if (childIdx !== -1) {
      const target = parent.children[childIdx];
      // 後続の兄弟をtargetの子の末尾に追加
      const laterSiblings = parent.children.slice(childIdx + 1);
      const movedTarget: BookmarkNode = {
        ...target,
        children: [...target.children, ...laterSiblings],
      };
      // 親の子からtargetと後続兄弟を除去
      const newParentChildren = parent.children.slice(0, childIdx);
      const newParent = { ...parent, children: newParentChildren };
      // 親の直後にtargetを挿入
      const newTree = [...tree];
      newTree[i] = newParent;
      newTree.splice(i + 1, 0, movedTarget);
      return newTree;
    }
    // さらに深い階層を再帰探索
    const updatedChildren = outdentNode(parent.children, targetId);
    if (updatedChildren !== parent.children) {
      return tree.map((node, j) =>
        j === i ? { ...node, children: updatedChildren } : node
      );
    }
  }
  return tree;
}

/** ツリー全体のノード数をカウント */
export function countNodes(tree: BookmarkNode[]): number {
  let count = 0;
  for (const node of tree) {
    count += 1 + countNodes(node.children);
  }
  return count;
}
