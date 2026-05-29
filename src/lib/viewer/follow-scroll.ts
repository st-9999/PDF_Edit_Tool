/**
 * 追従スクロールのスクロール量計算（純関数・DOM 非依存でテスト可能）。
 *
 * スクロールコンテナ内で対象要素が完全に見えていれば 0（動かさない）。
 * 一部でも外れていれば、対象がコンテナ中央へ来るために `scrollTop` に
 * 加算すべき差分（px）を返す。これによりビュアーの現在ページに合わせて
 * 左ペインのサムネが自動追従する。
 *
 * @param viewTop    コンテナ可視領域の上端（getBoundingClientRect().top）
 * @param viewHeight コンテナの可視高さ（clientHeight）
 * @param elemTop    対象要素の上端（getBoundingClientRect().top）
 * @param elemHeight 対象要素の高さ（getBoundingClientRect().height）
 */
export function followScrollDelta(
  viewTop: number,
  viewHeight: number,
  elemTop: number,
  elemHeight: number,
): number {
  const relativeTop = elemTop - viewTop;
  const fullyVisible =
    relativeTop >= 0 && relativeTop + elemHeight <= viewHeight;
  if (fullyVisible) return 0;
  // 対象を可視領域の中央に配置するための差分（負なら上へ、正なら下へスクロール）
  return relativeTop - (viewHeight - elemHeight) / 2;
}
