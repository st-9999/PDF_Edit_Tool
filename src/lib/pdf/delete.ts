import { PDFDocument } from "pdf-lib";

/**
 * 指定ページを除外したPDFを生成する
 * @param pdfData - 元のPDFデータ
 * @param deletePageNumbers - 削除するページ番号（1始まり）
 * @returns 削除後のPDFデータ
 */
export async function deletePages(
  pdfData: ArrayBuffer,
  deletePageNumbers: number[]
): Promise<Uint8Array> {
  const srcDoc = await PDFDocument.load(pdfData, { ignoreEncryption: true });
  const totalPages = srcDoc.getPageCount();
  const deleteSet = new Set(deletePageNumbers);

  // 削除対象以外のページインデックス（0始まり）を収集
  const keepIndices: number[] = [];
  for (let i = 0; i < totalPages; i++) {
    if (!deleteSet.has(i + 1)) {
      keepIndices.push(i);
    }
  }

  if (keepIndices.length === 0) {
    throw new Error("すべてのページを削除することはできません");
  }

  const newDoc = await PDFDocument.create();
  const copiedPages = await newDoc.copyPages(srcDoc, keepIndices);
  for (const page of copiedPages) {
    newDoc.addPage(page);
  }

  return newDoc.save();
}
