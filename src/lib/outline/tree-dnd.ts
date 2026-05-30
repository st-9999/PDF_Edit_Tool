import type { EditableOutlineNode } from "./edit";

/**
 * ツリーをドラッグ並べ替え（縦＝順序 / 横＝階層）するための平坦化アイテム。
 * `node` は元ノード（children は無視し、再構築は parentId で行う）。
 */
export interface FlattenedItem {
  id: string;
  parentId: string | null;
  depth: number;
  /** 親内での 0 始まり位置（参考用）。 */
  index: number;
  node: EditableOutlineNode;
}

/** ツリーを pre-order（DFS）で平坦化する。 */
export function flattenTree(
  nodes: EditableOutlineNode[],
  parentId: string | null = null,
  depth = 0,
): FlattenedItem[] {
  return nodes.flatMap((node, index) => [
    { id: node.id, parentId, depth, index, node },
    ...flattenTree(node.children, node.id, depth + 1),
  ]);
}

/**
 * 平坦化アイテム列をツリーへ再構築する。
 * 親子は `parentId` で対応付け、各 parent 内の順序は配列の出現順を保つ。
 */
export function buildTree(items: FlattenedItem[]): EditableOutlineNode[] {
  const nodeById = new Map<string, EditableOutlineNode>();
  for (const item of items) {
    nodeById.set(item.id, { ...item.node, children: [] });
  }
  const roots: EditableOutlineNode[] = [];
  for (const item of items) {
    const node = nodeById.get(item.id)!;
    const parent = item.parentId ? nodeById.get(item.parentId) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

/** `id` の子孫すべての ID を返す（自身は含まない）。 */
export function getDescendantIds(items: FlattenedItem[], id: string): string[] {
  const childrenOf = (pid: string) =>
    items.filter((i) => i.parentId === pid).map((i) => i.id);
  const result: string[] = [];
  const stack = [...childrenOf(id)];
  while (stack.length > 0) {
    const next = stack.pop()!;
    result.push(next);
    stack.push(...childrenOf(next));
  }
  return result;
}

/** 指定 ID 群の子孫を取り除く（ドラッグ中、つかんだ枝を移動対象から外す）。 */
export function removeChildrenOf(
  items: FlattenedItem[],
  ids: string[],
): FlattenedItem[] {
  const exclude = new Set(ids.flatMap((id) => getDescendantIds(items, id)));
  return items.filter((i) => !exclude.has(i.id));
}

/** 配列内で 1 要素を from→to へ移動した新配列を返す（相対順は保持）。 */
function arrayMove<T>(arr: T[], from: number, to: number): T[] {
  const copy = arr.slice();
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item!);
  return copy;
}

function dragDepthFromOffset(offset: number, indentationWidth: number): number {
  return Math.round(offset / indentationWidth);
}

export interface Projection {
  depth: number;
  maxDepth: number;
  minDepth: number;
  parentId: string | null;
}

/**
 * ドラッグ中の投影（投下後の深さと親）を計算する。
 * 縦移動は over の位置、横移動量 `dragOffset` は深さの増減に対応し、
 * 直前/直後アイテムから許される深さ範囲 [minDepth, maxDepth] にクランプする。
 */
export function getProjection(
  items: FlattenedItem[],
  activeId: string,
  overId: string,
  dragOffset: number,
  indentationWidth: number,
): Projection | null {
  const overItemIndex = items.findIndex((i) => i.id === overId);
  const activeItemIndex = items.findIndex((i) => i.id === activeId);
  if (overItemIndex < 0 || activeItemIndex < 0) return null;

  const activeItem = items[activeItemIndex]!;
  const newItems = arrayMove(items, activeItemIndex, overItemIndex);
  const previousItem = newItems[overItemIndex - 1];
  const nextItem = newItems[overItemIndex + 1];

  const projectedDepth =
    activeItem.depth + dragDepthFromOffset(dragOffset, indentationWidth);
  const maxDepth = previousItem ? previousItem.depth + 1 : 0;
  const minDepth = nextItem ? nextItem.depth : 0;

  let depth = projectedDepth;
  if (projectedDepth >= maxDepth) depth = maxDepth;
  else if (projectedDepth < minDepth) depth = minDepth;

  const parentId = (): string | null => {
    if (depth === 0 || !previousItem) return null;
    if (depth === previousItem.depth) return previousItem.parentId;
    if (depth > previousItem.depth) return previousItem.id;
    // 浅くなる場合: 同じ深さの直近の先行アイテムの親を引き継ぐ
    const candidate = newItems
      .slice(0, overItemIndex)
      .reverse()
      .find((i) => i.depth === depth);
    return candidate?.parentId ?? null;
  };

  return { depth, maxDepth, minDepth, parentId: parentId() };
}
