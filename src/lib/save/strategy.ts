import { downloadBytes } from "@/lib/download";

/** 保存結果。FS Access 経路では上書き用にハンドルを返す。 */
export interface SaveTarget {
  name: string;
  handle: FileSystemFileHandle | null;
}

/** 分割保存などで複数のファイルを書き込む保存先。 */
export interface SaveDirectory {
  /** ファイルを書き込み、実際に使った名前を返す（同名のファイルがあれば上書きせず別名にする）。 */
  write(bytes: Uint8Array, name: string): Promise<string>;
}

/**
 * クリックから時間が経ち、保存先を選ぶ画面を開けなかった。
 * Chromium は保存先の選択画面をクリック（ユーザー操作）から約 5 秒以内にしか開けないため、
 * 大きな PDF を作り終えてから開こうとすると失敗する。利用者にもう一度クリックしてもらう必要がある。
 */
export class PickerActivationExpiredError extends Error {
  constructor(cause?: unknown) {
    super("保存先を選ぶ画面を開けませんでした（操作から時間が経ったため）");
    this.name = "PickerActivationExpiredError";
    this.cause = cause;
  }
}

/**
 * 保存処理の抽象。ブラウザ能力に応じて実装を切り替える。
 * - fs-access: File System Access API（保存先指定＋上書き）
 * - download : `<a download>` フォールバック（上書き不可）
 */
export interface SaveStrategy {
  readonly kind: "fs-access" | "download";
  readonly canOverwrite: boolean;
  /**
   * 保存先を指定して保存。成功で SaveTarget、ユーザーキャンセルなら null。
   * クリックの期限が切れて保存先の画面を開けなければ PickerActivationExpiredError。
   */
  saveAs(bytes: Uint8Array, suggestedName: string): Promise<SaveTarget | null>;
  /**
   * 複数のファイルの保存先を選ぶ（fs-access はフォルダを選ぶ。download はダウンロード）。
   * ユーザーキャンセルなら null。フォルダを選んだ時点ではファイルを変更しないため、作る前に呼んでよい。
   */
  pickDirectory(): Promise<SaveDirectory | null>;
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

/** 保存先の画面を開けないと分かっている（クリックの期限切れ）か。判定できないブラウザでは false。 */
function activationExpired(): boolean {
  return navigator.userActivation?.isActive === false;
}

/** 保存先の画面のエラーを、キャンセル（null）・期限切れ（例外）・その他（そのまま）に振り分ける。 */
function handlePickerError(err: unknown): null {
  if (err instanceof DOMException && err.name === "AbortError") return null;
  if (err instanceof DOMException && err.name === "SecurityError") {
    throw new PickerActivationExpiredError(err);
  }
  throw err;
}

/**
 * 同名のファイルを避けた名前。`name` が無ければそのまま、あれば拡張子の前に ` (1)`、` (2)`… を付ける。
 */
export async function nextAvailableName(
  name: string,
  exists: (name: string) => Promise<boolean>,
): Promise<string> {
  if (!(await exists(name))) return name;
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  for (let i = 1; ; i += 1) {
    const candidate = `${base} (${i})${ext}`;
    if (!(await exists(candidate))) return candidate;
  }
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
    if (activationExpired()) throw new PickerActivationExpiredError();
    let handle: FileSystemFileHandle;
    try {
      handle = await window.showSaveFilePicker({
        suggestedName,
        types: PDF_PICKER_TYPES,
      });
    } catch (err) {
      return handlePickerError(err);
    }
    await writeToHandle(handle, bytes);
    return { name: handle.name, handle };
  }

  async pickDirectory(): Promise<SaveDirectory | null> {
    if (typeof window.showDirectoryPicker !== "function") {
      return downloadDirectory;
    }
    if (activationExpired()) throw new PickerActivationExpiredError();
    let folder: FileSystemDirectoryHandle;
    try {
      folder = await window.showDirectoryPicker({ mode: "readwrite" });
    } catch (err) {
      return handlePickerError(err);
    }
    const exists = async (name: string) => {
      try {
        await folder.getFileHandle(name);
        return true;
      } catch (err) {
        if (err instanceof DOMException && err.name === "NotFoundError") {
          return false;
        }
        throw err;
      }
    };
    return {
      async write(bytes, name) {
        const actual = await nextAvailableName(name, exists);
        const handle = await folder.getFileHandle(actual, { create: true });
        await writeToHandle(handle, bytes);
        return actual;
      },
    };
  }

  async overwrite(
    handle: FileSystemFileHandle,
    bytes: Uint8Array,
  ): Promise<void> {
    await writeToHandle(handle, bytes);
  }
}

/** 1 ファイルずつダウンロードする保存先（フォルダを選べないブラウザ用）。 */
const downloadDirectory: SaveDirectory = {
  async write(bytes, name) {
    downloadBytes(bytes, name);
    return name;
  },
};

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

  async pickDirectory(): Promise<SaveDirectory> {
    return downloadDirectory;
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
