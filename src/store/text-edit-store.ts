import { create } from "zustand";

/** 書き換える範囲（ページ ID と、そのページの現在の状態でのグリフ番号 [start, end)）。 */
export interface TextSelection {
  pageId: string;
  start: number;
  end: number;
}

interface TextEditState {
  /** 文字の書き換えモード。 */
  active: boolean;
  /** 編集ボックスを開いている範囲（文書全体で 1 つ）。 */
  selection: TextSelection | null;

  setActive: (active: boolean) => void;
  select: (selection: TextSelection) => void;
  clearSelection: () => void;
  reset: () => void;
}

export const useTextEditStore = create<TextEditState>((set, get) => ({
  active: false,
  selection: null,

  setActive: (active) => set(active ? { active } : { active, selection: null }),
  select: (selection) => {
    if (!get().active || selection.end <= selection.start) return;
    set({ selection });
  },
  clearSelection: () => set({ selection: null }),
  reset: () => set({ active: false, selection: null }),
}));
