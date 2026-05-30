import { test, expect } from "@playwright/test";
import { PDFDocument } from "pdf-lib";

async function makePdf(pageCount: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i += 1) doc.addPage([300, 400]);
  return Buffer.from(await doc.save());
}

test.describe("フッターのアイコン説明（Tooltip）", () => {
  test("ズーム/表示形式アイコンにホバーすると説明が表示される", async ({
    page,
  }) => {
    await page.goto("/");
    await page.setInputFiles('input[type="file"]', {
      name: "s.pdf",
      mimeType: "application/pdf",
      buffer: await makePdf(2),
    });
    await expect(page.getByText("2 ページ")).toBeVisible();

    // 「縮小」アイコンにホバー → フローティング説明（tooltip）が出る
    await page.getByRole("button", { name: "縮小", exact: true }).hover();
    const tip = page.locator('[data-slot="tooltip-content"]', {
      hasText: "縮小",
    });
    await expect(tip).toBeVisible();

    // 別アイコン（全体表示）でも説明が切り替わって出る
    await page.getByRole("button", { name: "全体表示", exact: true }).hover();
    await expect(
      page.locator('[data-slot="tooltip-content"]', { hasText: "全体表示" }),
    ).toBeVisible();
  });
});
