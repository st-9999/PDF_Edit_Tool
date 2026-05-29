// @vitest-environment node
import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { readPdfMeta } from "./document";

/** pdf-lib で既知ページ数・メタ情報の PDF を生成する。 */
async function buildPdf(
  pageCount: number,
  title: string,
  author: string,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setAuthor(author);
  for (let i = 0; i < pageCount; i += 1) {
    doc.addPage([200, 300]);
  }
  return doc.save();
}

describe("readPdfMeta（実 PDF を pdf.js で解析）", () => {
  it("ページ数とタイトル・著者を正しく取得する", async () => {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const bytes = await buildPdf(3, "Sample Title", "Test Author");

    const task = pdfjs.getDocument({
      data: bytes,
      useSystemFonts: false,
      verbosity: 0,
    });
    const pdf = await task.promise;
    try {
      const meta = await readPdfMeta(pdf);
      expect(meta.numPages).toBe(3);
      expect(meta.title).toBe("Sample Title");
      expect(meta.author).toBe("Test Author");
    } finally {
      await pdf.destroy();
    }
  });

  it("1 ページ PDF でも numPages=1 を返す", async () => {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const bytes = await buildPdf(1, "One", "A");
    const pdf = await pdfjs.getDocument({ data: bytes, verbosity: 0 }).promise;
    try {
      const meta = await readPdfMeta(pdf);
      expect(meta.numPages).toBe(1);
    } finally {
      await pdf.destroy();
    }
  });
});
