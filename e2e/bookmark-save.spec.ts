import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import {
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNull,
  PDFNumber,
  PDFRef,
} from "pdf-lib";

/** しおり付き 3 ページ PDF を生成: Chapter 1(→1p, 子 Section 1.1→2p) / Chapter 2(→3p)。 */
async function makeBookmarkedPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < 3; i += 1) doc.addPage([300, 400]);
  const ctx = doc.context;
  const pages = doc.getPages();
  const dest = (pi: number) =>
    ctx.obj([pages[pi]!.ref, PDFName.of("XYZ"), PDFNull, PDFNull, PDFNull]);

  const outlinesRef = ctx.nextRef();
  const ch1 = ctx.nextRef();
  const sec = ctx.nextRef();
  const ch2 = ctx.nextRef();

  const d1 = PDFDict.withContext(ctx);
  d1.set(PDFName.of("Title"), PDFHexString.fromText("Chapter 1"));
  d1.set(PDFName.of("Parent"), outlinesRef);
  d1.set(PDFName.of("Next"), ch2);
  d1.set(PDFName.of("First"), sec);
  d1.set(PDFName.of("Last"), sec);
  d1.set(PDFName.of("Count"), PDFNumber.of(1));
  d1.set(PDFName.of("Dest"), dest(0));
  ctx.assign(ch1, d1);

  const ds = PDFDict.withContext(ctx);
  ds.set(PDFName.of("Title"), PDFHexString.fromText("Section 1.1"));
  ds.set(PDFName.of("Parent"), ch1);
  ds.set(PDFName.of("Dest"), dest(1));
  ctx.assign(sec, ds);

  const d2 = PDFDict.withContext(ctx);
  d2.set(PDFName.of("Title"), PDFHexString.fromText("Chapter 2"));
  d2.set(PDFName.of("Parent"), outlinesRef);
  d2.set(PDFName.of("Prev"), ch1);
  d2.set(PDFName.of("Dest"), dest(2));
  ctx.assign(ch2, d2);

  const root = PDFDict.withContext(ctx);
  root.set(PDFName.of("Type"), PDFName.of("Outlines"));
  root.set(PDFName.of("First"), ch1);
  root.set(PDFName.of("Last"), ch2);
  root.set(PDFName.of("Count"), PDFNumber.of(3));
  ctx.assign(outlinesRef, root);
  doc.catalog.set(PDFName.of("Outlines"), outlinesRef);

  return Buffer.from(await doc.save());
}

/** 保存された PDF のしおりタイトルを階層順（深さ優先）で抽出する。 */
async function outlineTitles(bytes: Buffer): Promise<string[]> {
  const doc = await PDFDocument.load(bytes);
  const outlinesRef = doc.catalog.get(PDFName.of("Outlines"));
  if (!(outlinesRef instanceof PDFRef)) return [];
  const asRef = (v: unknown): PDFRef | undefined =>
    v instanceof PDFRef ? v : undefined;
  const titles: string[] = [];
  const walk = (firstRef: PDFRef) => {
    let ref: PDFRef | undefined = firstRef;
    while (ref) {
      const dict = doc.context.lookup(ref, PDFDict);
      const t = dict.lookup(PDFName.of("Title")) as unknown as {
        decodeText(): string;
      };
      titles.push(t.decodeText());
      const first = asRef(dict.get(PDFName.of("First")));
      if (first) walk(first);
      ref = asRef(dict.get(PDFName.of("Next")));
    }
  };
  const outlines = doc.context.lookup(outlinesRef, PDFDict);
  const first = asRef(outlines.get(PDFName.of("First")));
  if (first) walk(first);
  return titles;
}

test.describe("しおり付き PDF の保存", () => {
  test("しおりを保持したまま保存できる（保存で消えない）", async ({ page }) => {
    await page.addInitScript(() => {
      // @ts-expect-error テスト用に能力を削除しダウンロード経路を強制
      delete window.showSaveFilePicker;
    });

    await page.goto("/");
    await page.setInputFiles('input[type="file"]', {
      name: "booked.pdf",
      mimeType: "application/pdf",
      buffer: await makeBookmarkedPdf(),
    });
    await expect(page.getByText("3 ページ")).toBeVisible({ timeout: 20000 });

    // しおりタブに元のしおりが表示される（読み込み確認）
    await page.getByRole("tab", { name: "しおり" }).click();
    await expect(page.getByText("Chapter 1")).toBeVisible();
    await expect(page.getByText("Chapter 2")).toBeVisible();

    // 名前を付けて保存 → ダウンロード
    await page.getByRole("button", { name: "保存" }).click();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("menuitem", { name: "名前を付けて保存" }).click();
    const download = await downloadPromise;

    // 保存結果にしおりが保持されている
    const saved = readFileSync(await download.path());
    const titles = await outlineTitles(saved);
    expect(titles).toEqual(["Chapter 1", "Section 1.1", "Chapter 2"]);
  });
});
