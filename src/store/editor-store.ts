import { create } from "zustand";
import { createId } from "@/lib/id";
import {
  applyToHistory,
  canRedo,
  canUndo,
  createHistory,
  currentPages,
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
  collapseToSingle,
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
  /** 複数選択モード。OFF（既定）はクリックで単一選択のみ、ON でクリック加除/Shift 範囲選択。 */
  multiSelect: boolean;
  /** 上書き保存用のファイルハンドル（FS Access で保存/オープン時に設定）。 */
  fileHandle: FileSystemFileHandle | null;
  /** 最後に保存した時点の適用済み操作数（未保存判定の基準）。 */
  savedAppliedLength: number;

  // ライフサイクル
  initDocument: (numPages: number, sourceId?: string) => void;
  reset: () => void;
  /** 保存完了を記録（未保存フラグをクリア）。任意でハンドルを保持。 */
  markSaved: (handle?: FileSystemFileHandle | null) => void;
  setFileHandle: (handle: FileSystemFileHandle | null) => void;

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
  /**
   * 複数選択モードの切替。OFF にするときは選択を 1 件へ畳む
   * （`preferId`＝現在の閲覧ページ等を優先して残す）。
   */
  setMultiSelect: (on: boolean, preferId?: string) => void;
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
  multiSelect: false,
  fileHandle: null,
  savedAppliedLength: 0,

  initDocument: (numPages, sourceId = createId("src")) => {
    const initial = createInitialPages(sourceId, numPages);
    set({
      sourceId,
      history: createHistory(initial),
      pages: initial,
      selection: emptySelection(),
      multiSelect: false,
      fileHandle: null,
      savedAppliedLength: 0,
    });
  },

  reset: () =>
    set({
      sourceId: null,
      history: emptyHistory,
      pages: [],
      selection: emptySelection(),
      multiSelect: false,
      fileHandle: null,
      savedAppliedLength: 0,
    }),

  markSaved: (handle) =>
    set((state) => ({
      savedAppliedLength: state.history.applied.length,
      fileHandle: handle === undefined ? state.fileHandle : handle,
    })),

  setFileHandle: (handle) => set({ fileHandle: handle }),

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

  setMultiSelect: (on, preferId) =>
    set((state) =>
      on
        ? { multiSelect: true }
        : {
            multiSelect: false,
            selection: collapseToSingle(
              state.selection,
              state.pages.map((p) => p.id),
              preferId,
            ),
          },
    ),
}));

/** セレクタ補助（コンポーネントから利用）。 */
export const editorSelectors = {
  canUndo: (s: EditorState) => canUndo(s.history),
  canRedo: (s: EditorState) => canRedo(s.history),
  // 最後に保存した時点と適用済み操作数が異なれば未保存
  isDirty: (s: EditorState) =>
    s.history.applied.length !== s.savedAppliedLength,
  selectedCount: (s: EditorState) => s.selection.selected.size,
};
