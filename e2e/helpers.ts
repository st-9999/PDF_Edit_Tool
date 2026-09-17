import { readFileSync } from "node:fs";
import type { Locator, Page } from "@playwright/test";
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFRef,
  PDFString,
  type PDFObject,
} from "pdf-lib";

/**
 * 要素に React のイベントハンドラが付く（ハイドレーションが終わる）まで待つ。
 * 入口画面の枠やファイル入力は SSR の HTML に先に現れるため、`page.goto` 直後に
 * `setInputFiles` や `drop` を送ると、ハンドラが付く前でイベントが取りこぼされることがある
 * （Firefox で顕在化）。
 */
export async function waitForHydration(locator: Locator) {
  await locator.evaluate(
    (el) =>
      new Promise<void>((resolve) => {
        const check = () =>
          Object.keys(el).some((k) => k.startsWith("__reactProps"))
            ? resolve()
            : setTimeout(check, 50);
        check();
      }),
  );
}

/**
 * 入口画面を開き、PDF の読み込み枠が操作を受け付けるようになるまで待つ。
 * この後に `setInputFiles` でファイルを渡すと、取りこぼされずに読み込まれる。
 */
export async function openEntryPage(page: Page) {
  await page.goto("/");
  await waitForHydration(page.getByRole("button", { name: "PDFの読み込み" }));
}

/** 保存を「名前を付けて保存」のダウンロード経路にする（ヘッドレスで保存ダイアログを避ける）。`goto` の前に呼ぶ。 */
export async function forceDownloadSave(page: Page) {
  await page.addInitScript(() => {
    // @ts-expect-error テスト用に能力を削除
    delete window.showSaveFilePicker;
  });
}

/** 保存メニューの「名前を付けて保存」でダウンロードした PDF のバイト列を返す。 */
export async function saveAsDownload(page: Page): Promise<Buffer> {
  await page.getByRole("button", { name: "保存" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "名前を付けて保存" }).click();
  const path = await (await downloadPromise).path();
  return readFileSync(path);
}

export interface OutlineEntry {
  title: string;
  /** 階層（最上位が 0）。 */
  depth: number;
  /** 宛先ページ（0 始まり）。宛先が無ければ null。 */
  pageIndex: number | null;
}

/** PDF のしおりを深さ優先の順で、タイトル・階層・宛先ページとともに読む。 */
export async function readOutline(bytes: Uint8Array): Promise<OutlineEntry[]> {
  const doc = await PDFDocument.load(bytes);
  const ctx = doc.context;
  const pageRefs = doc.getPages().map((p) => p.ref);
  const outlines = doc.catalog.lookupMaybe(PDFName.of("Outlines"), PDFDict);
  const entries: OutlineEntry[] = [];
  const pageIndexOf = (item: PDFDict): number | null => {
    const dest = item.lookupMaybe(PDFName.of("Dest"), PDFArray);
    const target = dest?.get(0);
    if (!(target instanceof PDFRef)) return null;
    const index = pageRefs.findIndex(
      (ref) => ref.objectNumber === target.objectNumber,
    );
    return index >= 0 ? index : null;
  };
  const walk = (first: PDFObject | undefined, depth: number) => {
    let ref = first;
    while (ref instanceof PDFRef) {
      const item = ctx.lookup(ref, PDFDict);
      const title = item.lookup(PDFName.of("Title"));
      entries.push({
        title:
          title instanceof PDFString || title instanceof PDFHexString
            ? title.decodeText()
            : "",
        depth,
        pageIndex: pageIndexOf(item),
      });
      walk(item.get(PDFName.of("First")), depth + 1);
      ref = item.get(PDFName.of("Next"));
    }
  };
  walk(outlines?.get(PDFName.of("First")), 0);
  return entries;
}
