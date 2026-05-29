"use client";

import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  PDFJS_CMAP_URL,
  PDFJS_STANDARD_FONT_URL,
  PDFJS_WASM_URL,
  PDFJS_WORKER_SRC,
} from "./constants";

/** パスワード保護 PDF（P1 では未対応）。 */
export class PdfPasswordError extends Error {
  constructor(message = "パスワード保護された PDF は未対応です") {
    super(message);
    this.name = "PdfPasswordError";
  }
}

/** 破損・非対応など、読み込み一般の失敗。 */
export class PdfLoadError extends Error {
  constructor(
    message = "PDF を読み込めませんでした（破損している可能性があります）",
  ) {
    super(message);
    this.name = "PdfLoadError";
  }
}

let configured = false;

/**
 * pdf.js を遅延 import する。pdfjs-dist は Node（静的エクスポートの prerender）で
 * 評価すると DOMMatrix 等が無く失敗するため、クライアントで呼ばれる時にのみ読み込む。
 */
async function getPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  if (!configured) {
    pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;
    configured = true;
  }
  return pdfjs;
}

/**
 * バイト列から PDF を読み込む。`data` は worker へ転送され detach されるため、
 * 呼び出し元のバッファを保持できるようコピーを渡す。
 */
export async function loadPdfDocument(
  data: ArrayBuffer,
  password?: string,
): Promise<PDFDocumentProxy> {
  const pdfjs = await getPdfjs();
  const bytes = new Uint8Array(data.slice(0));
  const task = pdfjs.getDocument({
    data: bytes,
    cMapUrl: PDFJS_CMAP_URL,
    cMapPacked: true,
    standardFontDataUrl: PDFJS_STANDARD_FONT_URL,
    wasmUrl: PDFJS_WASM_URL,
    ...(password !== undefined ? { password } : {}),
  });
  try {
    return await task.promise;
  } catch (err) {
    if (err instanceof Error && err.name === "PasswordException") {
      throw new PdfPasswordError();
    }
    throw new PdfLoadError();
  }
}

export type { PDFDocumentProxy };
