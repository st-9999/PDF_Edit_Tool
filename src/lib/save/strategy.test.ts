import { describe, it, expect, afterEach, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { createSaveStrategy, isFileSystemAccessSupported } from "./strategy";
import { buildPdf } from "@/lib/editor/build";
import type { PageRef } from "@/lib/editor/operations";

const win = window as unknown as {
  showSaveFilePicker?: unknown;
};

afterEach(() => {
  delete win.showSaveFilePicker;
  vi.restoreAllMocks();
});

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
