import { test, expect, type Locator, type Page } from "@playwright/test";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/** ラベル付きの既知ページ数 PDF を生成する。 */
async function makeSamplePdf(
  label: string,
  pageCount: number,
): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle(`E2E ${label}`);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= pageCount; i += 1) {
    const page = doc.addPage([400, 560]);
    page.drawText(`${label} ${i}`, {
      x: 40,
      y: 500,
      size: 40,
      font,
      color: rgb(0.1, 0.1, 0.1),
    });
  }
  return Buffer.from(await doc.save());
}

const MERGE_ZONE = "結合する複数 PDF の読み込み";

/**
 * 枠は SSR の HTML に先に現れるため、React のハイドレーションでイベントハンドラが
 * 付く前に drop / change を送ると無視される（Firefox で顕在化）。ハンドラの付与を待つ。
 */
async function waitForHydration(locator: Locator) {
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
 * 実際のドラッグ&ドロップと同じく、`DataTransfer` にファイルを載せて
 * dragover → drop を対象要素へ発火する。
 */
async function dropFiles(
  page: Page,
  zoneName: string,
  files: { name: string; buffer: Buffer }[],
) {
  const zone = page.getByRole("button", { name: zoneName });
  await waitForHydration(zone);
  const payload = files.map((f) => ({
    name: f.name,
    bytes: Array.from(f.buffer),
  }));
  const dataTransfer = await page.evaluateHandle((items) => {
    const dt = new DataTransfer();
    for (const it of items) {
      dt.items.add(
        new File([new Uint8Array(it.bytes)], it.name, {
          type: "application/pdf",
        }),
      );
    }
    return dt;
  }, payload);
  await zone.dispatchEvent("dragover", { dataTransfer });
  await zone.dispatchEvent("drop", { dataTransfer });
}

test.describe("複数 PDF 結合フロー（エントリ画面）", () => {
  test("結合用の枠へドロップ → 順序修正 → 結合してビュアーで開く", async ({
    page,
  }) => {
    const a = await makeSamplePdf("A", 3);
    const b = await makeSamplePdf("B", 2);

    await page.goto("/");

    // 入口画面の結合用の枠へ 2 ファイルを直接ドロップ
    await dropFiles(page, MERGE_ZONE, [
      { name: "a.pdf", buffer: a },
      { name: "b.pdf", buffer: b },
    ]);

    // 結合画面へ進み、ドロップしたファイルが一覧に入っている（= pdf.js で解析できた）
    await expect(
      page.getByRole("heading", { name: "複数 PDF を結合" }),
    ).toBeVisible();
    await expect(page.getByText("a.pdf")).toBeVisible();
    await expect(page.getByText("b.pdf")).toBeVisible();
    await expect(page.getByText("3 ページ ・", { exact: false })).toBeVisible();
    await expect(page.getByText("2 ページ ・", { exact: false })).toBeVisible();

    // 初期順序はドロップ順（a.pdf が先頭）
    const items = page.getByRole("listitem");
    await expect(items).toHaveCount(2);
    await expect(items.first()).toContainText("a.pdf");

    // 2 番目（b.pdf）を上へ移動 → 先頭が b.pdf になる
    await page.getByRole("button", { name: "2 番目を上へ" }).click();
    await expect(items.first()).toContainText("b.pdf");

    // 結合してビュアーで開く
    await page.getByRole("button", { name: "結合してビュアーで開く" }).click();

    // 合計 5 ページのドキュメントとして開かれる
    await expect(page.getByText("5 ページ")).toBeVisible();
    await expect(page.getByText("merged.pdf")).toBeVisible();
    await expect(page.getByLabel("ページ 1").first()).toBeVisible();
  });

  test("結合用の枠のファイル選択で複数選ぶと、結合画面の一覧に入る", async ({
    page,
  }) => {
    const a = await makeSamplePdf("A", 1);
    const b = await makeSamplePdf("B", 4);

    await page.goto("/");
    await waitForHydration(page.getByRole("button", { name: MERGE_ZONE }));
    await page.setInputFiles('input[type="file"][multiple]', [
      { name: "a.pdf", mimeType: "application/pdf", buffer: a },
      { name: "b.pdf", mimeType: "application/pdf", buffer: b },
    ]);

    await expect(page.getByRole("listitem")).toHaveCount(2);
    await expect(page.getByText("1 ページ ・", { exact: false })).toBeVisible();
    await expect(page.getByText("4 ページ ・", { exact: false })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "結合してビュアーで開く" }),
    ).toBeEnabled();
  });

  test("1 件だけドロップした場合は結合画面で追加を促し、結合ボタンは無効", async ({
    page,
  }) => {
    const a = await makeSamplePdf("A", 1);

    await page.goto("/");
    await dropFiles(page, MERGE_ZONE, [{ name: "a.pdf", buffer: a }]);

    await expect(page.getByText("a.pdf")).toBeVisible();
    await expect(page.getByRole("listitem")).toHaveCount(1);
    await expect(
      page.getByRole("button", { name: "結合してビュアーで開く" }),
    ).toBeDisabled();
    await expect(
      page.getByText("2 つ以上の PDF を追加してください"),
    ).toBeVisible();

    // 戻ると入口画面の 2 枠に戻る
    await page
      .getByRole("button", { name: "単一ファイルの読み込みに戻る" })
      .click();
    await expect(page.getByRole("button", { name: MERGE_ZONE })).toBeVisible();
  });
});
