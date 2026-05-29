import type { PDFPageProxy } from "pdfjs-dist";

/** 1 件のヒット（display ページ番号 1 始まり、ページ内文字オフセット）。 */
export interface SearchMatch {
  page: number;
  start: number;
  end: number;
}

/**
 * ページごとのテキストから検索語のヒットを返す純関数。
 * 大文字小文字を無視し、各ページ内では非重複で前方一致を列挙する。
 */
export function findMatches(pageTexts: string[], query: string): SearchMatch[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return [];

  const matches: SearchMatch[] = [];
  pageTexts.forEach((text, pageIndex) => {
    const haystack = text.toLowerCase();
    let from = 0;
    for (;;) {
      const idx = haystack.indexOf(needle, from);
      if (idx === -1) break;
      matches.push({
        page: pageIndex + 1,
        start: idx,
        end: idx + needle.length,
      });
      from = idx + needle.length; // 非重複
    }
  });
  return matches;
}

/** PDF ページからプレーンテキストを抽出する（コピー/検索の基礎）。 */
export async function getPageText(page: PDFPageProxy): Promise<string> {
  const content = await page.getTextContent();
  return content.items.map((item) => ("str" in item ? item.str : "")).join("");
}
