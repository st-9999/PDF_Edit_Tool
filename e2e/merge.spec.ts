import { test, expect } from "@playwright/test";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/** ラベル付きの既知ページ数 PDF を生成する。 */
async function makeSamplePdf(
  label: string,
  pageCount: number,
): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle(`E2E ${label}`);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= pageCount; i += 1) {
    const page = doc.addPage([400, 560]);
    page.drawText(`${label} ${i}`, {
      x: 40,
      y: 500,
      size: 40,
      font,
      color: rgb(0.1, 0.1, 0.1),
    });
  }
  return Buffer.from(await doc.save());
}

test.describe("複数 PDF 結合フロー（エントリ画面）", () => {
  test("複数選択 → 順序修正 → 結合してビュアーで開く", async ({ page }) => {
    const a = await makeSamplePdf("A", 3);
    const b = await makeSamplePdf("B", 2);

    await page.goto("/");

    // 結合モードへ
    await page.getByRole("button", { name: "複数 PDF を結合" }).click();

    // 結合用ファイル入力に 2 ファイルを投入
    await page.setInputFiles('input[type="file"]', [
      { name: "a.pdf", mimeType: "application/pdf", buffer: a },
      { name: "b.pdf", mimeType: "application/pdf", buffer: b },
    ]);

    // 一覧にファイル名とページ数が出る（= pdf.js で解析できた）
    await expect(page.getByText("a.pdf")).toBeVisible();
    await expect(page.getByText("b.pdf")).toBeVisible();
    await expect(page.getByText("3 ページ ・", { exact: false })).toBeVisible();
    await expect(page.getByText("2 ページ ・", { exact: false })).toBeVisible();

    // 初期順序は a.pdf が先頭
    const items = page.getByRole("listitem");
    await expect(items.first()).toContainText("a.pdf");

    // 2 番目（b.pdf）を上へ移動 → 先頭が b.pdf になる
    await page.getByRole("button", { name: "2 番目を上へ" }).click();
    await expect(items.first()).toContainText("b.pdf");

    // 結合してビュアーで開く
    await page.getByRole("button", { name: "結合してビュアーで開く" }).click();

    // 合計 5 ページのドキュメントとして開かれる
    await expect(page.getByText("5 ページ")).toBeVisible();
    // ファイル名は merged.pdf
    await expect(page.getByText("merged.pdf")).toBeVisible();
    // 1 ページ目の canvas が描画される
    await expect(page.getByLabel("ページ 1").first()).toBeVisible();
  });

  test("2 件未満では結合ボタンが無効", async ({ page }) => {
    const a = await makeSamplePdf("A", 1);

    await page.goto("/");
    await page.getByRole("button", { name: "複数 PDF を結合" }).click();
    await page.setInputFiles('input[type="file"]', [
      { name: "a.pdf", mimeType: "application/pdf", buffer: a },
    ]);

    await expect(page.getByText("a.pdf")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "結合してビュアーで開く" }),
    ).toBeDisabled();
    await expect(
      page.getByText("2 つ以上の PDF を追加してください"),
    ).toBeVisible();
  });
});
