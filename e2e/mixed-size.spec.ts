import { test, expect } from "@playwright/test";
import { PDFDocument, rgb } from "pdf-lib";

/** 幅の異なるページを混在させた PDF を生成する。 */
async function mixedPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const sizes: [number, number][] = [
    [300, 400],
    [560, 400],
    [300, 400],
  ];
  for (const [w, h] of sizes) {
    const p = doc.addPage([w, h]);
    p.drawRectangle({
      x: 0,
      y: 0,
      width: w,
      height: h,
      color: rgb(0.9, 0.9, 0.95),
    });
  }
  return Buffer.from(await doc.save());
}

test.describe("サイズ混在 PDF の表示", () => {
  test("幅の異なるページも各ページが中央寄せで表示される", async ({ page }) => {
    await page.goto("/");
    await page.setInputFiles('input[type="file"]', {
      name: "mixed.pdf",
      mimeType: "application/pdf",
      buffer: await mixedPdf(),
    });
    await expect(page.getByText("3 ページ")).toBeVisible();
    await page.locator("[data-page] canvas").first().waitFor();
    // 各ページの実寸測定（遅延）が反映されるのを待つ
    await page.waitForTimeout(500);

    const data = await page.evaluate(() => {
      const scroll = document.querySelector(
        "[data-viewer-scroll]",
      ) as HTMLElement;
      const cLeft = scroll.getBoundingClientRect().left;
      const cWidth = scroll.clientWidth; // スクロールバー除外
      const cCenter = cLeft + cWidth / 2;
      return Array.from(
        document.querySelectorAll<HTMLElement>("[data-page]"),
      ).map((el) => {
        const r = el.getBoundingClientRect();
        return {
          width: Math.round(r.width),
          centerDelta: Math.round(r.left + r.width / 2 - cCenter),
        };
      });
    });

    // 幅が混在していること（少なくとも 2 種類の幅）を確認
    const widths = new Set(data.map((d) => d.width));
    expect(widths.size).toBeGreaterThan(1);
    // 幅の広いページ（560px 相当）が含まれる
    expect(data.some((d) => d.width >= 500)).toBe(true);

    // すべてのページがビュアー中央に揃っている（中心ずれ 2px 以内）
    for (const d of data) {
      expect(Math.abs(d.centerDelta)).toBeLessThanOrEqual(2);
    }
  });
});
