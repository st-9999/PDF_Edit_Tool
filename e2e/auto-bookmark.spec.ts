import { test, expect, type Page } from "@playwright/test";
import { PDFDocument, PDFHexString, PDFName } from "pdf-lib";
import {
  cidFontWithProgram,
  enc,
} from "../src/lib/pdf/content/pdf-fixtures.test-helper";
import {
  forceDownloadSave,
  openEntryPage,
  readOutline,
  saveAsDownload,
} from "./helpers";

const BODY = "本文です";

/**
 * 各ページの先頭に見出し行（null なら無し）、その下に本文行を置いた PDF。
 * 日本語は ToUnicode 付きの Type0 フォント（埋め込み無し）で書き、pdf.js のテキスト抽出で読めるようにする。
 * `existingBookmark` を指定すると、1 ページ目を指す既存のしおりを 1 件付ける。
 */
async function makeReportPdf(
  headings: (string | null)[],
  existingBookmark?: string,
): Promise<Buffer> {
  const chars = [...new Set([...headings.join(""), ...BODY])];
  const codeOf = new Map(chars.map((ch, i) => [ch, i + 1]));
  const hex = (text: string) =>
    [...text]
      .map((ch) => codeOf.get(ch)!.toString(16).padStart(4, "0"))
      .join("");

  const doc = await PDFDocument.create();
  const ctx = doc.context;
  const font = ctx.register(
    cidFontWithProgram(ctx, {
      toUnicode: Object.fromEntries(chars.map((ch, i) => [i + 1, ch])),
    }),
  );
  for (const heading of headings) {
    const page = doc.addPage([400, 600]);
    const lines = [
      heading ? `BT /F1 18 Tf 40 540 Td <${hex(heading)}> Tj ET` : "",
      `BT /F1 11 Tf 40 480 Td <${hex(BODY)}> Tj ET`,
    ];
    page.node.set(PDFName.of("Resources"), ctx.obj({ Font: { F1: font } }));
    page.node.set(
      PDFName.of("Contents"),
      ctx.register(ctx.flateStream(enc(lines.join("\n")))),
    );
  }
  if (existingBookmark) {
    const root = ctx.nextRef();
    const item = ctx.register(
      ctx.obj({
        Title: PDFHexString.fromText(existingBookmark),
        Parent: root,
        Dest: [doc.getPage(0).ref, "Fit"],
      }),
    );
    ctx.assign(
      root,
      ctx.obj({ Type: "Outlines", First: item, Last: item, Count: 1 }),
    );
    doc.catalog.set(PDFName.of("Outlines"), root);
  }
  return Buffer.from(await doc.save());
}

async function openReport(page: Page, pdf: Buffer, pageCount: number) {
  await forceDownloadSave(page);
  await openEntryPage(page);
  await page.setInputFiles('input[type="file"]:not([multiple])', {
    name: "report.pdf",
    mimeType: "application/pdf",
    buffer: pdf,
  });
  await expect(page.getByText(`${pageCount} ページ`)).toBeVisible();
  await page.getByRole("tab", { name: "しおり" }).click();
  await page.getByRole("button", { name: "報告書しおり自動作成" }).click();
  return page.getByRole("dialog", { name: "報告書しおり自動作成" });
}

const HEADINGS = ["第1章 概要", "1.1 目的", "第2章 設計"];

test.describe("報告書しおり自動作成", () => {
  test("本文の章・節の見出しからしおりの階層を作り、適用すると編集モードで表示され、保存した PDF に書き込まれる", async ({
    page,
  }) => {
    const dialog = await openReport(page, await makeReportPdf(HEADINGS), 3);
    await dialog.getByRole("button", { name: "実行" }).click();

    await expect(dialog.getByText("3 件の見出しを検出しました")).toBeVisible();
    const preview = dialog.getByRole("listitem");
    await expect(
      preview.filter({ hasText: "第1章 概要" }).first(),
    ).toContainText("p.1");
    await expect(preview.filter({ hasText: "1.1 目的" }).first()).toContainText(
      "p.2",
    );
    await expect(
      preview.filter({ hasText: "第2章 設計" }).first(),
    ).toContainText("p.3");
    // 既存のしおりが無ければ、上書き／追加の選択は出ない
    await expect(dialog.getByRole("radio")).toHaveCount(0);

    await dialog.getByRole("button", { name: "適用" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("button", { name: "完了" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "「1.1 目的」の操作" }),
    ).toBeVisible();
    await expect(page.getByText("未保存")).toBeVisible();

    expect(await readOutline(await saveAsDownload(page))).toEqual([
      { title: "第1章 概要", depth: 0, pageIndex: 0 },
      { title: "1.1 目的", depth: 1, pageIndex: 1 },
      { title: "第2章 設計", depth: 0, pageIndex: 2 },
    ]);
  });

  test("既存のしおりがあるときは、末尾に追加するか上書きするかを選べる", async ({
    page,
  }) => {
    const pdf = await makeReportPdf(HEADINGS, "表紙");
    const dialog = await openReport(page, pdf, 3);
    await dialog.getByRole("button", { name: "実行" }).click();
    await expect(dialog.getByText("既存のしおり（1 件）の扱い")).toBeVisible();
    await dialog
      .getByRole("radio", { name: "末尾に追加（既存を残す）" })
      .check();
    await dialog.getByRole("button", { name: "適用" }).click();

    expect(
      (await readOutline(await saveAsDownload(page))).map((e) => e.title),
    ).toEqual(["表紙", "第1章 概要", "1.1 目的", "第2章 設計"]);
  });

  test("上書きを選ぶと既存のしおりは置き換わる", async ({ page }) => {
    const pdf = await makeReportPdf(HEADINGS, "表紙");
    const dialog = await openReport(page, pdf, 3);
    await dialog.getByRole("button", { name: "実行" }).click();
    await dialog
      .getByRole("radio", { name: "上書き（既存を削除して置き換え）" })
      .check();
    await dialog.getByRole("button", { name: "適用" }).click();

    expect(
      (await readOutline(await saveAsDownload(page))).map((e) => e.title),
    ).toEqual(["第1章 概要", "1.1 目的", "第2章 設計"]);
  });

  test("開始ページより前のページの見出しは対象にしない", async ({ page }) => {
    const dialog = await openReport(page, await makeReportPdf(HEADINGS), 3);
    await dialog.getByRole("spinbutton").fill("2");
    await dialog.getByRole("button", { name: "実行" }).click();
    await expect(dialog.getByText("2 件の見出しを検出しました")).toBeVisible();
    await expect(dialog.getByText("第1章 概要")).toHaveCount(0);
    await expect(dialog.getByText("1.1 目的")).toBeVisible();
  });

  test("見出しが無ければその旨を表示し、適用できない", async ({ page }) => {
    const dialog = await openReport(page, await makeReportPdf([null, null]), 2);
    await dialog.getByRole("button", { name: "実行" }).click();
    await expect(
      dialog.getByText("見出しが検出されませんでした"),
    ).toBeVisible();
    await expect(dialog.getByRole("button", { name: "適用" })).toBeDisabled();
  });
});
