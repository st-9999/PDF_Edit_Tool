import { downloadBytes } from "@/lib/download";

/** 保存結果。FS Access 経路では上書き用にハンドルを返す。 */
export interface SaveTarget {
  name: string;
  handle: FileSystemFileHandle | null;
}

/**
 * 保存処理の抽象。ブラウザ能力に応じて実装を切り替える。
 * - fs-access: File System Access API（保存先指定＋上書き）
 * - download : `<a download>` フォールバック（上書き不可）
 */
export interface SaveStrategy {
  readonly kind: "fs-access" | "download";
  readonly canOverwrite: boolean;
  /** 保存先を指定して保存。成功で SaveTarget、ユーザーキャンセルなら null。 */
  saveAs(bytes: Uint8Array, suggestedName: string): Promise<SaveTarget | null>;
  /** 既存ハンドルへ上書き保存（download 経路は非対応）。 */
  overwrite(handle: FileSystemFileHandle, bytes: Uint8Array): Promise<void>;
}

const PDF_PICKER_TYPES: FilePickerAcceptType[] = [
  { description: "PDF", accept: { "application/pdf": [".pdf"] } },
];

/** Chromium 系のみ true（保存先指定・上書き保存が可能）。 */
export function isFileSystemAccessSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.showSaveFilePicker === "function"
  );
}

async function writeToHandle(
  handle: FileSystemFileHandle,
  bytes: Uint8Array,
): Promise<void> {
  // 大きな Blob を別途溜め込まず、書き込みストリームへ直接書く
  const writable = await handle.createWritable();
  try {
    await writable.write(bytes as unknown as BufferSource);
  } finally {
    await writable.close();
  }
}

class FileSystemAccessStrategy implements SaveStrategy {
  readonly kind = "fs-access" as const;
  readonly canOverwrite = true;

  async saveAs(
    bytes: Uint8Array,
    suggestedName: string,
  ): Promise<SaveTarget | null> {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName,
        types: PDF_PICKER_TYPES,
      });
      await writeToHandle(handle, bytes);
      return { name: handle.name, handle };
    } catch (err) {
      // ユーザーがダイアログをキャンセル
      if (err instanceof DOMException && err.name === "AbortError") return null;
      throw err;
    }
  }

  async overwrite(
    handle: FileSystemFileHandle,
    bytes: Uint8Array,
  ): Promise<void> {
    await writeToHandle(handle, bytes);
  }
}

class DownloadStrategy implements SaveStrategy {
  readonly kind = "download" as const;
  readonly canOverwrite = false;

  async saveAs(
    bytes: Uint8Array,
    suggestedName: string,
  ): Promise<SaveTarget | null> {
    downloadBytes(bytes, suggestedName);
    return { name: suggestedName, handle: null };
  }

  async overwrite(): Promise<void> {
    throw new Error("このブラウザは上書き保存に対応していません");
  }
}

/** 能力判定して保存戦略を生成する。 */
export function createSaveStrategy(): SaveStrategy {
  return isFileSystemAccessSupported()
    ? new FileSystemAccessStrategy()
    : new DownloadStrategy();
}
