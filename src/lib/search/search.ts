import type { PDFPageProxy } from "pdfjs-dist";

/** 1 件のヒット（display ページ番号 1 始まり、ページ内文字オフセット）。 */
export interface SearchMatch {
  page: number;
  start: number;
  end: number;
}

/**
 * 検索オプション（高度化）。
 * - `regex`: クエリを正規表現として解釈する（既定 false＝プレーン部分一致）
 * - `caseSensitive`: 大文字小文字を区別する（既定 false＝無視）
 */
export interface SearchOptions {
  regex?: boolean;
  caseSensitive?: boolean;
}

/** 正規表現メタ文字をエスケープする（プレーン検索でリテラル一致させるため）。 */
function escapeRegExp(source: string): string {
  return source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 検索語から global な `RegExp` を構築する（findMatches / applyHighlights で共有）。
 * - プレーン検索: 語をエスケープしてリテラル部分一致
 * - 正規表現検索: 語をそのままパターンとして使用
 * 大小区別は `caseSensitive` で切替。空（空白のみ含む）クエリと不正な正規表現は null。
 */
export function buildMatcher(
  query: string,
  options: SearchOptions = {},
): RegExp | null {
  if (query.trim().length === 0) return null;
  const pattern = options.regex ? query : escapeRegExp(query);
  const flags = options.caseSensitive ? "g" : "gi";
  try {
    return new RegExp(pattern, flags);
  } catch {
    return null; // 不正な正規表現
  }
}

/**
 * ページごとのテキストから検索語のヒットを返す純関数。
 * 既定はプレーン部分一致（大小無視・非重複）。`options` で正規表現／大小区別に対応。
 * 空クエリ・不正な正規表現は空配列を返す。
 */
export function findMatches(
  pageTexts: string[],
  query: string,
  options: SearchOptions = {},
): SearchMatch[] {
  const matcher = buildMatcher(query, options);
  if (!matcher) return [];

  const matches: SearchMatch[] = [];
  pageTexts.forEach((text, pageIndex) => {
    matcher.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = matcher.exec(text)) !== null) {
      if (m[0].length === 0) {
        // 0 幅一致（例: 正規表現 "a*"）は無限ループを避けるため 1 文字進める
        matcher.lastIndex += 1;
        continue;
      }
      matches.push({
        page: pageIndex + 1,
        start: m.index,
        end: m.index + m[0].length,
      });
    }
  });
  return matches;
}

/** PDF ページからプレーンテキストを抽出する（コピー/検索の基礎）。 */
export async function getPageText(page: PDFPageProxy): Promise<string> {
  const content = await page.getTextContent();
  return content.items.map((item) => ("str" in item ? item.str : "")).join("");
}
