/**
 * Uint8ArrayをPDFファイルとしてダウンロードする
 * @param data - PDFデータ
 * @param filename - ダウンロード時のファイル名
 */
export function downloadPdf(data: Uint8Array, filename: string): void {
  const blob = new Blob([data as unknown as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();

  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 元のファイル名にサフィックスを付加する
 * @param originalName - 元のファイル名（例: "document.pdf"）
 * @param suffix - サフィックス（例: "_reordered"）
 * @returns 新しいファイル名（例: "document_reordered.pdf"）
 */
export function addFilenameSuffix(
  originalName: string,
  suffix: string
): string {
  const lastDot = originalName.lastIndexOf(".");
  if (lastDot === -1) {
    return originalName + suffix + ".pdf";
  }
  return originalName.substring(0, lastDot) + suffix + ".pdf";
}
