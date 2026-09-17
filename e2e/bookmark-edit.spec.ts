import { test, expect, type Page } from "@playwright/test";
import {
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNull,
  PDFNumber,
} from "pdf-lib";
import {
  forceDownloadSave,
  openEntryPage,
  readOutline,
  saveAsDownload,
} from "./helpers";

/** しおり付き 3 ページ PDF: Chapter 1（→1p、子 Section 1.1→2p）/ Chapter 2（→3p）。 */
async function makeBookmarkedPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < 3; i += 1) doc.addPage([300, 400]);
  const ctx = doc.context;
  const pages = doc.getPages();
  const [root, ch1, sec, ch2] = [0, 1, 2, 3].map(() => ctx.nextRef());
  const item = (
    title: string,
    pageIndex: number,
    links: Record<string, typeof root>,
  ) => {
    const dict = PDFDict.withContext(ctx);
    dict.set(PDFName.of("Title"), PDFHexString.fromText(title));
    dict.set(
      PDFName.of("Dest"),
      ctx.obj([
        pages[pageIndex]!.ref,
        PDFName.of("XYZ"),
        PDFNull,
        PDFNull,
        PDFNull,
      ]),
    );
    for (const [key, ref] of Object.entries(links)) {
      dict.set(PDFName.of(key), ref!);
    }
    return dict;
  };
  const chapter1 = item("Chapter 1", 0, {
    Parent: root!,
    Next: ch2!,
    First: sec!,
    Last: sec!,
  });
  chapter1.set(PDFName.of("Count"), PDFNumber.of(1));
  ctx.assign(ch1!, chapter1);
  ctx.assign(sec!, item("Section 1.1", 1, { Parent: ch1! }));
  ctx.assign(ch2!, item("Chapter 2", 2, { Parent: root!, Prev: ch1! }));
  ctx.assign(
    root!,
    ctx.obj({ Type: "Outlines", First: ch1!, Last: ch2!, Count: 3 }),
  );
  doc.catalog.set(PDFName.of("Outlines"), root!);
  return Buffer.from(await doc.save());
}

async function openBookmarkedPdf(page: Page) {
  await forceDownloadSave(page);
  await openEntryPage(page);
  await page.setInputFiles('input[type="file"]:not([multiple])', {
    name: "booked.pdf",
    mimeType: "application/pdf",
    buffer: await makeBookmarkedPdf(),
  });
  await expect(page.getByText("3 ページ")).toBeVisible();
  await page.getByRole("tab", { name: "しおり" }).click();
  await expect(page.getByRole("button", { name: "Chapter 1" })).toBeVisible();
}

/** 編集モードのしおりの操作メニューから項目を選ぶ。 */
async function chooseFromMenu(page: Page, title: string, action: string) {
  await page.getByRole("button", { name: `「${title}」の操作` }).click();
  await page.getByRole("menuitem", { name: action }).click();
}

const bookmarkButton = (page: Page, title: string) =>
  page.getByRole("button", { name: title, exact: true });

test.describe("しおり編集", () => {
  test("名前の変更・現在のページの追加・階層の変更・削除を行い、保存した PDF のしおりに反映される", async ({
    page,
  }) => {
    await openBookmarkedPdf(page);
    await expect(page.getByText("未保存")).toBeHidden();
    await page.getByRole("button", { name: "しおり編集" }).click();

    // 名前の変更（メニューから。Enter で確定）
    await chooseFromMenu(page, "Chapter 2", "名前を変更");
    const nameInput = page.getByRole("textbox", { name: "しおり名" });
    await nameInput.fill("第2章 設計");
    await nameInput.press("Enter");
    await expect(bookmarkButton(page, "第2章 設計")).toBeVisible();
    await expect(page.getByText("未保存")).toBeVisible();

    // 2 ページ目を表示して「現在のページを追加」→ 名前を入力
    await bookmarkButton(page, "Section 1.1").click();
    await page.getByRole("button", { name: "現在のページを追加" }).click();
    await expect(nameInput).toHaveValue("ページ 2");
    await nameInput.fill("付録");
    await nameInput.press("Enter");

    // 追加したしおり（末尾）を、直前の「第2章 設計」の下の階層にする
    await chooseFromMenu(page, "付録", "階層を下げる");

    // 子を持つ「Chapter 1」は確認のうえで子ごと削除する
    await chooseFromMenu(page, "Chapter 1", "削除");
    const confirm = page.getByRole("alertdialog");
    await expect(confirm).toContainText(
      "「Chapter 1」とその下位1件のしおりを削除します",
    );
    await confirm.getByRole("button", { name: "削除" }).click();
    await expect(bookmarkButton(page, "Chapter 1")).toBeHidden();
    await expect(bookmarkButton(page, "Section 1.1")).toBeHidden();

    // 閲覧モードに戻っても編集結果が表示される
    await page.getByRole("button", { name: "完了" }).click();
    await expect(
      page.getByRole("button", { name: "しおり編集" }),
    ).toBeVisible();
    await expect(bookmarkButton(page, "第2章 設計")).toBeVisible();
    await expect(bookmarkButton(page, "付録")).toBeVisible();

    const outline = await readOutline(await saveAsDownload(page));
    expect(outline).toEqual([
      { title: "第2章 設計", depth: 0, pageIndex: 2 },
      { title: "付録", depth: 1, pageIndex: 1 },
    ]);
  });

  test("子を持つしおりの削除は、確認でキャンセルすれば残る", async ({
    page,
  }) => {
    await openBookmarkedPdf(page);
    await page.getByRole("button", { name: "しおり編集" }).click();

    await chooseFromMenu(page, "Chapter 1", "削除");
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "キャンセル" })
      .click();
    await expect(page.getByRole("alertdialog")).toBeHidden();
    await expect(bookmarkButton(page, "Chapter 1")).toBeVisible();
    await expect(bookmarkButton(page, "Section 1.1")).toBeVisible();
    await expect(page.getByText("未保存")).toBeHidden();
  });

  test("名前の変更は Esc で取り消せ、空欄で確定すると元の名前のまま", async ({
    page,
  }) => {
    await openBookmarkedPdf(page);
    await page.getByRole("button", { name: "しおり編集" }).click();
    const nameInput = page.getByRole("textbox", { name: "しおり名" });

    await chooseFromMenu(page, "Chapter 2", "名前を変更");
    await nameInput.fill("変更しない");
    await nameInput.press("Escape");
    await expect(nameInput).toBeHidden();
    await expect(bookmarkButton(page, "Chapter 2")).toBeVisible();

    await chooseFromMenu(page, "Chapter 2", "名前を変更");
    await nameInput.fill("   ");
    await nameInput.press("Enter");
    await expect(bookmarkButton(page, "Chapter 2")).toBeVisible();

    const outline = await readOutline(await saveAsDownload(page));
    expect(outline.map((e) => e.title)).toEqual([
      "Chapter 1",
      "Section 1.1",
      "Chapter 2",
    ]);
  });
});
