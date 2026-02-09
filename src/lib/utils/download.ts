type ShowSaveFilePickerWindow = Window & {
  showSaveFilePicker?: (opts: {
    suggestedName: string;
    types: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<FileSystemFileHandle>;
};

/**
 * File System Access API が利用可能か判定する
 */
export function hasFileSystemAccess(): boolean {
  return (
    typeof window !== "undefined" &&
    "showSaveFilePicker" in window
  );
}

/**
 * 「名前を付けて保存」ダイアログを開く
 * showSaveFilePicker はユーザージェスチャ（クリック等）の直後に呼ぶ必要がある。
 * 重い非同期処理の後では呼べないため、必ず処理の前に呼ぶこと。
 *
 * @returns FileSystemFileHandle（成功時）、null（キャンセル時）
 */
export async function openSaveDialog(
  suggestedName: string
): Promise<FileSystemFileHandle | null> {
  const w = window as ShowSaveFilePickerWindow;
  if (!w.showSaveFilePicker) return null;

  try {
    return await w.showSaveFilePicker({
      suggestedName,
      types: [
        {
          description: "PDF Files",
          accept: { "application/pdf": [".pdf"] },
        },
      ],
    });
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return null; // ユーザーがキャンセル
    }
    throw err;
  }
}

/**
 * FileSystemFileHandle にPDFデータを書き込む
 */
export async function writePdfToHandle(
  handle: FileSystemFileHandle,
  data: Uint8Array
): Promise<void> {
  const blob = new Blob([data as unknown as BlobPart], {
    type: "application/pdf",
  });
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
}

/**
 * フォールバック: <a download> による直接ダウンロード
 * File System Access API 非対応ブラウザ用
 */
export function downloadPdfFallback(
  data: Uint8Array,
  filename: string
): void {
  const blob = new Blob([data as unknown as BlobPart], {
    type: "application/pdf",
  });
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
