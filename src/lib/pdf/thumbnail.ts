import type { PDFDocumentProxy } from "pdfjs-dist";

let pdfjsLib: typeof import("pdfjs-dist") | null = null;

async function getPdfjs() {
  if (pdfjsLib) return pdfjsLib;
  pdfjsLib = await import("pdfjs-dist");
  const basePath = process.env.__NEXT_ROUTER_BASEPATH || "";
  pdfjsLib.GlobalWorkerOptions.workerSrc = `${basePath}/pdf.worker.min.mjs`;
  return pdfjsLib;
}

/** PDFドキュメントを読み込む */
export async function loadPdfDocument(
  data: ArrayBuffer
): Promise<PDFDocumentProxy> {
  const pdfjs = await getPdfjs();
  const loadingTask = pdfjs.getDocument({ data });
  return loadingTask.promise;
}

/** 指定ページのサムネイルをData URLとして生成 */
export async function renderPageThumbnail(
  pdfDoc: PDFDocumentProxy,
  pageNumber: number,
  scale: number = 0.3
): Promise<string> {
  const page = await pdfDoc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Failed to get canvas 2d context");
  }

  const outputScale = window.devicePixelRatio || 1;
  canvas.width = Math.floor(viewport.width * outputScale);
  canvas.height = Math.floor(viewport.height * outputScale);
  canvas.style.width = Math.floor(viewport.width) + "px";
  canvas.style.height = Math.floor(viewport.height) + "px";

  const transform =
    outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined;

  await page.render({
    canvas,
    canvasContext: context,
    transform,
    viewport,
  }).promise;

  const dataUrl = canvas.toDataURL("image/png");

  // メモリ解放
  canvas.width = 0;
  canvas.height = 0;

  return dataUrl;
}

/** PDF全ページのサムネイルを生成（逐次、コールバック付き） */
export async function renderAllThumbnails(
  pdfDoc: PDFDocumentProxy,
  onProgress?: (pageNumber: number, thumbnailUrl: string) => void,
  scale: number = 0.3
): Promise<string[]> {
  const numPages = pdfDoc.numPages;
  const thumbnails: string[] = [];

  for (let i = 1; i <= numPages; i++) {
    const url = await renderPageThumbnail(pdfDoc, i, scale);
    thumbnails.push(url);
    onProgress?.(i, url);
  }

  return thumbnails;
}
