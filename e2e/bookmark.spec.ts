import { test, expect } from "@playwright/test";
import { PDFDocument, PDFName, PDFString } from "pdf-lib";

async function makePlainPdf(pageCount: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i += 1) doc.addPage([300, 400]);
  return Buffer.from(await doc.save());
}

/** 2 項目のアウトライン（ページ1・ページ3）を持つ 3 ページ PDF。 */
async function makeOutlinePdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const pages = [
    doc.addPage([300, 400]),
    doc.addPage([300, 400]),
    doc.addPage([300, 400]),
  ];
  const ctx = doc.context;
  const outlinesRef = ctx.nextRef();
  const item1Ref = ctx.nextRef();
  const item2Ref = ctx.nextRef();
  ctx.assign(
    item1Ref,
    ctx.obj({
      Title: PDFString.of("Chapter 1"),
      Parent: outlinesRef,
      Dest: ctx.obj([pages[0]!.ref, PDFName.of("Fit")]),
      Next: item2Ref,
    }),
  );
  ctx.assign(
    item2Ref,
    ctx.obj({
      Title: PDFString.of("Chapter 2"),
      Parent: outlinesRef,
      Dest: ctx.obj([pages[2]!.ref, PDFName.of("Fit")]),
      Prev: item1Ref,
    }),
  );
  ctx.assign(
    outlinesRef,
    ctx.obj({
      Type: PDFName.of("Outlines"),
      First: item1Ref,
      Last: item2Ref,
      Count: 2,
    }),
  );
  doc.catalog.set(PDFName.of("Outlines"), outlinesRef);
  return Buffer.from(await doc.save());
}

test.describe("P6 しおり表示", () => {
  test("アウトラインをツリー表示し、クリックで該当ページへジャンプ", async ({
    page,
  }) => {
    await page.goto("/");
    await page.setInputFiles('input[type="file"]', {
      name: "outline.pdf",
      mimeType: "application/pdf",
      buffer: await makeOutlinePdf(),
    });
    await expect(page.getByText("3 ページ")).toBeVisible();

    await page.getByRole("button", { name: "単ページ表示" }).click();
    await page.getByRole("tab", { name: "しおり" }).click();
    await expect(page.getByRole("button", { name: "Chapter 1" })).toBeVisible();

    await page.getByRole("button", { name: "Chapter 2" }).click();
    await expect(page.getByRole("textbox", { name: "ページ番号" })).toHaveValue(
      "3",
    );
  });

  test("アウトライン無しは空状態を表示", async ({ page }) => {
    await page.goto("/");
    await page.setInputFiles('input[type="file"]', {
      name: "plain.pdf",
      mimeType: "application/pdf",
      buffer: await makePlainPdf(2),
    });
    await expect(page.getByText("2 ページ")).toBeVisible();

    await page.getByRole("tab", { name: "しおり" }).click();
    await expect(
      page.getByText(/しおり（アウトライン）がありません/),
    ).toBeVisible();
  });
});
