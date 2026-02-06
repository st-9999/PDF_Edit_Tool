import { PDFDocument, degrees } from "pdf-lib";
import type { PageRotation } from "@/types/pdf";

/**
 * PDFのページを回転する
 * @param pdfData - 元のPDFデータ
 * @param rotations - ページ番号（1始まり）→回転角度のマップ
 * @returns 回転済みのPDFデータ
 */
export async function rotatePages(
  pdfData: ArrayBuffer,
  rotations: Record<number, PageRotation>
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfData);
  const pages = pdfDoc.getPages();

  for (const [pageNumStr, angle] of Object.entries(rotations)) {
    const pageIndex = parseInt(pageNumStr, 10) - 1;
    if (pageIndex >= 0 && pageIndex < pages.length && angle !== 0) {
      const page = pages[pageIndex];
      const currentRotation = page.getRotation().angle;
      page.setRotation(degrees(currentRotation + angle));
    }
  }

  return pdfDoc.save();
}
