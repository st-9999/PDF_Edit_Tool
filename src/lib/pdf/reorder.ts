import { PDFDocument } from "pdf-lib";

/**
 * PDFのページを指定された順序に並び替える
 * @param pdfData - 元のPDFデータ
 * @param newOrder - 新しいページ順序（0始まりのインデックス配列）
 * @returns 並び替え済みのPDFデータ
 */
export async function reorderPdfPages(
  pdfData: ArrayBuffer,
  newOrder: number[]
): Promise<Uint8Array> {
  const srcDoc = await PDFDocument.load(pdfData);
  const newDoc = await PDFDocument.create();

  const copiedPages = await newDoc.copyPages(srcDoc, newOrder);

  for (const page of copiedPages) {
    newDoc.addPage(page);
  }

  return newDoc.save();
}
