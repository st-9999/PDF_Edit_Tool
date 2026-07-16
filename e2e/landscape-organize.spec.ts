import { test, expect } from "@playwright/test";
import { PDFDocument, rgb } from "pdf-lib";

/** A3 横（1191x842pt）のページだけの PDF を生成する。 */
async function a3LandscapePdf(pageCount: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i += 1) {
    const p = doc.addPage([1191, 842]);
    p.drawRectangle({
      x: 0,
      y: 0,
      width: 1191,
      height: 842,
      color: rgb(0.9, 0.92, 0.98),
    });
  }
  return Buffer.from(await doc.save());
}

/** 一覧のタイル矩形を集める。 */
async function tileRects(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const tiles = [...document.querySelectorAll("button[aria-label]")].filter(
      (b) => /^ページ \d+$/.test(b.getAttribute("aria-label") ?? ""),
    );
    return tiles.map((t) => {
      const r = t.getBoundingClientRect();
      return {
        label: t.getAttribute("aria-label") ?? "",
        x: r.left,
        y: r.top,
        w: r.width,
        h: r.height,
      };
    });
  });
}

/** 矩形同士が重なっている組を返す。 */
function findOverlaps(rects: Awaited<ReturnType<typeof tileRects>>) {
  const overlaps: string[] = [];
  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) {
      const a = rects[i];
      const b = rects[j];
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ox > 0.5 && oy > 0.5) {
        overlaps.push(`${a.label} と ${b.label}（${ox.toFixed(1)}px 重複）`);
      }
    }
  }
  return overlaps;
}

test.describe("A3 横ページの一覧表示", () => {
  test("一覧のサムネイルが隣と重ならない", async ({ page }) => {
    await page.goto("/");
    await page.setInputFiles('input[type="file"]', {
      name: "a3-landscape.pdf",
      mimeType: "application/pdf",
      buffer: await a3LandscapePdf(9),
    });
    await page.locator('button[aria-label="ページ 9"]').waitFor();

    await page.getByRole("button", { name: "ページを一覧整理" }).click();
    await page.locator("canvas").first().waitFor();
    // 実寸が反映されるまで待つ（描画後に枠サイズが確定する）
    await page.waitForTimeout(600);

    const rects = await tileRects(page);
    expect(rects).toHaveLength(9);
    expect(findOverlaps(rects)).toEqual([]);
  });

  test("横長ページのサムネイル実寸がサムネ基準幅を超えない", async ({
    page,
  }) => {
    await page.goto("/");
    await page.setInputFiles('input[type="file"]', {
      name: "a3-landscape.pdf",
      mimeType: "application/pdf",
      buffer: await a3LandscapePdf(2),
    });
    await page.locator('button[aria-label="ページ 1"]').waitFor();
    await page.locator("canvas").first().waitFor();
    await page.waitForTimeout(600);

    // 左ペインのサムネ canvas。基準幅 140px を超えていたら旧不具合の再発。
    const size = await page.evaluate(() => {
      const canvas = document
        .querySelector('button[aria-label="ページ 1"]')
        ?.querySelector("canvas");
      if (!canvas) return null;
      const r = canvas.getBoundingClientRect();
      return { w: r.width, h: r.height };
    });
    expect(size).not.toBeNull();
    expect(size!.w).toBeLessThanOrEqual(141);
    // A3 横は幅 140px・高さ約 99px に収まる（旧実装では 198x140 だった）
    expect(size!.h).toBeLessThan(size!.w);
  });
});

test.describe("サムネイル選択時の上部バー", () => {
  test("左ペインからページを選んでも上部バーと編集ツールバーが消えない", async ({
    page,
  }) => {
    await page.goto("/");
    await page.setInputFiles('input[type="file"]', {
      name: "a3-landscape.pdf",
      mimeType: "application/pdf",
      buffer: await a3LandscapePdf(5),
    });
    await page.locator('button[aria-label="ページ 5"]').waitFor();
    await page.locator("canvas").first().waitFor();

    const header = page.locator("header").first();
    await expect(header).toBeVisible();

    await page.locator('button[aria-label="ページ 4"]').click();
    await page.waitForTimeout(300);

    // ヘッダが画面内に残っていること（旧不具合ではドキュメントごとスクロールして隠れた）
    await expect(header).toBeVisible();
    const state = await page.evaluate(() => {
      const h = document.querySelector("header");
      const r = h?.getBoundingClientRect();
      return {
        docScrollTop: document.documentElement.scrollTop,
        headerTop: r?.top ?? null,
        headerHeight: r?.height ?? 0,
      };
    });
    // ビューポートは決してスクロールしない（pdf.js の計測用 canvas による余剰高さの回帰検知）
    expect(state.docScrollTop).toBe(0);
    expect(state.headerTop).toBe(0);
    expect(state.headerHeight).toBeGreaterThan(0);
  });

  test("pdf.js の計測用 canvas がレイアウトを押し広げない", async ({
    page,
  }) => {
    await page.goto("/");
    await page.setInputFiles('input[type="file"]', {
      name: "a3-landscape.pdf",
      mimeType: "application/pdf",
      buffer: await a3LandscapePdf(2),
    });
    await page.locator('button[aria-label="ページ 1"]').waitFor();
    await page.locator("canvas").first().waitFor();
    await page.waitForTimeout(400);

    const info = await page.evaluate(() => {
      const hidden = [
        ...document.querySelectorAll("canvas.hiddenCanvasElement"),
      ];
      return {
        overflow:
          document.documentElement.scrollHeight -
          document.documentElement.clientHeight,
        hiddenVisible: hidden.filter(
          (c) => getComputedStyle(c).display !== "none",
        ).length,
      };
    });
    expect(info.overflow).toBe(0);
    expect(info.hiddenVisible).toBe(0);
  });
});
