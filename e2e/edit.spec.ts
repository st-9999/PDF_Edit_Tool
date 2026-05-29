import { test, expect } from "@playwright/test";
import { PDFDocument } from "pdf-lib";

async function makePdf(pageCount: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i += 1) doc.addPage([300, 400]);
  return Buffer.from(await doc.save());
}

test.describe("P3 編集機能（回転・削除・Undo）", () => {
  test("回転で未保存になり、削除でページ数が減り、Undo で戻る", async ({
    page,
  }) => {
    const buffer = await makePdf(5);
    await page.goto("/");
    await page.setInputFiles('input[type="file"]', {
      name: "s.pdf",
      mimeType: "application/pdf",
      buffer,
    });
    await expect(page.getByText("5 ページ")).toBeVisible();

    // ページ2を選択して右回転 → 未保存・Undo 有効
    await page.getByRole("button", { name: "ページ 2", exact: true }).click();
    await page.getByRole("button", { name: "右に回転" }).click();
    await expect(page.getByText("未保存")).toBeVisible();
    const undo = page.getByRole("button", { name: "元に戻す" });
    await expect(undo).toBeEnabled();

    // Undo で未保存が消える
    await undo.click();
    await expect(page.getByText("未保存")).toHaveCount(0);

    // ページ3を選択して削除（確認ダイアログ → 削除する）
    await page.getByRole("button", { name: "ページ 3", exact: true }).click();
    await page.getByRole("button", { name: "削除", exact: true }).click();
    await page.getByRole("button", { name: "削除する" }).click();
    await expect(page.getByText("4 ページ")).toBeVisible();

    // Undo で 5 ページに戻る
    await page.getByRole("button", { name: "元に戻す" }).click();
    await expect(page.getByText("5 ページ")).toBeVisible();
  });
});
