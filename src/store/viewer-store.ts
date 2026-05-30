import { create } from "zustand";
import {
  MERGED_PDF_NAME,
  THUMBNAIL_WIDTH_DEFAULT,
  THUMBNAIL_WIDTH_MAX,
  THUMBNAIL_WIDTH_MIN,
  THUMBNAIL_WIDTH_STEP,
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

/**
 * サムネイル幅を [THUMBNAIL_WIDTH_MIN, THUMBNAIL_WIDTH_MAX] にクランプする純関数（px）。
 * 解釈不能な NaN は既定値へフォールバックし、小数は丸める。
 */
export function clampThumbnailWidth(width: number): number {
  if (Number.isNaN(width)) return THUMBNAIL_WIDTH_DEFAULT;
  return Math.min(
    THUMBNAIL_WIDTH_MAX,
    Math.max(THUMBNAIL_WIDTH_MIN, Math.round(width)),
  );
}

/** ページ番号を [1, numPages] にクランプする純関数（1 始まり）。 */
export function clampPage(page: number, numPages: number): number {
  if (numPages <= 0 || !Number.isFinite(page)) return 1;
  return Math.min(numPages, Math.max(1, Math.trunc(page)));
}

interface ViewerState {
  file: File | null;
  /**
   * `file` に続けて結合する追加ファイル（順序付き）。エントリ画面の結合フローで
   * 設定し、ビュアー起動時に 1 本目（`file`）の後ろへ順に結合する。単一オープン時は空。
   */
  mergeFiles: File[];
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
  /** 左ペインのサムネイル描画幅（px）。ビュアー zoom / ブラウザ拡大率とは独立。 */
  thumbnailWidth: number;
  /** ページを一覧整理（グリッド）モード。ON で全画面のサムネ一覧整理画面を表示する。 */
  organize: boolean;

  setFile: (file: File) => void;
  /**
   * 複数 PDF を結合して開く。先頭を `file`、残りを `mergeFiles` に設定する。
   * 2 件以上を想定（呼び出し側で件数を担保）。ファイル名は結合既定名（merged.pdf）。
   */
  setFiles: (files: File[]) => void;
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
  setThumbnailWidth: (width: number) => void;
  thumbnailZoomIn: () => void;
  thumbnailZoomOut: () => void;
  /** 一覧整理モードの切替。 */
  setOrganize: (on: boolean) => void;
}

const initialDocState = {
  file: null as File | null,
  mergeFiles: [] as File[],
  fileName: null as string | null,
  fileSize: null as number | null,
  numPages: 0,
  currentPage: 1,
  navTarget: 1,
  navSeq: 0,
  zoom: ZOOM_DEFAULT,
  // 読込直後は等倍（100%）で表示する。フィット表示は操作で切替可能。
  fitMode: "actual" as FitMode,
  status: "idle" as LoadStatus,
  error: null as string | null,
  // ファイルを閉じたら整理モードも解除する（空状態で整理画面が残らないように）
  organize: false,
};

export const useViewerStore = create<ViewerState>((set) => ({
  ...initialDocState,
  viewMode: "continuous",
  leftTab: "thumbnails",
  // UI 設定はファイル切替で保持する（initialDocState には含めない）
  thumbnailWidth: THUMBNAIL_WIDTH_DEFAULT,

  setFile: (file) =>
    set({
      file,
      mergeFiles: [],
      fileName: file.name,
      fileSize: file.size,
      numPages: 0,
      currentPage: 1,
      zoom: ZOOM_DEFAULT,
      fitMode: "actual",
      status: "loading",
      error: null,
    }),

  setFiles: (files) => {
    const [first, ...rest] = files;
    if (!first) return;
    set({
      file: first,
      mergeFiles: rest,
      // 結合時は merged.pdf を既定名に。単一なら元のファイル名を踏襲。
      fileName: rest.length > 0 ? MERGED_PDF_NAME : first.name,
      fileSize: files.reduce((sum, f) => sum + f.size, 0),
      numPages: 0,
      currentPage: 1,
      zoom: ZOOM_DEFAULT,
      fitMode: "actual",
      status: "loading",
      error: null,
    });
  },

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

  setThumbnailWidth: (width) =>
    set({ thumbnailWidth: clampThumbnailWidth(width) }),

  thumbnailZoomIn: () =>
    set((state) => ({
      thumbnailWidth: clampThumbnailWidth(
        state.thumbnailWidth + THUMBNAIL_WIDTH_STEP,
      ),
    })),

  thumbnailZoomOut: () =>
    set((state) => ({
      thumbnailWidth: clampThumbnailWidth(
        state.thumbnailWidth - THUMBNAIL_WIDTH_STEP,
      ),
    })),

  setOrganize: (on) => set({ organize: on }),
}));
