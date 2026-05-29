import { withBasePath } from "@/lib/config";

/** ズーム倍率の下限・上限・刻み・既定値（1.0 = 100%）。 */
export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 5;
export const ZOOM_STEP = 0.25;
export const ZOOM_DEFAULT = 1;

/** サムネイルの描画幅（px）。低解像度で生成する。既定値であり、左ペインのサムネ拡大縮小はこの値を起点にする。 */
export const THUMBNAIL_WIDTH = 140;

/**
 * サムネイル幅の下限・上限・刻み（px）。ビュアー/ブラウザの拡大率とは独立に変化する。
 * 既定 140px を 100% として、50%（70px）〜300%（420px）の範囲。
 */
export const THUMBNAIL_WIDTH_MIN = 70;
export const THUMBNAIL_WIDTH_MAX = 420;
export const THUMBNAIL_WIDTH_STEP = 20;
export const THUMBNAIL_WIDTH_DEFAULT = THUMBNAIL_WIDTH;

/**
 * pdfjs-dist のランタイムアセット URL。`scripts/copy-pdfjs-assets.mjs` で
 * `public/pdfjs/` に配置したものを basePath 付きで参照する。
 * CMap / 標準フォントの URL は末尾スラッシュ必須（pdfjs 仕様）。
 */
export const PDFJS_WORKER_SRC = withBasePath("/pdfjs/pdf.worker.min.mjs");
export const PDFJS_CMAP_URL = withBasePath("/pdfjs/cmaps/");
export const PDFJS_STANDARD_FONT_URL = withBasePath("/pdfjs/standard_fonts/");
export const PDFJS_WASM_URL = withBasePath("/pdfjs/wasm/");
