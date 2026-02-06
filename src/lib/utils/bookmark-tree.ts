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

/** ツリー全体のノード数をカウント */
export function countNodes(tree: BookmarkNode[]): number {
  let count = 0;
  for (const node of tree) {
    count += 1 + countNodes(node.children);
  }
  return count;
}
