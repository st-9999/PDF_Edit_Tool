import { test, expect } from "@playwright/test";

test.describe("トップページ（未読込・空状態）", () => {
  test("ドロップゾーンとプライバシー説明が表示される", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("button", { name: "PDFの読み込み" }),
    ).toBeVisible();
    await expect(page.getByText(/サーバーに送信されません/)).toBeVisible();
  });

  test("タイトルと、単一読み込みと同じサイズの「複数 PDF を結合」枠が表示される", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: "PDF ビューア＆エディタ" }),
    ).toBeVisible();

    const single = page.getByRole("button", { name: "PDFの読み込み" });
    const merge = page.getByRole("button", {
      name: "結合する複数 PDF の読み込み",
    });
    await expect(merge).toBeVisible();
    await expect(merge).toContainText("複数 PDF を結合");

    const a = await single.boundingBox();
    const b = await merge.boundingBox();
    if (!a || !b) throw new Error("枠の位置を取得できません");

    // 同じサイズ（サブピクセルの丸め誤差のみ許容）
    expect(Math.abs(a.width - b.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(a.height - b.height)).toBeLessThanOrEqual(1);

    // 横並び（上端がそろい、左右に重ならない）
    expect(Math.abs(a.y - b.y)).toBeLessThanOrEqual(1);
    expect(a.x + a.width).toBeLessThanOrEqual(b.x);

    // 初期表示のビューポート内に収まっている（スクロールせずに見つけられる）
    const viewport = page.viewportSize();
    if (!viewport) throw new Error("ビューポートサイズを取得できません");
    expect(b.y + b.height).toBeLessThanOrEqual(viewport.height);
  });
});
