import { test, expect } from "@playwright/test";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { openEntryPage } from "./helpers";

async function makeTextPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([420, 240]);
  ["Hello world from PDF", "Second line of text", "Third line here"].forEach(
    (line, i) => {
      page.drawText(line, {
        x: 30,
        y: 190 - i * 40,
        size: 18,
        font,
        color: rgb(0.1, 0.1, 0.1),
      });
    },
  );
  return Buffer.from(await doc.save());
}

test.describe("テキスト選択・コピー", () => {
  test("選択コピーは改行付きで本文と一致し、余分な文字（?等）を含まない", async ({
    page,
  }) => {
    await openEntryPage(page);
    await page.setInputFiles('input[type="file"]:not([multiple])', {
      name: "t.pdf",
      mimeType: "application/pdf",
      buffer: await makeTextPdf(),
    });
    await expect(page.getByText("1 ページ")).toBeVisible();
    await page.locator(".textLayer span").first().waitFor();

    // テキストレイヤを全選択してコピー
    await page.evaluate(() => {
      const layer = document.querySelector(".textLayer");
      const sel = window.getSelection();
      if (!layer || !sel) return;
      sel.removeAllRanges();
      const r = document.createRange();
      r.selectNodeContents(layer);
      sel.addRange(r);
    });
    await page.keyboard.press("Control+c");

    // コピーされた内容を、貼り付け先の入力欄で受け取って読む。
    // クリップボードの読み取り権限（Firefox は未対応）を使わず、利用者と同じ Ctrl+V の経路で確かめる。
    await page.evaluate(() => {
      const area = document.createElement("textarea");
      area.setAttribute("aria-label", "貼り付け先");
      area.style.position = "fixed";
      area.style.top = "0";
      area.style.left = "0";
      document.body.appendChild(area);
    });
    const pasteTarget = page.getByRole("textbox", { name: "貼り付け先" });
    await pasteTarget.focus();
    await page.keyboard.press("Control+v");
    await expect(pasteTarget).not.toHaveValue("");
    const clip = await pasteTarget.inputValue();

    // 改行（\r\n or \n）で正規化して本文と一致。余分な文字混入なし
    const normalized = clip.replace(/\r\n/g, "\n");
    expect(normalized).toBe(
      "Hello world from PDF\nSecond line of text\nThird line here",
    );
    expect(clip).not.toContain("?");

    // 改行用 <br> はサイズ 0（左端に空の選択ボックスを出さない回帰防止）
    const brFontSize = await page.evaluate(() => {
      const br = document.querySelector(".textLayer br");
      return br ? getComputedStyle(br).fontSize : null;
    });
    expect(brFontSize).toBe("0px");
  });
});
