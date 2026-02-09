import { PDFDocument } from "pdf-lib";

export interface MergeSource {
  /** PDFデータを取得する関数（遅延読み込み） */
  getData: () => Promise<ArrayBuffer>;
  /** コピーするページのインデックス（0始まり）。未指定なら全ページ */
  pageIndices?: number[];
}

/**
 * 複数のPDFを結合する
 * データは各ソースから1つずつ遅延読み込みし、処理後に参照を解放することで
 * 大容量ファイル（数百MB）のマージ時のメモリ使用量を抑える
 *
 * @param sources - 結合するPDFとページ指定の配列（順序どおりに結合）
 * @returns 結合済みのPDFデータ
 */
export async function mergePdfs(sources: MergeSource[]): Promise<Uint8Array> {
  const newDoc = await PDFDocument.create();

  for (const source of sources) {
    const data = await source.getData();
    const srcDoc = await PDFDocument.load(data, { ignoreEncryption: true });
    const indices =
      source.pageIndices ??
      Array.from({ length: srcDoc.getPageCount() }, (_, i) => i);

    const copiedPages = await newDoc.copyPages(srcDoc, indices);
    for (const page of copiedPages) {
      newDoc.addPage(page);
    }
    // srcDoc の参照を解放してGC対象にする（次のループでメモリ回収可能）
  }

  return newDoc.save({ updateFieldAppearances: false });
}
