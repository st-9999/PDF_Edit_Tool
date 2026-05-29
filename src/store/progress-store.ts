import { create } from "zustand";

interface ProgressState {
  running: boolean;
  label: string;
  done: number;
  total: number;
  onCancel: (() => void) | null;

  begin: (label: string, onCancel: () => void) => void;
  progress: (done: number, total: number) => void;
  end: () => void;
}

/** 重い処理の進捗オーバーレイ用ストア。 */
export const useProgressStore = create<ProgressState>((set) => ({
  running: false,
  label: "",
  done: 0,
  total: 0,
  onCancel: null,

  begin: (label, onCancel) =>
    set({ running: true, label, done: 0, total: 0, onCancel }),
  progress: (done, total) => set({ done, total }),
  end: () => set({ running: false, onCancel: null }),
}));
