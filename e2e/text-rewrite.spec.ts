import { readFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
import { buildPdf } from "../src/lib/pdf/content/pdf-fixtures.test-helper";
import { extractPageText } from "../src/lib/pdf/content/page-text";
import { openEntryPage } from "./helpers";

/**
 * 「Total」「81.9」「yen」を別々の位置に置いた 1 ページの PDF。
 * フォントは埋め込みなしの単純 TrueType（WinAnsi）で、ブラウザでも代替フォントで表示される。
 * `baseFont` を指定するとフォント名を差し替える（書体の判定は名前で行われる）。
 */
async function samplePdf(baseFont?: string): Promise<Buffer> {
  const bytes = await buildPdf(
    [
      [
        "BT /F2 24 Tf 72 700 Td (Total) Tj ET",
        "BT /F2 24 Tf 250 700 Td (81.9) Tj ET",
        "BT /F2 24 Tf 400 700 Td (yen) Tj ET",
      ].join("\n"),
    ],
    [612, 792],
  );
  if (!baseFont) return Buffer.from(bytes);
  const doc = await PDFDocument.load(bytes);
  const fonts = doc
    .getPage(0)
    .node.Resources()!
    .lookup(PDFName.of("Font"), PDFDict);
  fonts
    .lookup(PDFName.of("F2"), PDFDict)
    .set(PDFName.of("BaseFont"), PDFName.of(baseFont));
  return Buffer.from(await doc.save());
}

async function openSample(page: Page, pdf?: Buffer) {
  // 保存はダウンロード経路にする（ヘッドレスで保存ダイアログを避ける）
  await page.addInitScript(() => {
    // @ts-expect-error テスト用に能力を削除
    delete window.showSaveFilePicker;
  });
  await openEntryPage(page);
  await page.setInputFiles('input[type="file"]:not([multiple])', {
    name: "sample.pdf",
    mimeType: "application/pdf",
    buffer: pdf ?? (await samplePdf()),
  });
  await expect(page.getByText("1 ページ")).toBeVisible();
  await expect(textLayerSpan(page, "81.9")).toBeVisible();
}

const textLayerSpan = (page: Page, text: string) =>
  page.locator(".textLayer span", { hasText: text }).first();

/** テキストレイヤ上の文字の位置（中央）をクリックする。 */
async function clickText(page: Page, text: string) {
  const box = await textLayerSpan(page, text).boundingBox();
  if (!box) throw new Error(`「${text}」の位置を取得できません`);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

async function enterRewriteMode(page: Page) {
  await page.getByRole("button", { name: "文字を書き換える" }).click();
  await expect(page.locator("[data-text-edit-layer]").first()).toBeVisible();
}

const dialog = (page: Page) =>
  page.getByRole("dialog", { name: "文字の書き換え" });

test.describe("文字の書き換え", () => {
  test("クリックで数値を選んで書き換え、Undo/Redo でき、保存した PDF にも反映される", async ({
    page,
  }) => {
    await openSample(page);
    await enterRewriteMode(page);

    // クリックした数値のまとまりが編集ボックスに入る
    await expect(async () => {
      await clickText(page, "81.9");
      await expect(dialog(page)).toBeVisible({ timeout: 1000 });
    }).toPass();
    const input = dialog(page).getByRole("textbox", { name: "新しい文字" });
    await expect(input).toHaveValue("81.9");
    // 数値なので右揃えが初期値
    await expect(
      dialog(page).getByRole("button", { name: "右揃え" }),
    ).toHaveAttribute("aria-pressed", "true");

    await input.fill("123.4");
    await expect(dialog(page).getByRole("status")).toHaveText(
      "元の書体のまま書き換えます",
    );
    await input.press("Enter");
    await expect(dialog(page)).toBeHidden();

    // 表示（テキストレイヤ）が書き換わり、未保存になる
    await expect(textLayerSpan(page, "123.4")).toBeVisible();
    await expect(
      page.locator(".textLayer span", { hasText: "81.9" }),
    ).toHaveCount(0);
    await expect(page.getByText("未保存")).toBeVisible();

    // Undo / Redo（入力欄の外にフォーカスを戻してから）
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("Control+z");
    await expect(textLayerSpan(page, "81.9")).toBeVisible();
    await page.keyboard.press("Control+y");
    await expect(textLayerSpan(page, "123.4")).toBeVisible();

    // 保存（ダウンロード）した PDF の文字も書き換わっている
    await page.getByRole("button", { name: "保存" }).click();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("menuitem", { name: "名前を付けて保存" }).click();
    const download = await downloadPromise;
    const saved = await PDFDocument.load(
      readFileSync((await download.path())!),
    );
    const text = extractPageText(saved, 0)
      .glyphs.map((g) => g.text)
      .join("");
    expect(text).toContain("123.4");
    expect(text).not.toContain("81.9");
    expect(text).toContain("Total");
  });

  test("元のフォントに無い文字は、書体が変わる旨を表示したうえで書き換えられる", async ({
    page,
  }) => {
    await openSample(page);
    await enterRewriteMode(page);
    await expect(async () => {
      await clickText(page, "yen");
      await expect(dialog(page)).toBeVisible({ timeout: 1000 });
    }).toPass();

    const input = dialog(page).getByRole("textbox", { name: "新しい文字" });
    await input.fill("円");
    await expect(dialog(page).getByRole("status")).toContainText(
      "「円」は元の書体に無いため、ゴシック体",
      { timeout: 30_000 },
    );
    await dialog(page).getByRole("button", { name: "確定" }).click();
    await expect(textLayerSpan(page, "円")).toBeVisible({ timeout: 30_000 });
  });

  test("明朝体の文字には明朝体の同梱フォントだけを読み込んで使い、保存した PDF にも反映される", async ({
    page,
  }) => {
    const fontRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/fonts/")) fontRequests.push(request.url());
    });
    await openSample(page, await samplePdf("TestMincho"));
    await enterRewriteMode(page);
    await expect(async () => {
      await clickText(page, "yen");
      await expect(dialog(page)).toBeVisible({ timeout: 1000 });
    }).toPass();

    await dialog(page).getByRole("textbox", { name: "新しい文字" }).fill("円");
    await expect(dialog(page).getByRole("status")).toContainText(
      "「円」は元の書体に無いため、明朝体（Noto Serif JP）で描きます",
      { timeout: 30_000 },
    );
    await dialog(page).getByRole("button", { name: "確定" }).click();
    await expect(textLayerSpan(page, "円")).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: "保存" }).click();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("menuitem", { name: "名前を付けて保存" }).click();
    const saved = await PDFDocument.load(
      readFileSync((await (await downloadPromise).path())!),
    );
    const savedPage = extractPageText(saved, 0);
    const yen = savedPage.glyphs.find((g) => g.text === "円");
    expect(
      savedPage.fonts.get(yen!.fontResource)?.typefaceKey?.split("|")[0],
    ).toBe("Noto Serif JP");

    expect(fontRequests.some((url) => url.includes("NotoSerifJP"))).toBe(true);
    expect(fontRequests.filter((url) => url.includes("NotoSansJP"))).toEqual(
      [],
    );
  });

  test("描けない文字は理由を表示して確定できず、Esc で閉じる", async ({
    page,
  }) => {
    await openSample(page);
    await enterRewriteMode(page);
    await expect(async () => {
      await clickText(page, "Total");
      await expect(dialog(page)).toBeVisible({ timeout: 1000 });
    }).toPass();

    const input = dialog(page).getByRole("textbox", { name: "新しい文字" });
    // 絵文字は同梱フォントにも無い
    await input.fill("Total😀");
    await expect(dialog(page).getByRole("status")).toContainText(
      "を描けるフォントがありません",
      { timeout: 30_000 },
    );
    await expect(
      dialog(page).getByRole("button", { name: "確定" }),
    ).toBeDisabled();

    await input.press("Escape");
    await expect(dialog(page)).toBeHidden();
    await expect(textLayerSpan(page, "Total")).toBeVisible();
  });

  test("書き換えモードを OFF にすると選択層が消え、通常の文字選択に戻る", async ({
    page,
  }) => {
    await openSample(page);
    await enterRewriteMode(page);
    await page.getByRole("button", { name: "文字を書き換える" }).click();
    await expect(page.locator("[data-text-edit-layer]")).toHaveCount(0);
  });
});
