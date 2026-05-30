import { test, expect } from "@playwright/test";
import { PDFDocument } from "pdf-lib";

async function makePdf(pageCount: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i += 1) doc.addPage([300, 400]);
  return Buffer.from(await doc.save());
}

async function open(page: import("@playwright/test").Page, pages: number) {
  await page.goto("/");
  await page.setInputFiles('input[type="file"]', {
    name: "s.pdf",
    mimeType: "application/pdf",
    buffer: await makePdf(pages),
  });
  await expect(page.getByText(`${pages} ページ`)).toBeVisible();
}

test.describe("ページを一覧整理（グリッド整理画面）", () => {
  test("入口→グリッド表示・選択・削除・ビューアに戻る", async ({ page }) => {
    await open(page, 4);

    // 入口ボタンで整理画面へ
    await page.getByRole("button", { name: "ページを一覧整理" }).click();
    await expect(
      page.getByRole("button", { name: "ビューアに戻る" }),
    ).toBeVisible();
    // 複数選択の案内表記が出る
    await expect(page.getByText(/Ctrl＋クリックで複数選択/)).toBeVisible();
    // グリッドに 4 ページ分のサムネが出る
    await expect(
      page.getByRole("button", { name: /^ページ \d+$/ }),
    ).toHaveCount(4);

    // 1 ページ選択 → 選択数表示
    await page.getByRole("button", { name: "ページ 1", exact: true }).click();
    await expect(page.getByText("1 ページ選択中")).toBeVisible();

    // 削除（確認 → 削除する）→ 3 ページに減る
    await page.getByRole("button", { name: "削除", exact: true }).click();
    await page.getByRole("button", { name: "削除する" }).click();
    await expect(page.getByText("3 ページ")).toBeVisible();
    await expect(page.getByText("未保存")).toBeVisible();

    await page.screenshot({ path: "tmp/organize.png" });

    // ビューアに戻る → グリッドが消えてビューア（ページ表示領域）に戻る
    await page.getByRole("button", { name: "ビューアに戻る" }).click();
    await expect(page.getByLabel("ページ表示領域")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "ビューアに戻る" }),
    ).toHaveCount(0);
    // 削除は維持されている
    await expect(page.getByText("3 ページ")).toBeVisible();
  });

  test("ドラッグでページを並べ替えできる（未保存になる）", async ({ page }) => {
    await open(page, 4);
    await page.getByRole("button", { name: "ページを一覧整理" }).click();

    const tile1 = page.getByRole("button", { name: "ページ 1", exact: true });
    const tile3 = page.getByRole("button", { name: "ページ 3", exact: true });
    const a = await tile1.boundingBox();
    const b = await tile3.boundingBox();
    if (!a || !b) throw new Error("タイルが見つかりません");

    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    // しきい値（4px）を超えて移動してドラッグ開始 → ターゲットへ
    await page.mouse.move(a.x + a.width / 2 + 10, a.y + a.height / 2, {
      steps: 3,
    });
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 10 });
    await page.mouse.up();

    // 並べ替え＝編集が積まれ未保存・Undo 有効
    await expect(page.getByText("未保存")).toBeVisible();
    await expect(page.getByRole("button", { name: "元に戻す" })).toBeEnabled();
    // ページ数は変わらない
    await expect(page.getByText("4 ページ")).toBeVisible();
  });
});
