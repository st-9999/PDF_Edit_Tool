import { test, expect, type Page } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { openEntryPage } from "./helpers";

/** 1 ページに 1 行ずつ本文を置いた PDF。 */
async function makeTextPdf(lines: string[]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const line of lines) {
    const page = doc.addPage([420, 220]);
    page.drawText(line, { x: 24, y: 160, size: 16, font });
  }
  return Buffer.from(await doc.save());
}

async function openSearch(page: Page, lines: string[]) {
  await openEntryPage(page);
  await page.setInputFiles('input[type="file"]:not([multiple])', {
    name: "doc.pdf",
    mimeType: "application/pdf",
    buffer: await makeTextPdf(lines),
  });
  await expect(page.getByText(`${lines.length} ページ`)).toBeVisible();
  await page.getByRole("button", { name: "単ページ表示" }).click();
  await page.getByRole("button", { name: "テキストを検索" }).click();
  return page.getByRole("textbox", { name: "検索語" });
}

const hitCount = (page: Page, text: string) =>
  page.getByText(text, { exact: true });

test.describe("テキスト検索のオプション", () => {
  test("正規表現で可変長の一致を検索し、ヒットのページへ移動してその文字列を強調する", async ({
    page,
  }) => {
    const input = await openSearch(page, [
      "Invoice No. 2026-001",
      "Total 1234 yen",
      "No numbers here",
    ]);
    await page.getByRole("button", { name: "正規表現" }).click();
    await expect(input).toHaveAttribute("placeholder", "正規表現…");

    await input.fill("[0-9]{4}");
    await expect(hitCount(page, "1 / 2")).toBeVisible();
    await expect(page.locator("mark.search-hit").first()).toHaveText("2026");

    await page.getByRole("button", { name: "次のヒット" }).click();
    await expect(hitCount(page, "2 / 2")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "ページ番号" })).toHaveValue(
      "2",
    );
    await expect(page.locator("mark.search-hit").first()).toHaveText("1234");

    // 正規表現を OFF にすると同じ語は文字どおりに検索される（一致なし）
    await page.getByRole("button", { name: "正規表現" }).click();
    await expect(hitCount(page, "0 件")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "次のヒット" }),
    ).toBeDisabled();
  });

  test("不正な正規表現は「無効な式」と表示し、ヒットなしとして扱う", async ({
    page,
  }) => {
    const input = await openSearch(page, ["Invoice No. 2026-001"]);
    await page.getByRole("button", { name: "正規表現" }).click();
    await input.fill("(2026");
    await expect(hitCount(page, "無効な式")).toBeVisible();
    await expect(page.locator("mark.search-hit")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "次のヒット" }),
    ).toBeDisabled();

    // 式を直せば検索される
    await input.fill("(2026)");
    await expect(hitCount(page, "1 / 1")).toBeVisible();
  });

  test("大文字小文字の区別を ON にすると、大文字小文字が一致するものだけがヒットする（正規表現と併用可）", async ({
    page,
  }) => {
    const input = await openSearch(page, [
      "Invoice No. 2026-001",
      "invoice total",
    ]);
    await input.fill("invoice");
    await expect(hitCount(page, "1 / 2")).toBeVisible();

    const caseToggle = page.getByRole("button", {
      name: "大文字小文字を区別",
    });
    await caseToggle.click();
    await expect(caseToggle).toHaveAttribute("aria-pressed", "true");
    await expect(hitCount(page, "1 / 1")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "ページ番号" })).toHaveValue(
      "2",
    );
    await expect(page.locator("mark.search-hit").first()).toHaveText("invoice");

    await page.getByRole("button", { name: "正規表現" }).click();
    await input.fill("^I[a-z]+");
    await expect(hitCount(page, "1 / 1")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "ページ番号" })).toHaveValue(
      "1",
    );
    await expect(page.locator("mark.search-hit").first()).toHaveText("Invoice");
  });
});
