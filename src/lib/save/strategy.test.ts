import { describe, it, expect, afterEach, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  PickerActivationExpiredError,
  createSaveStrategy,
  isFileSystemAccessSupported,
  nextAvailableName,
} from "./strategy";
import { buildPdf } from "@/lib/editor/build";
import type { PageRef } from "@/lib/editor/operations";

const win = window as unknown as {
  showSaveFilePicker?: unknown;
  showDirectoryPicker?: unknown;
};

/** `navigator.userActivation.isActive` を差し替える（jsdom には無い）。 */
function setUserActivation(isActive: boolean | undefined) {
  Object.defineProperty(navigator, "userActivation", {
    configurable: true,
    value: isActive === undefined ? undefined : { isActive },
  });
}

afterEach(() => {
  delete win.showSaveFilePicker;
  delete win.showDirectoryPicker;
  setUserActivation(undefined);
  vi.restoreAllMocks();
});

/** 名前 → 書き込まれた内容 を持つ、フォルダのハンドルの代わり。 */
function fakeDirectory(existing: string[] = []) {
  const files = new Map<string, Uint8Array | null>(
    existing.map((name) => [name, null]),
  );
  const handle = {
    name: "out",
    getFileHandle: vi.fn(
      async (name: string, options?: { create?: boolean }) => {
        if (!files.has(name)) {
          if (!options?.create) {
            throw new DOMException("not found", "NotFoundError");
          }
          files.set(name, null);
        }
        return {
          name,
          createWritable: async () => ({
            write: async (data: Uint8Array) => {
              files.set(name, data);
            },
            close: async () => {},
          }),
        };
      },
    ),
  };
  return { handle, files };
}

describe("能力判定", () => {
  it("showSaveFilePicker があれば fs-access", () => {
    win.showSaveFilePicker = () => {};
    expect(isFileSystemAccessSupported()).toBe(true);
    expect(createSaveStrategy().kind).toBe("fs-access");
  });

  it("無ければ download（上書き不可）", () => {
    delete win.showSaveFilePicker;
    expect(isFileSystemAccessSupported()).toBe(false);
    const strategy = createSaveStrategy();
    expect(strategy.kind).toBe("download");
    expect(strategy.canOverwrite).toBe(false);
  });
});

describe("FileSystemAccessStrategy", () => {
  it("saveAs はハンドルへ書き込み、再読込で妥当な PDF になる", async () => {
    let written: Uint8Array | null = null;
    const handle = {
      name: "edited.pdf",
      createWritable: async () => ({
        write: async (data: Uint8Array) => {
          written = data;
        },
        close: async () => {},
      }),
    };
    win.showSaveFilePicker = vi.fn(async () => handle);

    // 実際の編集出力を保存する
    const source = await makeSource(2);
    const pages: PageRef[] = [
      { id: "a", sourceId: "S", sourceIndex: 0, rotation: 0 },
      { id: "b", sourceId: "S", sourceIndex: 1, rotation: 90 },
    ];
    const bytes = await buildPdf({ S: source }, pages);

    const strategy = createSaveStrategy();
    const target = await strategy.saveAs(bytes, "edited.pdf");

    expect(target?.handle).toBe(handle);
    expect(written).not.toBeNull();
    const reloaded = await PDFDocument.load(written!);
    expect(reloaded.getPageCount()).toBe(2);
    expect(reloaded.getPage(1).getRotation().angle).toBe(90);
  });

  it("クリックからの期限が切れて保存先の画面を開けない（SecurityError）ときは PickerActivationExpiredError", async () => {
    win.showSaveFilePicker = vi.fn(async () => {
      throw new DOMException(
        "Must be handling a user gesture to show a file picker.",
        "SecurityError",
      );
    });
    const strategy = createSaveStrategy();
    await expect(
      strategy.saveAs(new Uint8Array([1]), "x.pdf"),
    ).rejects.toBeInstanceOf(PickerActivationExpiredError);
  });

  it("クリックの期限が切れていると分かっていれば、保存先の画面を開こうとせずに PickerActivationExpiredError", async () => {
    const picker = vi.fn();
    win.showSaveFilePicker = picker;
    setUserActivation(false);
    const strategy = createSaveStrategy();
    await expect(
      strategy.saveAs(new Uint8Array([1]), "x.pdf"),
    ).rejects.toBeInstanceOf(PickerActivationExpiredError);
    expect(picker).not.toHaveBeenCalled();
  });

  it("ユーザーキャンセル（AbortError）は null", async () => {
    win.showSaveFilePicker = vi.fn(async () => {
      throw new DOMException("cancelled", "AbortError");
    });
    const strategy = createSaveStrategy();
    const result = await strategy.saveAs(new Uint8Array([1]), "x.pdf");
    expect(result).toBeNull();
  });

  it("overwrite は既存ハンドルへ書き込む", async () => {
    let written: Uint8Array | null = null;
    const handle = {
      name: "f.pdf",
      createWritable: async () => ({
        write: async (data: Uint8Array) => {
          written = data;
        },
        close: async () => {},
      }),
    } as unknown as FileSystemFileHandle;
    win.showSaveFilePicker = () => {};
    const strategy = createSaveStrategy();
    await strategy.overwrite(handle, new Uint8Array([1, 2, 3]));
    expect(written).toEqual(new Uint8Array([1, 2, 3]));
  });
});

