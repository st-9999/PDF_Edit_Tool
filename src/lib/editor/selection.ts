/** 複数選択の状態。`anchor` は Shift 範囲選択の起点。 */
export interface SelectionState {
  selected: ReadonlySet<string>;
  anchor: string | null;
}

export function emptySelection(): SelectionState {
  return { selected: new Set(), anchor: null };
}

/** 単一選択（プレーンクリック）。選択を置き換え、anchor を更新。 */
export function selectSingle(id: string): SelectionState {
  return { selected: new Set([id]), anchor: id };
}

/** 個別トグル（Ctrl/Cmd クリック）。 */
export function toggle(state: SelectionState, id: string): SelectionState {
  const next = new Set(state.selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return { selected: next, anchor: id };
}

/**
 * 範囲選択（Shift クリック）。anchor から id までを現在の並び順で選択する。
 * anchor 未設定なら単一選択にフォールバック。anchor は維持する。
 */
export function selectRange(
  state: SelectionState,
  orderedIds: string[],
  id: string,
): SelectionState {
  const anchor = state.anchor;
  if (anchor === null) return selectSingle(id);
  const a = orderedIds.indexOf(anchor);
  const b = orderedIds.indexOf(id);
  if (a === -1 || b === -1) return selectSingle(id);
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  return { selected: new Set(orderedIds.slice(lo, hi + 1)), anchor };
}

export function selectAll(orderedIds: string[]): SelectionState {
  return {
    selected: new Set(orderedIds),
    anchor: orderedIds[0] ?? null,
  };
}

export function clearSelection(): SelectionState {
  return emptySelection();
}
