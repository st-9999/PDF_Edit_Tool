// @vitest-environment node
import { describe, it, expect } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { findMatches, getPageText } from "./search";

describe("findMatches", () => {
  it("ヒット件数と位置を返す（大小無視・非重複）", () => {
    const pages = ["Hello world hello", "Goodbye HELLO there"];
    const matches = findMatches(pages, "hello");
    expect(matches).toEqual([
      { page: 1, start: 0, end: 5 },
      { page: 1, start: 12, end: 17 },
      { page: 2, start: 8, end: 13 },
    ]);
  });

  it("空クエリ・空白のみは 0 件", () => {
    expect(findMatches(["abc"], "")).toEqual([]);
    expect(findMatches(["abc"], "   ")).toEqual([]);
  });

  it("非重複（連続一致を二重に数えない）", () => {
    expect(findMatches(["aaaa"], "aa")).toEqual([
      { page: 1, start: 0, end: 2 },
      { page: 1, start: 2, end: 4 },
    ]);
  });
});

describe("getPageText（実 PDF からテキスト抽出）", () => {
  it("既知テキストを抽出し、検索ヒット件数が一致する", async () => {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const bytes = await makeTextPdf([
      "Invoice Number 12345",
      "Total invoice amount due",
    ]);
    const pdf = await pdfjs.getDocument({ data: bytes, verbosity: 0 }).promise;
    try {
      const p1 = await getPageText(await pdf.getPage(1));
      const p2 = await getPageText(await pdf.getPage(2));
      expect(p1).toContain("Invoice Number 12345");
      expect(p2).toContain("Total invoice amount due");

      // "invoice" は 1 ページ目に1回・2ページ目に1回
      const matches = findMatches([p1, p2], "invoice");
      expect(matches.map((m) => m.page)).toEqual([1, 2]);
    } finally {
      await pdf.destroy();
    }
  });
});

async function makeTextPdf(lines: string[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const line of lines) {
    const page = doc.addPage([400, 200]);
    page.drawText(line, { x: 20, y: 150, size: 14, font });
  }
  return doc.save();
}
