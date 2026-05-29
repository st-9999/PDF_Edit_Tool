/**
 * v1 の品質保証ライン「中規模で快適」に対応する推奨上限。
 * これを超えると動作が重くなる可能性があるため UI で警告する。
 * （簡易ベンチで 200〜500 ページの buildPdf が数秒で完了することを確認した上での目安値）
 */
export const RECOMMENDED_MAX_PAGES = 500;
export const RECOMMENDED_MAX_BYTES = 50 * 1024 * 1024; // 50MB

export interface LimitCheck {
  exceedsPages: boolean;
  exceedsBytes: boolean;
  exceeded: boolean;
}

/** ページ数・バイト数が推奨上限を超えているか判定する純関数。 */
export function checkLimits(pageCount: number, byteSize: number): LimitCheck {
  const exceedsPages = pageCount > RECOMMENDED_MAX_PAGES;
  const exceedsBytes = byteSize > RECOMMENDED_MAX_BYTES;
  return { exceedsPages, exceedsBytes, exceeded: exceedsPages || exceedsBytes };
}

/** 推奨上限の表示用文字列。 */
export function recommendedLimitsLabel(): string {
  const mb = Math.round(RECOMMENDED_MAX_BYTES / 1024 / 1024);
  return `推奨上限: 約 ${RECOMMENDED_MAX_PAGES} ページ / 約 ${mb} MB`;
}
