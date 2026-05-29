import { withBasePath } from "@/lib/config";

/** ズーム倍率の下限・上限・刻み・既定値（1.0 = 100%）。 */
export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 5;
export const ZOOM_STEP = 0.25;
export const ZOOM_DEFAULT = 1;

/** サムネイルの描画幅（px）。低解像度で生成する。 */
export const THUMBNAIL_WIDTH = 140;

/**
 * pdfjs-dist のランタイムアセット URL。`scripts/copy-pdfjs-assets.mjs` で
 * `public/pdfjs/` に配置したものを basePath 付きで参照する。
 * CMap / 標準フォントの URL は末尾スラッシュ必須（pdfjs 仕様）。
 */
export const PDFJS_WORKER_SRC = withBasePath("/pdfjs/pdf.worker.min.mjs");
export const PDFJS_CMAP_URL = withBasePath("/pdfjs/cmaps/");
export const PDFJS_STANDARD_FONT_URL = withBasePath("/pdfjs/standard_fonts/");
export const PDFJS_WASM_URL = withBasePath("/pdfjs/wasm/");
