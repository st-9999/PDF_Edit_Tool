import { create } from "zustand";
import { createId } from "@/lib/id";
import {
  applyToHistory,
  canRedo,
  canUndo,
  createHistory,
  currentPages,
  isDirty,
  redoHistory,
  undoHistory,
  type EditHistory,
} from "@/lib/editor/history";
import {
  createInitialPages,
  ROTATION_STEP,
  type EditOperation,
  type PageRef,
} from "@/lib/editor/operations";
import {
  clearSelection,
  emptySelection,
  selectAll as selectAllIds,
  selectRange,
  selectSingle,
  toggle,
  type SelectionState,
} from "@/lib/editor/selection";

interface EditorState {
  sourceId: string | null;
  history: EditHistory;
  /** 現在のページ列（history から導出。subscribe 用に保持）。 */
  pages: PageRef[];
  selection: SelectionState;

  // ライフサイクル
  initDocument: (numPages: number, sourceId?: string) => void;
  reset: () => void;

  // 編集操作（履歴へ積む）
  applyEdit: (op: EditOperation) => void;
  reorder: (ids: string[], toIndex: number) => void;
  rotateSelected: (delta?: number) => void;
  deleteSelected: () => void;
  mergePages: (index: number, pages: PageRef[]) => void;
  undo: () => void;
  redo: () => void;

  // 選択
  selectClick: (id: string) => void;
  selectToggle: (id: string) => void;
  selectRangeTo: (id: string) => void;
  selectAll: () => void;
  clear: () => void;
}

const emptyHistory: EditHistory = { initial: [], applied: [], undone: [] };

function commit(history: EditHistory) {
  return { history, pages: currentPages(history) };
}

export const useEditorStore = create<EditorState>((set, get) => ({
  sourceId: null,
  history: emptyHistory,
  pages: [],
  selection: emptySelection(),

  initDocument: (numPages, sourceId = createId("src")) => {
    const initial = createInitialPages(sourceId, numPages);
    set({
      sourceId,
      history: createHistory(initial),
      pages: initial,
      selection: emptySelection(),
    });
  },

  reset: () =>
    set({
      sourceId: null,
      history: emptyHistory,
      pages: [],
      selection: emptySelection(),
    }),

  applyEdit: (op) => set(commit(applyToHistory(get().history, op))),

  reorder: (ids, toIndex) => {
    if (ids.length === 0) return;
    get().applyEdit({ type: "reorder", ids, toIndex });
  },

  rotateSelected: (delta = ROTATION_STEP) => {
    const ids = [...get().selection.selected];
    if (ids.length === 0) return;
    get().applyEdit({ type: "rotate", ids, delta });
  },

  deleteSelected: () => {
    const ids = [...get().selection.selected];
    if (ids.length === 0) return;
    set({
      ...commit(applyToHistory(get().history, { type: "delete", ids })),
      selection: emptySelection(),
    });
  },

  mergePages: (index, pages) => {
    if (pages.length === 0) return;
    get().applyEdit({ type: "merge", index, pages });
  },

  undo: () => set(commit(undoHistory(get().history))),
  redo: () => set(commit(redoHistory(get().history))),

  selectClick: (id) => set({ selection: selectSingle(id) }),
  selectToggle: (id) => set({ selection: toggle(get().selection, id) }),
  selectRangeTo: (id) =>
    set({
      selection: selectRange(
        get().selection,
        get().pages.map((p) => p.id),
        id,
      ),
    }),
  selectAll: () =>
    set({ selection: selectAllIds(get().pages.map((p) => p.id)) }),
  clear: () => set({ selection: clearSelection() }),
}));

/** セレクタ補助（コンポーネントから利用）。 */
export const editorSelectors = {
  canUndo: (s: EditorState) => canUndo(s.history),
  canRedo: (s: EditorState) => canRedo(s.history),
  isDirty: (s: EditorState) => isDirty(s.history),
  selectedCount: (s: EditorState) => s.selection.selected.size,
};
