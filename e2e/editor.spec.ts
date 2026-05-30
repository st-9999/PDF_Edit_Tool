import { test, expect } from "@playwright/test";
import { PDFDocument } from "pdf-lib";

async function makePdf(pageCount: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i += 1) doc.addPage([300, 400]);
  return Buffer.from(await doc.save());
}

test.describe("P2 編集コア（選択・Undo/Redo 配線）", () => {
  test("複数選択モードの切替と Undo/Redo の初期無効", async ({ page }) => {
    const buffer = await makePdf(5);
    await page.goto("/");
    await page.setInputFiles('input[type="file"]', {
      name: "s.pdf",
      mimeType: "application/pdf",
      buffer,
    });
    await expect(page.getByText("5 ページ")).toBeVisible();

    // 編集前は Undo/Redo 無効
    await expect(page.getByRole("button", { name: "元に戻す" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "やり直す" })).toBeDisabled();

    const thumb = (n: number) =>
      page.getByRole("button", { name: `ページ ${n}`, exact: true });
    const multiToggle = page.getByRole("button", { name: "ページを複数選択" });

    // 既定（複数選択モード OFF）: 単一選択のみ。Ctrl を押しても複数選択にならない
    await thumb(2).click();
    await expect(thumb(2)).toHaveAttribute("aria-pressed", "true");
    await thumb(4).click({ modifiers: ["ControlOrMeta"] });
    await expect(thumb(4)).toHaveAttribute("aria-pressed", "true");
    await expect(thumb(2)).toHaveAttribute("aria-pressed", "false"); // 置き換わる
    // ここで選択は {4}・アンカー=4

    // 複数選択モードを ON にする（直前の選択 {4} は引き継がれる）
    await multiToggle.click();
    await expect(multiToggle).toHaveAttribute("aria-pressed", "true");
    await expect(thumb(4)).toHaveAttribute("aria-pressed", "true");

    // クリックで加除トグル: 1 を追加 → {4,1}・アンカー=1
    await thumb(1).click();
    await expect(thumb(1)).toHaveAttribute("aria-pressed", "true");
    await expect(thumb(4)).toHaveAttribute("aria-pressed", "true");

    // Shift 範囲（アンカー=1 → 3 で 1..3 を選択し、範囲を置き換える）
    await thumb(3).click({ modifiers: ["Shift"] });
    for (const n of [1, 2, 3]) {
      await expect(thumb(n)).toHaveAttribute("aria-pressed", "true");
    }
    await expect(thumb(4)).toHaveAttribute("aria-pressed", "false");
    await expect(thumb(5)).toHaveAttribute("aria-pressed", "false");

    // モードを OFF に戻すと選択は 1 件（現在の閲覧ページ=3）へ畳まれる
    await multiToggle.click();
    await expect(multiToggle).toHaveAttribute("aria-pressed", "false");
    await expect(thumb(3)).toHaveAttribute("aria-pressed", "true");
    const pressedCount = await page
      .locator('button[aria-label^="ページ "][aria-pressed="true"]')
      .count();
    expect(pressedCount).toBe(1);
  });
});
