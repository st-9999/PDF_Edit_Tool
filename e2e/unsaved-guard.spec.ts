import { test, expect } from "@playwright/test";
import { PDFDocument } from "pdf-lib";

async function makePdf(pageCount: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i += 1) doc.addPage([300, 400]);
  return Buffer.from(await doc.save());
}

async function openPdf(page: import("@playwright/test").Page, pages: number) {
  await page.goto("/");
  await page.setInputFiles('input[type="file"]', {
    name: "s.pdf",
    mimeType: "application/pdf",
    buffer: await makePdf(pages),
  });
  await expect(page.getByText(`${pages} ページ`)).toBeVisible();
}

/** ページ2を回転して未保存状態にする。 */
async function makeDirty(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "ページ 2", exact: true }).click();
  await page.getByRole("button", { name: "右に回転" }).click();
  await expect(page.getByText("未保存")).toBeVisible();
}

test.describe("未保存の変更がある状態での開く/閉じる確認", () => {
  test("未保存なら『閉じる』で確認ダイアログ。キャンセルで維持、破棄で閉じる", async ({
    page,
  }) => {
    await openPdf(page, 3);
    await makeDirty(page);

    // 閉じる → 確認ダイアログが出る
    await page.getByRole("button", { name: "閉じる" }).click();
    await expect(page.getByText("未保存の変更があります")).toBeVisible();

    // キャンセル → ダイアログが閉じ、ファイルは開いたまま（未保存も維持）
    await page.getByRole("button", { name: "キャンセル" }).click();
    await expect(page.getByText("未保存の変更があります")).toHaveCount(0);
    await expect(page.getByText("3 ページ")).toBeVisible();
    await expect(page.getByText("未保存")).toBeVisible();

    // もう一度閉じる → 破棄して閉じる → エントリ画面へ
    await page.getByRole("button", { name: "閉じる" }).click();
    await page.getByRole("button", { name: "変更を破棄して閉じる" }).click();
    await expect(
      page.getByRole("button", { name: "PDFの読み込み" }),
    ).toBeVisible();
  });

  test("未保存なら『開く』でも確認ダイアログが出る", async ({ page }) => {
    await openPdf(page, 3);
    await makeDirty(page);

    await page.getByRole("button", { name: "開く" }).click();
    await expect(page.getByText("未保存の変更があります")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "変更を破棄して開く" }),
    ).toBeVisible();

    // キャンセルでファイルは維持される
    await page.getByRole("button", { name: "キャンセル" }).click();
    await expect(page.getByText("3 ページ")).toBeVisible();
  });

  test("変更が無ければ『閉じる』は確認なしで即閉じる", async ({ page }) => {
    await openPdf(page, 3);

    await page.getByRole("button", { name: "閉じる" }).click();
    // 確認ダイアログは出ず、そのままエントリ画面へ戻る
    await expect(page.getByText("未保存の変更があります")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "PDFの読み込み" }),
    ).toBeVisible();
  });
});
