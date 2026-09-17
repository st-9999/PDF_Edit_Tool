import type { Locator } from "@playwright/test";

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
