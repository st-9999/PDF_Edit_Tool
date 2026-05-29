import { create } from "zustand";
import {
  ZOOM_DEFAULT,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_STEP,
} from "@/lib/pdf/constants";

export type FitMode = "actual" | "width" | "page";
export type ViewMode = "single" | "continuous";
export type LeftTab = "thumbnails" | "bookmarks";
export type LoadStatus = "idle" | "loading" | "ready" | "error";

/**
 * ズーム倍率を [ZOOM_MIN, ZOOM_MAX] にクランプする純関数。
 * NaN は解釈不能のため既定値、±Infinity は上限/下限へ寄せる。
 */
export function clampZoom(zoom: number): number {
  if (Number.isNaN(zoom)) return ZOOM_DEFAULT;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
}

/** ページ番号を [1, numPages] にクランプする純関数（1 始まり）。 */
export function clampPage(page: number, numPages: number): number {
  if (numPages <= 0 || !Number.isFinite(page)) return 1;
  return Math.min(numPages, Math.max(1, Math.trunc(page)));
}

interface ViewerState {
  file: File | null;
  fileName: string | null;
  fileSize: number | null;
  numPages: number;
  currentPage: number;
  /** スクロール要求の対象ページと連番。連続表示で明示ナビ時のみ更新する。 */
  navTarget: number;
  navSeq: number;
  zoom: number;
  fitMode: FitMode;
  viewMode: ViewMode;
  status: LoadStatus;
  error: string | null;
  leftTab: LeftTab;

  setFile: (file: File) => void;
  clearFile: () => void;
  setStatus: (status: LoadStatus) => void;
  setError: (message: string) => void;
  setNumPages: (numPages: number) => void;
  /** 表示のみ更新（スクロール検知用）。スクロール要求は発行しない。 */
  setCurrentPage: (page: number) => void;
  /** 明示ナビ。現在ページ更新＋スクロール要求を発行する。 */
  requestPage: (page: number) => void;
  nextPage: () => void;
  prevPage: () => void;
  setZoom: (zoom: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  setFitMode: (mode: FitMode) => void;
  setViewMode: (mode: ViewMode) => void;
  setLeftTab: (tab: LeftTab) => void;
}

const initialDocState = {
  file: null as File | null,
  fileName: null as string | null,
  fileSize: null as number | null,
  numPages: 0,
  currentPage: 1,
  navTarget: 1,
  navSeq: 0,
  zoom: ZOOM_DEFAULT,
  fitMode: "width" as FitMode,
  status: "idle" as LoadStatus,
  error: null as string | null,
};

export const useViewerStore = create<ViewerState>((set) => ({
  ...initialDocState,
  viewMode: "continuous",
  leftTab: "thumbnails",

  setFile: (file) =>
    set({
      file,
      fileName: file.name,
      fileSize: file.size,
      numPages: 0,
      currentPage: 1,
      zoom: ZOOM_DEFAULT,
      fitMode: "width",
      status: "loading",
      error: null,
    }),

  clearFile: () => set({ ...initialDocState }),

  setStatus: (status) => set({ status }),

  setError: (message) => set({ status: "error", error: message }),

  setNumPages: (numPages) =>
    set((state) => ({
      numPages,
      currentPage: clampPage(state.currentPage, numPages),
    })),

  setCurrentPage: (page) =>
    set((state) => ({ currentPage: clampPage(page, state.numPages) })),

  requestPage: (page) =>
    set((state) => {
      const p = clampPage(page, state.numPages);
      return { currentPage: p, navTarget: p, navSeq: state.navSeq + 1 };
    }),

  nextPage: () =>
    set((state) => {
      const p = clampPage(state.currentPage + 1, state.numPages);
      return { currentPage: p, navTarget: p, navSeq: state.navSeq + 1 };
    }),

  prevPage: () =>
    set((state) => {
      const p = clampPage(state.currentPage - 1, state.numPages);
      return { currentPage: p, navTarget: p, navSeq: state.navSeq + 1 };
    }),

  // 明示的なズーム操作は等倍モード（fitMode='actual'）に切り替える
  setZoom: (zoom) => set({ zoom: clampZoom(zoom), fitMode: "actual" }),

  zoomIn: () =>
    set((state) => ({
      zoom: clampZoom(state.zoom + ZOOM_STEP),
      fitMode: "actual",
    })),

  zoomOut: () =>
    set((state) => ({
      zoom: clampZoom(state.zoom - ZOOM_STEP),
      fitMode: "actual",
    })),

  setFitMode: (mode) => set({ fitMode: mode }),

  setViewMode: (mode) => set({ viewMode: mode }),

  setLeftTab: (tab) => set({ leftTab: tab }),
}));
