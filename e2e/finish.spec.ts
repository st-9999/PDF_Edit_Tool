import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { PDFDocument } from "pdf-lib";

async function makePdf(pageCount: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i += 1) doc.addPage([300, 400]);
  return Buffer.from(await doc.save());
}

test.describe("P8 仕上げ", () => {
  test("破損PDFはエラートーストを出して空状態に戻る", async ({ page }) => {
    await page.goto("/");
    await page.setInputFiles('input[type="file"]', {
      name: "broken.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.7 これは壊れたデータ not a real pdf"),
    });
    await expect(page.getByText(/読み込めません|破損/)).toBeVisible();
    // 空状態のドロップゾーンに戻る
    await expect(
      page.getByRole("button", { name: "PDFの読み込み" }),
    ).toBeVisible();
  });

  test("通し: 読込→回転→削除→保存→再読込で検証", async ({ page }) => {
    // ダウンロード経路を強制（ヘッドレスで保存ダイアログを回避）
    await page.addInitScript(() => {
      // @ts-expect-error テスト用に能力を削除
      delete window.showSaveFilePicker;
    });

    await page.goto("/");
    await page.setInputFiles('input[type="file"]', {
      name: "flow.pdf",
      mimeType: "application/pdf",
      buffer: await makePdf(5),
    });
    // Firefox は pdf.js worker/wasm の初回初期化が遅いことがあるため余裕を持つ
    await expect(page.getByText("5 ページ")).toBeVisible({ timeout: 20000 });

    await page.getByRole("button", { name: "単ページ表示" }).click();

    // ページ2を選択して右回転
    await page.getByRole("button", { name: "ページ 2", exact: true }).click();
    await page.getByRole("button", { name: "右に回転" }).click();

    // ページ3を選択して削除
    await page.getByRole("button", { name: "ページ 3", exact: true }).click();
    await page.getByRole("button", { name: "削除", exact: true }).click();
    await page.getByRole("button", { name: "削除する" }).click();
    await expect(page.getByText("4 ページ")).toBeVisible();

    // 保存（名前を付けて保存→ダウンロード）
    await page.getByRole("button", { name: "保存" }).click();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("menuitem", { name: "名前を付けて保存" }).click();
    const download = await downloadPromise;

    // 保存結果を再読込して検証: 4 ページ・元ページ2が 90 度回転
    const path = await download.path();
    const out = await PDFDocument.load(readFileSync(path));
    expect(out.getPageCount()).toBe(4);
    expect(out.getPage(1).getRotation().angle).toBe(90);
  });
});
