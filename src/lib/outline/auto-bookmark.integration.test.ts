// @vitest-environment node
import { describe, it, expect } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  autoGenerateBookmarks,
  type AutoBookmarkPage,
  type TextSource,
} from "./auto-bookmark";

/**
 * 各ページに見出し行（先頭）＋本文行を配置した実 PDF を生成する。
 * pdf-lib の drawText は WinAnsi 標準フォントのため、ここでは ASCII の見出し
 * （`Chapter`/`Section` 風ではなく報告書の番号書式に近い英字タイトル）で検証する。
 * ※日本語見出しの検出は単体テスト（matchHeading）で担保し、本統合テストでは
 *   pdf.js による実テキスト抽出 → 行復元 → 検出 → ツリー化の経路を検証する。
 */
async function buildReportPdf(
  pageHeadings: (string | null)[],
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const heading of pageHeadings) {
    const page = doc.addPage([400, 600]);
    if (heading) {
      page.drawText(heading, { x: 40, y: 540, size: 18, font });
    }
    page.drawText("This is body text on the page.", {
      x: 40,
      y: 480,
      size: 11,
      font,
    });
  }
  return doc.save();
}

/** ASCII 章/節/項を検出する英字パターン（統合テスト用）。 */
const ASCII_PATTERNS = [
  {
    id: "t-chapter",
    label: "chapter",
    level: 1 as const,
    enabled: true,
    builtin: false,
    pattern: "^\\s*(?<title>Chapter\\s+[0-9]+(?:\\s+\\S.*)?)\\s*$",
  },
  {
    id: "t-section",
    label: "section",
    level: 2 as const,
    enabled: true,
    builtin: false,
    pattern:
      "^\\s*(?<title>[0-9]+\\.[0-9]+(?!\\.[0-9])(?=.*[A-Za-z])\\s+.*\\S)\\s*$",
  },
  {
    id: "t-item",
    label: "item",
    level: 3 as const,
    enabled: true,
    builtin: false,
    pattern:
      "^\\s*(?<title>[0-9]+\\.[0-9]+\\.[0-9]+(?=.*[A-Za-z])\\s+.*\\S)\\s*$",
  },
];

/** バイト列から pdf.js の TextSource を生成する。 */
async function loadSource(bytes: Uint8Array): Promise<{
  source: TextSource;
  destroy: () => Promise<void>;
}> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await pdfjs.getDocument({ data: bytes, verbosity: 0 }).promise;
  return {
    source: pdf as unknown as TextSource,
    destroy: () => pdf.destroy(),
  };
}

describe("autoGenerateBookmarks（実 PDF を pdf.js で抽出して自動生成）", () => {
  it("章/節/項の見出しから 3 階層のしおりツリーを生成する", async () => {
    const bytes = await buildReportPdf([
      "Chapter 1 General",
      "1.1 Scope",
      "1.1.1 Details",
      "Chapter 2 Design",
    ]);
    const pages: AutoBookmarkPage[] = [0, 1, 2, 3].map((i) => ({
      sourceId: "S",
      sourceIndex: i,
    }));
    const { source, destroy } = await loadSource(bytes);
    try {
      const tree = await autoGenerateBookmarks(
        pages,
        (id) => (id === "S" ? source : undefined),
        ASCII_PATTERNS,
      );

      expect(tree.map((n) => n.title)).toEqual([
        "Chapter 1 General",
        "Chapter 2 Design",
      ]);
      expect(tree[0]!.sourceIndex).toBe(0);
      expect(tree[0]!.children.map((c) => c.title)).toEqual(["1.1 Scope"]);
      expect(tree[0]!.children[0]!.sourceIndex).toBe(1);
      expect(tree[0]!.children[0]!.children.map((c) => c.title)).toEqual([
        "1.1.1 Details",
      ]);
      expect(tree[0]!.children[0]!.children[0]!.sourceIndex).toBe(2);
      expect(tree[1]!.sourceIndex).toBe(3);
    } finally {
      await destroy();
    }
  });

  it("見出しが無い PDF では空ツリーを返す", async () => {
    const bytes = await buildReportPdf([null, null]);
    const pages: AutoBookmarkPage[] = [
      { sourceId: "S", sourceIndex: 0 },
      { sourceId: "S", sourceIndex: 1 },
    ];
    const { source, destroy } = await loadSource(bytes);
    try {
      const tree = await autoGenerateBookmarks(
        pages,
        () => source,
        ASCII_PATTERNS,
      );
      expect(tree).toEqual([]);
    } finally {
      await destroy();
    }
  });

  it("startPage より前のページ（表紙等）の見出しはスキップする", async () => {
    const bytes = await buildReportPdf([
      "Chapter 1 Cover Should Skip",
      "Chapter 2 Real",
    ]);
    const pages: AutoBookmarkPage[] = [
      { sourceId: "S", sourceIndex: 0 },
      { sourceId: "S", sourceIndex: 1 },
    ];
    const { source, destroy } = await loadSource(bytes);
    try {
      const tree = await autoGenerateBookmarks(
        pages,
        () => source,
        ASCII_PATTERNS,
        undefined,
        undefined,
        2, // 2 ページ目以降のみ
      );
      expect(tree.map((n) => n.title)).toEqual(["Chapter 2 Real"]);
      expect(tree[0]!.sourceIndex).toBe(1);
    } finally {
      await destroy();
    }
  });

  it("AbortSignal で中止すると AbortError を投げる", async () => {
    const bytes = await buildReportPdf(["Chapter 1 A", "Chapter 2 B"]);
    const pages: AutoBookmarkPage[] = [
      { sourceId: "S", sourceIndex: 0 },
      { sourceId: "S", sourceIndex: 1 },
    ];
    const { source, destroy } = await loadSource(bytes);
    const controller = new AbortController();
    controller.abort();
    try {
      await expect(
        autoGenerateBookmarks(
          pages,
          () => source,
          ASCII_PATTERNS,
          undefined,
          controller.signal,
        ),
      ).rejects.toThrowError(/中止/);
    } finally {
      await destroy();
    }
  });

  it("進捗コールバックが各ページで通知される", async () => {
    const bytes = await buildReportPdf(["Chapter 1 A", "1.1 B", null]);
    const pages: AutoBookmarkPage[] = [0, 1, 2].map((i) => ({
      sourceId: "S",
      sourceIndex: i,
    }));
    const { source, destroy } = await loadSource(bytes);
    const progresses: number[] = [];
    try {
      await autoGenerateBookmarks(
        pages,
        () => source,
        ASCII_PATTERNS,
        (p) => progresses.push(p.currentPage),
      );
      expect(progresses).toEqual([1, 2, 3]);
    } finally {
      await destroy();
    }
  });
});
