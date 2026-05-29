import type { PDFDocumentProxy } from "pdfjs-dist";

export interface PdfMeta {
  numPages: number;
  title: string | null;
  author: string | null;
}

/**
 * 読み込んだ PDF からページ数・基本メタ情報を取り出す純粋なマッパー。
 * （型のみ pdfjs に依存するため Node からもインポート可能）
 * メタデータ取得は失敗しても致命的ではないため、ページ数のみで継続する。
 */
export async function readPdfMeta(pdf: PDFDocumentProxy): Promise<PdfMeta> {
  let info: Record<string, unknown> = {};
  try {
    const meta = await pdf.getMetadata();
    info = (meta.info ?? {}) as Record<string, unknown>;
  } catch {
    // メタ情報を持たない PDF もあるため無視する
  }
  const asText = (value: unknown): string | null =>
    typeof value === "string" && value.trim().length > 0 ? value : null;

  return {
    numPages: pdf.numPages,
    title: asText(info.Title),
    author: asText(info.Author),
  };
}
