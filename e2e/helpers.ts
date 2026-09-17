import type { Locator, Page } from "@playwright/test";

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
