import { test, expect } from "@playwright/test";

test.describe("トップページ（未読込・空状態）", () => {
  test("ドロップゾーンとプライバシー説明が表示される", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("button", { name: "PDFの読み込み" }),
    ).toBeVisible();
    await expect(page.getByText(/サーバーに送信されません/)).toBeVisible();
  });
});
