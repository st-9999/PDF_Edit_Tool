import { test, expect } from "@playwright/test";
import { PDFDocument } from "pdf-lib";

async function makePdf(pageCount: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i += 1) doc.addPage([300, 400]);
  return Buffer.from(await doc.save());
}

test.describe("P2 編集コア（選択・Undo/Redo 配線）", () => {
  test("サムネ複数選択（Ctrl/Shift）と Undo/Redo の初期無効", async ({
    page,
  }) => {
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

    // 単一選択
    await thumb(2).click();
    await expect(thumb(2)).toHaveAttribute("aria-pressed", "true");

    // Ctrl で個別追加
    await thumb(4).click({ modifiers: ["ControlOrMeta"] });
    await expect(thumb(2)).toHaveAttribute("aria-pressed", "true");
    await expect(thumb(4)).toHaveAttribute("aria-pressed", "true");

    // Shift 範囲（アンカー=4 → 1 で 1..4 を選択）
    await thumb(1).click({ modifiers: ["Shift"] });
    for (const n of [1, 2, 3, 4]) {
      await expect(thumb(n)).toHaveAttribute("aria-pressed", "true");
    }
    await expect(thumb(5)).toHaveAttribute("aria-pressed", "false");
  });
});
