import { test, expect, type Page } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { extractPageText } from "../src/lib/pdf/content/page-text";
import { buildPdf } from "../src/lib/pdf/content/pdf-fixtures.test-helper";
import {
  clickText,
  enterRewriteMode,
  forceDownloadSave,
  openEntryPage,
  rewriteDialog,
  saveAsDownload,
  textLayerSpan,
} from "../e2e/helpers";

/**
 * 本番ビルドをサブパス配下で配信したときに、開発サーバーでは確かめられない点を確かめる。
 * baseURL はサブパス（例: http://127.0.0.1:4310/pdf-edit-tool/）で、`"./"` がその直下になる。
 */

const ENTRY = "./";
/** 本番ビルドの配信サーバーのホスト（playwright.prod.config.ts と同じ）。 */
const SERVER_HOST = "127.0.0.1";

/** ページ内で発生した 400 以上の応答（同一オリジンのみ）を集める。 */
function collectFailedResponses(page: Page): string[] {
  const failed: string[] = [];
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (response.status() >= 400 && url.hostname === SERVER_HOST) {
      failed.push(`${response.status()} ${url.pathname}`);
    }
  });
  page.on("requestfailed", (request) =>
    failed.push(`failed ${request.url()} ${request.failure()?.errorText}`),
  );
  return failed;
}

/**
 * 保存用の Worker（pdf.js の Worker 以外）が作られた URL と、そこから届いたメッセージの種類を記録する。
 * 記録はページ側の `window.__buildWorkerLog` に残す。
 */
async function recordBuildWorker(page: Page) {
  await page.addInitScript(() => {
    const log: { urls: string[]; messages: string[]; errors: string[] } = {
      urls: [],
      messages: [],
      errors: [],
    };
    (window as unknown as { __buildWorkerLog: typeof log }).__buildWorkerLog =
      log;
    const Original = window.Worker;
    window.Worker = class extends Original {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        if (String(url).includes("/pdfjs/")) return;
        log.urls.push(new URL(String(url), location.href).pathname);
        this.addEventListener("message", (e: MessageEvent) =>
          log.messages.push(String(e.data?.type)),
        );
        this.addEventListener("error", (e: ErrorEvent) =>
          log.errors.push(e.message ?? "error"),
        );
      }
    };
  });
}

const buildWorkerLog = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as {
          __buildWorkerLog: {
            urls: string[];
            messages: string[];
            errors: string[];
          };
        }
      ).__buildWorkerLog,
  );

async function textPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const text of ["First page", "Second page", "Third page"]) {
    doc.addPage([400, 300]).drawText(text, { x: 40, y: 200, size: 20, font });
  }
  return Buffer.from(await doc.save());
}

test.describe("本番ビルド（サブパス配信）", () => {
  test("サブパス配下で入口画面を開き、PDF を描画してテキストを表示できる（読み込みの失敗が無い）", async ({
    page,
  }) => {
    const failed = collectFailedResponses(page);
    await openEntryPage(page, ENTRY);
    await page.setInputFiles('input[type="file"]:not([multiple])', {
      name: "text.pdf",
      mimeType: "application/pdf",
      buffer: await textPdf(),
    });
    await expect(page.getByText("3 ページ")).toBeVisible();
    await expect(textLayerSpan(page, "First page")).toBeVisible();
    await expect(page.locator("canvas").first()).toBeVisible();
    expect(failed).toEqual([]);
  });

  test("保存は、バンドルされた Worker（サブパス配下の JavaScript）で最後まで実行される", async ({
    page,
  }) => {
    const failed = collectFailedResponses(page);
    await recordBuildWorker(page);
    await forceDownloadSave(page);
    await openEntryPage(page, ENTRY);
    await page.setInputFiles('input[type="file"]:not([multiple])', {
      name: "text.pdf",
      mimeType: "application/pdf",
      buffer: await textPdf(),
    });
    await expect(page.getByText("3 ページ")).toBeVisible();

    const saved = await PDFDocument.load(await saveAsDownload(page));
    expect(saved.getPageCount()).toBe(3);

    const basePath = new URL(page.url()).pathname.replace(/\/$/, "");
    const log = await buildWorkerLog(page);
    expect(log.errors).toEqual([]);
    expect(log.urls).toHaveLength(1);
    expect(log.urls[0]!.startsWith(`${basePath}/_next/static/`)).toBe(true);
    expect(log.urls[0]!.endsWith(".js")).toBe(true);
    expect(log.messages).toContain("progress");
    expect(log.messages.at(-1)).toBe("done");
    expect(failed).toEqual([]);
  });

  test("元のフォントに無い文字の書き換えで、同梱フォントをサブパス配下から読み込み、Worker で保存できる", async ({
    page,
  }) => {
    const failed = collectFailedResponses(page);
    const fontResponses: string[] = [];
    page.on("response", (response) => {
      if (response.url().includes("/fonts/")) {
        fontResponses.push(
          `${response.status()} ${new URL(response.url()).pathname}`,
        );
      }
    });
    await recordBuildWorker(page);
    await forceDownloadSave(page);
    await openEntryPage(page, ENTRY);
    await page.setInputFiles('input[type="file"]:not([multiple])', {
      name: "rewrite.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(
        await buildPdf(["BT /F2 24 Tf 250 700 Td (yen) Tj ET"], [612, 792]),
      ),
    });
    await expect(page.getByText("1 ページ")).toBeVisible();
    await expect(textLayerSpan(page, "yen")).toBeVisible();

    await enterRewriteMode(page);
    await expect(async () => {
      await clickText(page, "yen");
      await expect(rewriteDialog(page)).toBeVisible({ timeout: 1000 });
    }).toPass();
    await rewriteDialog(page)
      .getByRole("textbox", { name: "新しい文字" })
      .fill("円");
    await expect(rewriteDialog(page).getByRole("status")).toContainText(
      "ゴシック体（Noto Sans JP）で描きます",
      { timeout: 60_000 },
    );
    await rewriteDialog(page).getByRole("button", { name: "確定" }).click();
    await expect(textLayerSpan(page, "円")).toBeVisible({ timeout: 60_000 });

    const bytes = await saveAsDownload(page);
    const text = extractPageText(await PDFDocument.load(bytes), 0)
      .glyphs.map((g) => g.text)
      .join("");
    expect(text).toBe("円");

    const basePath = new URL(page.url()).pathname.replace(/\/$/, "");
    expect(fontResponses).toContain(
      `200 ${basePath}/fonts/NotoSansJP-Regular.ttf`,
    );
    const log = await buildWorkerLog(page);
    expect(log.errors).toEqual([]);
    expect(log.messages.at(-1)).toBe("done");
    expect(failed).toEqual([]);
  });
});
