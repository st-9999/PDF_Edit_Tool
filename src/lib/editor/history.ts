import { derivePages, type EditOperation, type PageRef } from "./operations";

/**
 * 操作ログ方式の編集履歴。`initial` は不変、`applied` は適用済み操作、
 * `undone` は取り消した操作のスタック。現在状態は initial+applied から都度導出する。
 */
export interface EditHistory {
  initial: PageRef[];
  applied: EditOperation[];
  undone: EditOperation[];
}

export function createHistory(initial: PageRef[]): EditHistory {
  return { initial, applied: [], undone: [] };
}

/** 新しい操作を適用する（やり直しスタックは破棄）。 */
export function applyToHistory(
  history: EditHistory,
  op: EditOperation,
): EditHistory {
  return { ...history, applied: [...history.applied, op], undone: [] };
}

export function undoHistory(history: EditHistory): EditHistory {
  if (history.applied.length === 0) return history;
  const last = history.applied[history.applied.length - 1]!;
  return {
    ...history,
    applied: history.applied.slice(0, -1),
    undone: [...history.undone, last],
  };
}

export function redoHistory(history: EditHistory): EditHistory {
  if (history.undone.length === 0) return history;
  const op = history.undone[history.undone.length - 1]!;
  return {
    ...history,
    applied: [...history.applied, op],
    undone: history.undone.slice(0, -1),
  };
}

export function canUndo(history: EditHistory): boolean {
  return history.applied.length > 0;
}

export function canRedo(history: EditHistory): boolean {
  return history.undone.length > 0;
}

/** 未保存（適用済み操作が 1 件以上）か。 */
export function isDirty(history: EditHistory): boolean {
  return history.applied.length > 0;
}

/** 現在のページ列を導出する。 */
export function currentPages(history: EditHistory): PageRef[] {
  return derivePages(history.initial, history.applied);
}
