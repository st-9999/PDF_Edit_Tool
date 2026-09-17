import { test, expect, type Page } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { openEntryPage } from "./helpers";

/**
 * 保存先を選ぶ画面（File System Access）の代わりに、ブラウザ内のファイル領域（OPFS）を返す。
 * - `window.__expirePickerOnce = true` にすると、次の 1 回だけ本物の Chromium と同じ
 *   SecurityError（クリックから時間が経って画面を開けない）を投げる。
 * - 呼ばれた時点で `navigator.userActivation.isActive` だったかを `window.__pickerCalls` に記録する。
 */
async function installPickers(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as {
      __expirePickerOnce: boolean;
      __pickerCalls: { kind: string; active: boolean | undefined }[];
      showSaveFilePicker: unknown;
      showDirectoryPicker: unknown;
    };
    w.__expirePickerOnce = false;
    w.__pickerCalls = [];
    const record = (kind: string) =>
      w.__pickerCalls.push({
        kind,
        active: navigator.userActivation?.isActive,
      });
    w.showSaveFilePicker = async (options?: { suggestedName?: string }) => {
      record("file");
      if (w.__expirePickerOnce) {
        w.__expirePickerOnce = false;
        throw new DOMException(
          "Must be handling a user gesture to show a file picker.",
          "SecurityError",
        );
      }
      const root = await navigator.storage.getDirectory();
      return root.getFileHandle(options?.suggestedName ?? "out.pdf", {
        create: true,
      });
    };
    w.showDirectoryPicker = async () => {
      record("directory");
      const root = await navigator.storage.getDirectory();
      return root.getDirectoryHandle("split", { create: true });
    };
  });
}

async function makePdf(pageCount: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i += 1) doc.addPage([300, 400 + i]);
  return Buffer.from(await doc.save());
}

async function openPdf(page: Page, pageCount: number) {
  await installPickers(page);
  await openEntryPage(page);
  // OPFS は同じオリジンで残るため、前のテストの内容を消しておく
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    for await (const name of (
      root as unknown as { keys(): AsyncIterable<string> }
    ).keys()) {
      await root.removeEntry(name, { recursive: true });
    }
  });
  await page.setInputFiles('input[type="file"]:not([multiple])', {
    name: "doc.pdf",
    mimeType: "application/pdf",
    buffer: await makePdf(pageCount),
  });
  await expect(page.getByText(`${pageCount} ページ`)).toBeVisible();
}

/** OPFS のファイルのページ数（無ければ null）。 */
const pageCountOf = (page: Page, path: string[]) =>
  page
    .evaluate(async (segments) => {
      let dir = await navigator.storage.getDirectory();
      for (const name of segments.slice(0, -1)) {
        dir = await dir.getDirectoryHandle(name);
      }
      try {
        const file = await (
          await dir.getFileHandle(segments[segments.length - 1]!)
        ).getFile();
        return new Uint8Array(await file.arrayBuffer());
      } catch {
        return null;
      }
    }, path)
    .then(async (bytes) =>
      bytes
        ? (
            await PDFDocument.load(new Uint8Array(Object.values(bytes)))
          ).getPageCount()
        : null,
    );

const pickerCalls = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as {
          __pickerCalls: { kind: string; active: boolean | undefined }[];
        }
      ).__pickerCalls,
  );

test.describe("保存先の選択（File System Access）", () => {
  test("PDF の作成に時間がかかり保存先の画面を開けなかったら、通知のボタンから保存先を選んで保存できる", async ({
    page,
  }) => {
    await openPdf(page, 3);
    await page.evaluate(() => {
      (
        window as unknown as { __expirePickerOnce: boolean }
      ).__expirePickerOnce = true;
    });

    await page.getByRole("button", { name: "保存" }).click();
    await page.getByRole("menuitem", { name: "名前を付けて保存" }).click();

    const notice = page
      .locator("[data-sonner-toast]")
      .filter({ hasText: "保存の準備ができました" });
    await expect(notice).toBeVisible();
    await expect(page.getByText("保存に失敗しました")).toHaveCount(0);

    await notice.getByRole("button", { name: "保存先を選ぶ" }).click();
    await expect(page.getByText("保存しました: doc.pdf")).toBeVisible();
    expect(await pageCountOf(page, ["doc.pdf"])).toBe(3);

    const calls = await pickerCalls(page);
    expect(calls.map((c) => c.kind)).toEqual(["file", "file"]);
  });

  test("通知のボタンを押す前に編集したら保存せず、もう一度保存するよう案内する", async ({
    page,
  }) => {
    await openPdf(page, 3);
    await page.evaluate(() => {
      (
        window as unknown as { __expirePickerOnce: boolean }
      ).__expirePickerOnce = true;
    });
    await page.getByRole("button", { name: "保存" }).click();
    await page.getByRole("menuitem", { name: "名前を付けて保存" }).click();
    const notice = page
      .locator("[data-sonner-toast]")
      .filter({ hasText: "保存の準備ができました" });
    await expect(notice).toBeVisible();

    await page.getByRole("button", { name: "ページ 2", exact: true }).click();
    await page.getByRole("button", { name: "右に回転" }).click();
    await notice.getByRole("button", { name: "保存先を選ぶ" }).click();

    await expect(
      page.getByText(
        "PDF の作成後に編集されたため、もう一度保存を実行してください",
      ),
    ).toBeVisible();
    expect(await pageCountOf(page, ["doc.pdf"])).toBeNull();
    expect((await pickerCalls(page)).map((c) => c.kind)).toEqual(["file"]);
  });

  test("分割保存はクリック直後にフォルダを 1 回だけ選び、全ファイルを書き込む（同名のファイルは上書きしない）", async ({
    page,
  }) => {
    await openPdf(page, 5);
    // 既に同名のファイルがあるフォルダ
    await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle("split", { create: true });
      const writable = await (
        await dir.getFileHandle("doc-01.pdf", { create: true })
      ).createWritable();
      await writable.write("existing");
      await writable.close();
    });

    await page.getByRole("button", { name: "ページ 3", exact: true }).click();
    await page.getByRole("button", { name: "保存" }).click();
    await page.getByRole("menuitem", { name: "分割して保存" }).click();
    await expect(page.getByText("2 ファイルを保存しました")).toBeVisible();

    const calls = await pickerCalls(page);
    expect(calls).toEqual([{ kind: "directory", active: true }]);
    expect(await pageCountOf(page, ["split", "doc-01 (1).pdf"])).toBe(2);
    expect(await pageCountOf(page, ["split", "doc-02.pdf"])).toBe(3);
    const existing = await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle("split");
      return (await (await dir.getFileHandle("doc-01.pdf")).getFile()).text();
    });
    expect(existing).toBe("existing");
  });
});
