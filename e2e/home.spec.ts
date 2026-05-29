import { test, expect } from "@playwright/test";

test.describe("トップページ（P0 空アプリ）", () => {
  test("見出しとドロップゾーンが表示される", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: "PDF ビューア＆エディタ" }),
    ).toBeVisible();

    await expect(
      page.getByRole("region", { name: "PDFの読み込み" }),
    ).toBeVisible();
  });
});
