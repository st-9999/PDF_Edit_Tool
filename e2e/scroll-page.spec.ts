import { test, expect } from "@playwright/test";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/** ページ番号入りの既知ページ数 PDF を生成する。 */
async function makeSamplePdf(pageCount: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= pageCount; i += 1) {
    const page = doc.addPage([400, 560]);
    page.drawText(`Page ${i}`, {
      x: 40,
      y: 500,
      size: 48,
      font,
      color: rgb(0.1, 0.1, 0.1),
    });
  }
  return Buffer.from(await doc.save());
}

test.describe("連続表示のスクロールで現在ページが更新される", () => {
  test("ビュアーを下へスクロールすると現在ページ番号が 1 から進む", async ({
    page,
  }) => {
    const buffer = await makeSamplePdf(10);
    await page.goto("/");
    await page.setInputFiles('input[type="file"]', {
      name: "sample.pdf",
      mimeType: "application/pdf",
      buffer,
    });

    await expect(page.getByText("10 ページ")).toBeVisible();
    // 連続表示の全ページ枠が描画される（仮想化されるのは canvas のみ）
    await expect(page.locator("[data-page]")).toHaveCount(10);

    const pageInput = page.getByRole("textbox", { name: "ページ番号" });
    await expect(pageInput).toHaveValue("1");

    // ビュアーのスクロール領域を最下部へスクロール
    const scroller = page.locator("[data-viewer-scroll]");
    await scroller.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });

    // 現在ページが 1 から進む（最下部なので後半のページになるはず）
    await expect(pageInput).not.toHaveValue("1");
    const value = Number(await pageInput.inputValue());
    expect(value).toBeGreaterThan(5);
  });
});
