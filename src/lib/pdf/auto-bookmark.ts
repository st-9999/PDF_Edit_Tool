import type { PDFDocumentProxy } from "pdfjs-dist";
import type { TextItem } from "pdfjs-dist/types/src/display/api";
import type { BookmarkNode } from "@/types/pdf";
import type { HeadingPattern, ExtractionProgress } from "@/types/heading-pattern";
import { createBookmarkNode } from "@/lib/utils/bookmark-tree";

/* ------------------------------------------------------------------ */
/*  デフォルトパターン                                                   */
/* ------------------------------------------------------------------ */

export const DEFAULT_PATTERNS: HeadingPattern[] = [
  {
    id: "builtin-chapter",
    label: "章（第N章）",
    pattern: String.raw`^\s*(?<title>第[0-9０-９]+章\s*.+?)\s*$`,
    level: 1,
    enabled: true,
    builtin: true,
  },
  {
    id: "builtin-section",
    label: "節（N.N）",
    pattern: String.raw`^\s*(?<title>[0-9０-９]+[.．][0-9０-９]+(?![.．0-9０-９])\s+.+?)\s*$`,
    level: 2,
    enabled: true,
    builtin: true,
  },
  {
    id: "builtin-subsection",
    label: "項（N.N.N）",
    pattern: String.raw`^\s*(?<title>[0-9０-９]+[.．][0-9０-９]+[.．][0-9０-９]+\s+.+?)\s*$`,
    level: 3,
    enabled: true,
    builtin: true,
  },
];

/* ------------------------------------------------------------------ */
/*  テキスト行復元                                                      */
/* ------------------------------------------------------------------ */

interface LineInfo {
  text: string;
  y: number;
}

/**
 * TextItem配列をy座標でグループ化し、行テキストを復元する。
 * 同じ行のアイテムはx座標順に結合される。
 */
function reconstructLines(items: TextItem[], yTolerance = 2): LineInfo[] {
  if (items.length === 0) return [];

  // transform[5] = y座標, transform[4] = x座標
  const sorted = [...items].sort((a, b) => {
    const dy = b.transform[5] - a.transform[5]; // y降順（上→下）
    if (Math.abs(dy) > yTolerance) return dy;
    return a.transform[4] - b.transform[4]; // 同じ行内はx昇順（左→右）
  });

  const lines: LineInfo[] = [];
  let currentY = sorted[0].transform[5];
  let currentTexts: string[] = [];

  for (const item of sorted) {
    const y = item.transform[5];
    if (Math.abs(y - currentY) > yTolerance) {
      // 新しい行
      lines.push({ text: currentTexts.join(""), y: currentY });
      currentTexts = [];
      currentY = y;
    }
    currentTexts.push(item.str);
  }
  if (currentTexts.length > 0) {
    lines.push({ text: currentTexts.join(""), y: currentY });
  }

  return lines;
}

/* ------------------------------------------------------------------ */
/*  見出しマッチング                                                    */
/* ------------------------------------------------------------------ */

interface HeadingMatch {
  title: string;
  level: 1 | 2 | 3;
  pageNumber: number;
}

/**
 * 1行に対し、項→節→章の順（具体的なパターン優先）でマッチを試みる。
 */
function matchHeading(
  line: string,
  patterns: { regex: RegExp; level: 1 | 2 | 3 }[]
): { title: string; level: 1 | 2 | 3 } | null {
  for (const { regex, level } of patterns) {
    const m = regex.exec(line);
    if (m) {
      const title = m.groups?.title?.trim() ?? m[0].trim();
      if (title.length > 0) {
        return { title, level };
      }
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  見出し抽出                                                         */
/* ------------------------------------------------------------------ */

/**
 * 有効パターンをコンパイルし、level降順（項→節→章）にソート。
 */
function compilePatterns(
  patterns: HeadingPattern[]
): { regex: RegExp; level: 1 | 2 | 3 }[] {
  return patterns
    .filter((p) => p.enabled)
    .sort((a, b) => b.level - a.level) // 項(3)→節(2)→章(1)
    .map((p) => ({ regex: new RegExp(p.pattern, "m"), level: p.level }));
}

/**
 * PDF全ページからテキストを抽出し、見出しを検出する。
 */
export async function extractHeadings(
  pdfDoc: PDFDocumentProxy,
  patterns: HeadingPattern[],
  onProgress?: (progress: ExtractionProgress) => void,
  signal?: AbortSignal
): Promise<HeadingMatch[]> {
  const compiled = compilePatterns(patterns);
  if (compiled.length === 0) return [];

  const totalPages = pdfDoc.numPages;
  const headings: HeadingMatch[] = [];

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    if (signal?.aborted) break;

    const page = await pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();

    const textItems = textContent.items.filter(
      (item): item is TextItem => "str" in item && item.str.length > 0
    );

    const lines = reconstructLines(textItems);

    for (const { text } of lines) {
      const result = matchHeading(text, compiled);
      if (result) {
        headings.push({
          title: result.title,
          level: result.level,
          pageNumber: pageNum,
        });
      }
    }

    onProgress?.({
      currentPage: pageNum,
      totalPages,
      foundCount: headings.length,
    });
  }

  return headings;
}

/* ------------------------------------------------------------------ */
/*  ツリー構築                                                         */
/* ------------------------------------------------------------------ */

/**
 * ヘディング配列からBookmarkNode[]ツリーを構築する。
 * スタックベースで親子関係を決定。
 */
export function buildBookmarkTree(headings: HeadingMatch[]): BookmarkNode[] {
  const roots: BookmarkNode[] = [];
  const stack: { level: number; node: BookmarkNode }[] = [];

  for (const heading of headings) {
    const node = createBookmarkNode(heading.title, heading.pageNumber);

    // スタックから現在のlevel以上をpop
    while (stack.length > 0 && stack[stack.length - 1].level >= heading.level) {
      stack.pop();
    }

    if (stack.length === 0) {
      // ルートに追加
      roots.push(node);
    } else {
      // スタック先頭の子に追加
      stack[stack.length - 1].node.children.push(node);
    }

    stack.push({ level: heading.level, node });
  }

  return roots;
}

/* ------------------------------------------------------------------ */
/*  統合関数                                                           */
/* ------------------------------------------------------------------ */

/**
 * PDFからしおりを自動生成する統合関数。
 */
export async function autoGenerateBookmarks(
  pdfDoc: PDFDocumentProxy,
  patterns: HeadingPattern[],
  onProgress?: (progress: ExtractionProgress) => void,
  signal?: AbortSignal
): Promise<BookmarkNode[]> {
  const headings = await extractHeadings(pdfDoc, patterns, onProgress, signal);
  return buildBookmarkTree(headings);
}
