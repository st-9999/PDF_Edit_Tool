"use client";

/**
 * バイト列をファイルとしてダウンロードさせる（P3 暫定）。
 * P4 で File System Access API による保存先指定／上書き保存に置き換える。
 */
export function downloadBytes(
  bytes: Uint8Array,
  filename: string,
  mimeType = "application/pdf",
): void {
  const blob = new Blob([bytes as BlobPart], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
