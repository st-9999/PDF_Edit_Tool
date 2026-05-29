import { test, expect } from "@playwright/test";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/** ページ番号入りの既知ページ数 PDF を生成する。 */
async function makeSamplePdf(pageCount: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle("E2E Sample");
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

test.describe("ビューア基盤（実 PDF を読み込み）", () => {
  test("読み込み後にページ数取得・描画・ページ送りができる", async ({
    page,
  }) => {
    const buffer = await makeSamplePdf(5);

    await page.goto("/");
    await page.setInputFiles('input[type="file"]', {
      name: "sample.pdf",
      mimeType: "application/pdf",
      buffer,
    });

    // ステータスバーに総ページ数が出る（= pdf.js でロード・解析できた）
    await expect(page.getByText("5 ページ")).toBeVisible();

    // 1 ページ目の canvas が描画される
    await expect(page.getByLabel("ページ 1").first()).toBeVisible();

    // 単ページ表示に切り替え、次ページへ送る
    await page.getByRole("button", { name: "単ページ表示" }).click();
    await page.getByRole("button", { name: "次のページ" }).click();
    await expect(page.getByLabel("ページ 2").first()).toBeVisible();

    // ページ番号入力で 4 ページへジャンプ
    const pageInput = page.getByRole("textbox", { name: "ページ番号" });
    await pageInput.fill("4");
    await pageInput.press("Enter");
    await expect(page.getByLabel("ページ 4").first()).toBeVisible();
  });
});
