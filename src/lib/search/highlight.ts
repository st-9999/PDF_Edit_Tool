import { buildMatcher, type SearchOptions } from "./search";

/**
 * テキストレイヤ内の検索語を `<mark class="search-hit">` で囲む（DOM 操作）。
 * 既存マークを解除してから再適用するため冪等。`currentLocalIndex` は
 * このページ内で強調する出現位置（0 始まり、無ければ null）。
 * `options` で正規表現・大小区別に対応（findMatches と同一の matcher を使用）。
 * 注: 1 つのテキスト span 内の出現のみ対象（item をまたぐ一致は未対応）。
 */
export function applyHighlights(
  container: HTMLElement,
  query: string,
  currentLocalIndex: number | null,
  options: SearchOptions = {},
): void {
  // 既存マークを解除（テキストノードへ戻す）
  container.querySelectorAll("mark.search-hit").forEach((mark) => {
    mark.replaceWith(document.createTextNode(mark.textContent ?? ""));
  });
  container.normalize();

  const matcher = buildMatcher(query, options);
  if (!matcher) return;

  let occurrence = 0;
  container.querySelectorAll<HTMLElement>(":scope > span").forEach((span) => {
    const text = span.textContent ?? "";

    // この span 内の一致範囲を列挙（matcher は global なので lastIndex を初期化）
    matcher.lastIndex = 0;
    const ranges: Array<[number, number]> = [];
    let m: RegExpExecArray | null;
    while ((m = matcher.exec(text)) !== null) {
      if (m[0].length === 0) {
        matcher.lastIndex += 1; // 0 幅一致の無限ループ防止
        continue;
      }
      ranges.push([m.index, m.index + m[0].length]);
    }
    if (ranges.length === 0) return;

    const fragment = document.createDocumentFragment();
    let from = 0;
    for (const [start, end] of ranges) {
      if (start > from) fragment.append(text.slice(from, start));
      const mark = document.createElement("mark");
      mark.className = "search-hit";
      mark.textContent = text.slice(start, end);
      if (occurrence === currentLocalIndex) mark.dataset.current = "true";
      fragment.append(mark);
      occurrence += 1;
      from = end;
    }
    if (from < text.length) fragment.append(text.slice(from));
    span.replaceChildren(fragment);
  });
}
