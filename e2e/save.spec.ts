import { test, expect } from "@playwright/test";
import { PDFDocument } from "pdf-lib";

async function makePdf(pageCount: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i += 1) doc.addPage([300, 400]);
  return Buffer.from(await doc.save());
}

test.describe("P4 保存層（Firefox フォールバック）", () => {
  test("showSaveFilePicker 非対応ではダウンロードで保存される", async ({
    page,
  }) => {
    // Firefox 相当に能力を無効化（FS Access 非対応）
    await page.addInitScript(() => {
      // @ts-expect-error テスト用に能力を削除
      delete window.showSaveFilePicker;
    });

    const buffer = await makePdf(3);
    await page.goto("/");
    await page.setInputFiles('input[type="file"]', {
      name: "original.pdf",
      mimeType: "application/pdf",
      buffer,
    });
    await expect(page.getByText("3 ページ")).toBeVisible();

    // 保存メニュー → 名前を付けて保存 → ダウンロード発火
    await page.getByRole("button", { name: "保存" }).click();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("menuitem", { name: "名前を付けて保存" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("original.pdf");
  });
});
