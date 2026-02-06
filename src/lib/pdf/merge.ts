import { PDFDocument } from "pdf-lib";

export interface MergeSource {
  /** PDFデータ */
  data: ArrayBuffer;
  /** コピーするページのインデックス（0始まり）。未指定なら全ページ */
  pageIndices?: number[];
}

/**
 * 複数のPDFを結合する
 * @param sources - 結合するPDFとページ指定の配列（順序どおりに結合）
 * @returns 結合済みのPDFデータ
 */
export async function mergePdfs(sources: MergeSource[]): Promise<Uint8Array> {
  const newDoc = await PDFDocument.create();

  for (const source of sources) {
    const srcDoc = await PDFDocument.load(source.data);
    const indices =
      source.pageIndices ??
      Array.from({ length: srcDoc.getPageCount() }, (_, i) => i);

    const copiedPages = await newDoc.copyPages(srcDoc, indices);
    for (const page of copiedPages) {
      newDoc.addPage(page);
    }
  }

  return newDoc.save();
}
