import { test, expect } from "@playwright/test";

test.describe("トップページ（未読込・空状態）", () => {
  test("ドロップゾーンとプライバシー説明が表示される", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("button", { name: "PDFの読み込み" }),
    ).toBeVisible();
    await expect(page.getByText(/サーバーに送信されません/)).toBeVisible();
  });

  test("タイトルと、枠外の「複数 PDF を結合」ボタンが表示される", async ({
    page,
  }) => {
    await page.goto("/");

    // タイトルと簡単な説明
    await expect(
      page.getByRole("heading", { name: "PDF ビューア＆エディタ" }),
    ).toBeVisible();

    // 結合ボタンはドロップゾーン（PDFの読み込み）の外にある
    const dropzone = page.getByRole("button", { name: "PDFの読み込み" });
    const mergeButton = page.getByRole("button", { name: "複数 PDF を結合" });
    await expect(mergeButton).toBeVisible();
    expect(
      await dropzone.evaluate(
        (zone, btn) => zone.contains(btn),
        await mergeButton.elementHandle(),
      ),
    ).toBe(false);
  });
});
