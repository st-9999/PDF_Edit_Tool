/**
 * テキストレイヤ内の検索語を `<mark class="search-hit">` で囲む（DOM 操作）。
 * 既存マークを解除してから再適用するため冪等。`currentLocalIndex` は
 * このページ内で強調する出現位置（0 始まり、無ければ null）。
 * 注: 1 つのテキスト span 内の出現のみ対象（item をまたぐ一致は未対応）。
 */
export function applyHighlights(
  container: HTMLElement,
  query: string,
  currentLocalIndex: number | null,
): void {
  // 既存マークを解除（テキストノードへ戻す）
  container.querySelectorAll("mark.search-hit").forEach((mark) => {
    mark.replaceWith(document.createTextNode(mark.textContent ?? ""));
  });
  container.normalize();

  const needle = query.trim().toLowerCase();
  if (!needle) return;

  let occurrence = 0;
  container.querySelectorAll<HTMLElement>(":scope > span").forEach((span) => {
    const text = span.textContent ?? "";
    const lower = text.toLowerCase();
    if (!lower.includes(needle)) return;

    const fragment = document.createDocumentFragment();
    let from = 0;
    let idx = lower.indexOf(needle, from);
    while (idx !== -1) {
      if (idx > from) fragment.append(text.slice(from, idx));
      const mark = document.createElement("mark");
      mark.className = "search-hit";
      mark.textContent = text.slice(idx, idx + needle.length);
      if (occurrence === currentLocalIndex) mark.dataset.current = "true";
      fragment.append(mark);
      occurrence += 1;
      from = idx + needle.length;
      idx = lower.indexOf(needle, from);
    }
    if (from < text.length) fragment.append(text.slice(from));
    span.replaceChildren(fragment);
  });
}
