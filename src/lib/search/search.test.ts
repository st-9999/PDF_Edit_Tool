// @vitest-environment node
import { describe, it, expect } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { buildMatcher, findMatches, getPageText } from "./search";

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

  it("プレーン検索は正規表現メタ文字をリテラル扱いする", () => {
    // "a.c" は正規表現でなければ文字列 "a.c" にのみ一致（"abc" には一致しない）
    expect(findMatches(["abc a.c"], "a.c")).toEqual([
      { page: 1, start: 4, end: 7 },
    ]);
  });
});

describe("findMatches（オプション）", () => {
  it("caseSensitive=true は大文字小文字を区別する", () => {
    const pages = ["Hello hello HELLO"];
    expect(findMatches(pages, "hello", { caseSensitive: true })).toEqual([
      { page: 1, start: 6, end: 11 },
    ]);
  });

  it("regex=true でパターン一致（可変長・複数ページ）", () => {
    const pages = ["order 12 and 345", "no digits here"];
    const matches = findMatches(pages, "\\d+", { regex: true });
    expect(matches).toEqual([
      { page: 1, start: 6, end: 8 }, // "12"
      { page: 1, start: 13, end: 16 }, // "345"
    ]);
  });

  it("regex=true は既定で大小無視、caseSensitive 併用で区別", () => {
    expect(findMatches(["Cat cat"], "c.t", { regex: true })).toHaveLength(2);
    expect(
      findMatches(["Cat cat"], "c.t", { regex: true, caseSensitive: true }),
    ).toEqual([{ page: 1, start: 4, end: 7 }]);
  });

  it("不正な正規表現は空配列（例外を投げない）", () => {
    expect(findMatches(["abc"], "(", { regex: true })).toEqual([]);
  });

  it("0 幅一致（例: a*）でも無限ループせず空白以外のみ返す", () => {
    // "a*" は 0 幅にも一致しうるが、0 幅は除外され実体のある "a" 群のみ
    const matches = findMatches(["baab"], "a*", { regex: true });
    expect(matches).toEqual([{ page: 1, start: 1, end: 3 }]);
  });
});

describe("buildMatcher", () => {
  it("空・空白のみクエリは null", () => {
    expect(buildMatcher("")).toBeNull();
    expect(buildMatcher("   ")).toBeNull();
  });

  it("不正な正規表現は null、正しい式は RegExp", () => {
    expect(buildMatcher("[", { regex: true })).toBeNull();
    expect(buildMatcher("\\d+", { regex: true })).toBeInstanceOf(RegExp);
  });

  it("フラグは caseSensitive に従う", () => {
    expect(buildMatcher("a")!.flags).toBe("gi");
    expect(buildMatcher("a", { caseSensitive: true })!.flags).toBe("g");
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
