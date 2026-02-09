import { PDFDocument } from "pdf-lib";

/**
 * 指定ページだけで新規PDFを生成する
 * @param pdfData - 元のPDFデータ
 * @param extractPageNumbers - 抽出するページ番号（1始まり）
 * @returns 抽出されたPDFデータ
 */
export async function extractPages(
  pdfData: ArrayBuffer,
  extractPageNumbers: number[]
): Promise<Uint8Array> {
  if (extractPageNumbers.length === 0) {
    throw new Error("抽出するページが選択されていません");
  }

  const srcDoc = await PDFDocument.load(pdfData, { ignoreEncryption: true });

  // 1始まりのページ番号を0始まりインデックスに変換
  const indices = extractPageNumbers.map((n) => n - 1);

  const newDoc = await PDFDocument.create();
  const copiedPages = await newDoc.copyPages(srcDoc, indices);
  for (const page of copiedPages) {
    newDoc.addPage(page);
  }

  return newDoc.save({ updateFieldAppearances: false });
}