describe("pickDirectory（分割保存の保存先フォルダ）", () => {
  it("fs-access: フォルダを選び、各ファイルを書き込む。同名のファイルがあれば上書きせず別名にする", async () => {
    const { handle, files } = fakeDirectory(["doc-01.pdf"]);
    const picker = vi.fn(async () => handle);
    win.showSaveFilePicker = () => {};
    win.showDirectoryPicker = picker;

    const strategy = createSaveStrategy();
    const folder = await strategy.pickDirectory();
    expect(picker).toHaveBeenCalledWith({ mode: "readwrite" });
    expect(folder).not.toBeNull();
    expect(await folder!.write(Uint8Array.of(1), "doc-01.pdf")).toBe(
      "doc-01 (1).pdf",
    );
    expect(await folder!.write(Uint8Array.of(2), "doc-02.pdf")).toBe(
      "doc-02.pdf",
    );
    expect(files.get("doc-01.pdf")).toBeNull();
    expect(Array.from(files.get("doc-01 (1).pdf")!)).toEqual([1]);
    expect(Array.from(files.get("doc-02.pdf")!)).toEqual([2]);
  });

  it("fs-access: フォルダの選択をキャンセルしたら null", async () => {
    win.showSaveFilePicker = () => {};
    win.showDirectoryPicker = vi.fn(async () => {
      throw new DOMException("cancelled", "AbortError");
    });
    expect(await createSaveStrategy().pickDirectory()).toBeNull();
  });

  it("fs-access: クリックの期限切れでフォルダを選べなければ PickerActivationExpiredError", async () => {
    win.showSaveFilePicker = () => {};
    win.showDirectoryPicker = vi.fn(async () => {
      throw new DOMException("gesture", "SecurityError");
    });
    await expect(createSaveStrategy().pickDirectory()).rejects.toBeInstanceOf(
      PickerActivationExpiredError,
    );
  });

  it("フォルダの選択に対応していなければ（download 経路）、各ファイルをダウンロードする", async () => {
    delete win.showSaveFilePicker;
    URL.createObjectURL = vi.fn(
      () => "blob:test",
    ) as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn() as typeof URL.revokeObjectURL;
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    const folder = await createSaveStrategy().pickDirectory();
    expect(await folder!.write(Uint8Array.of(1), "a.pdf")).toBe("a.pdf");
    expect(await folder!.write(Uint8Array.of(2), "b.pdf")).toBe("b.pdf");
    expect(click).toHaveBeenCalledTimes(2);
  });
});

describe("nextAvailableName（同名ファイルを避けた名前）", () => {
  it("無ければそのまま、あれば拡張子の前に (1)、(2)… を付ける", async () => {
    const taken = new Set(["a.pdf", "a (1).pdf", "b"]);
    const exists = async (name: string) => taken.has(name);
    expect(await nextAvailableName("c.pdf", exists)).toBe("c.pdf");
    expect(await nextAvailableName("a.pdf", exists)).toBe("a (2).pdf");
    expect(await nextAvailableName("b", exists)).toBe("b (1)");
  });
});

describe("DownloadStrategy", () => {
  it("saveAs はダウンロードを発火し、上書きは不可", async () => {
    delete win.showSaveFilePicker;
    // jsdom には createObjectURL が無いため直接モックを割り当てる
    const createObjectURL = vi.fn(() => "blob:test");
    URL.createObjectURL = createObjectURL as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn() as typeof URL.revokeObjectURL;
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    const strategy = createSaveStrategy();
    const target = await strategy.saveAs(new Uint8Array([1, 2]), "dl.pdf");
    expect(target).toEqual({ name: "dl.pdf", handle: null });
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    await expect(
      strategy.overwrite({} as FileSystemFileHandle, new Uint8Array()),
    ).rejects.toThrow();
  });
});

async function makeSource(pageCount: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i += 1) doc.addPage([200, 300]);
  return doc.save();
}
