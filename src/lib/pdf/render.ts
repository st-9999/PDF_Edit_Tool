import type { PageViewport, PDFPageProxy } from "pdfjs-dist";

export interface PageRenderHandle {
  /** 描画完了の Promise（キャンセル時は RenderingCancelledException で reject）。 */
  promise: Promise<void>;
  /** 進行中の描画を中断する。 */
  cancel: () => void;
  /** CSS ピクセルでのページ寸法。 */
  cssWidth: number;
  cssHeight: number;
  /** テキストレイヤと共有するためのビューポート。 */
  viewport: PageViewport;
}

/**
 * PDF ページを canvas に描画する。HiDPI（devicePixelRatio）に対応し、
 * 返り値の `cancel()` で再描画前に進行中タスクを止められる。
 */
export function renderPageToCanvas(
  page: PDFPageProxy,
  canvas: HTMLCanvasElement,
  scale: number,
  /** ユーザー適用の追加回転（時計回り度）。元ページの回転に加算する。 */
  rotation = 0,
): PageRenderHandle {
  const total = (((page.rotate + rotation) % 360) + 360) % 360;
  const viewport = page.getViewport({ scale, rotation: total });
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas の 2D コンテキストを取得できません");
  }

  const outputScale = window.devicePixelRatio || 1;
  canvas.width = Math.floor(viewport.width * outputScale);
  canvas.height = Math.floor(viewport.height * outputScale);
  canvas.style.width = `${Math.floor(viewport.width)}px`;
  canvas.style.height = `${Math.floor(viewport.height)}px`;

  const transform =
    outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined;

  const task = page.render({
    canvas,
    canvasContext: context,
    viewport,
    transform,
  });

  return {
    promise: task.promise,
    cancel: () => task.cancel(),
    cssWidth: viewport.width,
    cssHeight: viewport.height,
    viewport,
  };
}

/**
 * テキストレイヤを描画する。canvas と同一の viewport を渡すこと。
 * 呼び出し側は container に `--total-scale-factor`（= 表示スケール）を設定しておく。
 */
export async function renderTextLayer(
  page: PDFPageProxy,
  container: HTMLElement,
  viewport: PageViewport,
): Promise<void> {
  const { TextLayer } = await import("pdfjs-dist");
  const textContentSource = await page.getTextContent();
  container.replaceChildren();
  const layer = new TextLayer({ textContentSource, container, viewport });
  await layer.render();
}

/**
 * 幅合わせ / 全体表示のスケールを計算する純関数。
 * `containerWidth` / `containerHeight` は CSS ピクセル、`padding` は左右上下の余白。
 */
export function computeFitScale(
  baseWidth: number,
  baseHeight: number,
  mode: "width" | "page",
  containerWidth: number,
  containerHeight: number,
  padding = 0,
): number {
  const availableWidth = Math.max(1, containerWidth - padding * 2);
  const availableHeight = Math.max(1, containerHeight - padding * 2);
  if (mode === "width") {
    return availableWidth / baseWidth;
  }
  return Math.min(availableWidth / baseWidth, availableHeight / baseHeight);
}
