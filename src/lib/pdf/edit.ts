import { PDFDocument, degrees } from "pdf-lib";
import type { PageInfo } from "@/types/pdf";

/**
 * 統合PDF編集処理
 * pages 配列が最終状態を表現する:
 * - 削除済みページ → 配列に存在しない
 * - 並び替え → 配列の順序そのもの
 * - 回転 → 各要素の rotation プロパティ
 *
 * @param pdfData - 元のPDFデータ
 * @param pages - 編集後のページ情報配列
 * @returns 編集済みのPDFデータ
 */
export async function editPdfPages(
  pdfData: ArrayBuffer,
  pages: PageInfo[]
): Promise<Uint8Array> {
  const srcDoc = await PDFDocument.load(pdfData, { ignoreEncryption: true });
  const newDoc = await PDFDocument.create();
  const srcPageCount = srcDoc.getPageCount();

  // pages の順序で 0始まりインデックスを生成（範囲外は除外）
  const validPages = pages.filter((p) => p.pageNumber >= 1 && p.pageNumber <= srcPageCount);
  if (validPages.length === 0) {
    throw new Error("有効なページがありません");
  }
  const indices = validPages.map((p) => p.pageNumber - 1);
  const copiedPages = await newDoc.copyPages(srcDoc, indices);

  for (let i = 0; i < copiedPages.length; i++) {
    const page = copiedPages[i];
    const rotation = validPages[i].rotation;
    if (rotation !== 0) {
      const currentRotation = page.getRotation().angle;
      page.setRotation(degrees(currentRotation + rotation));
    }
    newDoc.addPage(page);
  }

  return newDoc.save({ updateFieldAppearances: false });
}
