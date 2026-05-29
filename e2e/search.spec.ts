import { test, expect } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";

async function makeTextPdf(lines: string[]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const line of lines) {
    const page = doc.addPage([420, 220]);
    page.drawText(line, { x: 24, y: 160, size: 16, font });
  }
  return Buffer.from(await doc.save());
}

test.describe("P5 テキスト検索・選択", () => {
  test("テキスト選択・全選択・検索ハイライト・前後移動", async ({ page }) => {
    const buffer = await makeTextPdf(["Annual report 2026", "report summary"]);
    await page.goto("/");
    await page.setInputFiles('input[type="file"]', {
      name: "doc.pdf",
      mimeType: "application/pdf",
      buffer,
    });
    await expect(page.getByText("2 ページ")).toBeVisible();

    // テキストレイヤが描画され、選択可能なテキストが存在する
    await expect(
      page.locator(".textLayer span", { hasText: "report" }).first(),
    ).toBeVisible();

    // 全選択 → 選択テキストに既知語が含まれる
    await page.getByRole("button", { name: "全選択" }).click();
    const selected = await page.evaluate(
      () => window.getSelection()?.toString() ?? "",
    );
    expect(selected).toContain("report");

    // 検索を開いてヒット件数・ハイライト・前後移動
    await page.getByRole("button", { name: "検索", exact: true }).click();
    const input = page.getByRole("textbox", { name: "検索語" });
    await input.fill("report");
    await expect(page.getByText("1 / 2")).toBeVisible();
    await expect(page.locator("mark.search-hit").first()).toBeVisible();

    await page.getByRole("button", { name: "次のヒット" }).click();
    await expect(page.getByText("2 / 2")).toBeVisible();
  });
});
