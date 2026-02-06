/**
 * ページ範囲文字列をページ番号配列にパースする
 * @param input - ページ範囲文字列（例: "1-5, 8, 12-15"）
 * @param totalPages - 総ページ数（範囲チェック用）
 * @returns ソート済みのページ番号配列（1始まり、重複なし）
 * @throws 不正な入力の場合
 */
export function parsePageRange(input: string, totalPages: number): number[] {
  const result = new Set<number>();
  const trimmed = input.trim();
  if (!trimmed) return [];

  const parts = trimmed.split(",");

  for (const part of parts) {
    const segment = part.trim();
    if (!segment) continue;

    const rangeParts = segment.split("-");

    if (rangeParts.length === 1) {
      const num = parseInt(rangeParts[0], 10);
      if (isNaN(num) || num < 1 || num > totalPages) {
        throw new Error(
          `無効なページ番号: "${segment}"（1〜${totalPages}の範囲で指定してください）`
        );
      }
      result.add(num);
    } else if (rangeParts.length === 2) {
      const start = parseInt(rangeParts[0].trim(), 10);
      const end = parseInt(rangeParts[1].trim(), 10);
      if (isNaN(start) || isNaN(end) || start < 1 || end > totalPages || start > end) {
        throw new Error(
          `無効なページ範囲: "${segment}"（1〜${totalPages}の範囲で指定してください）`
        );
      }
      for (let i = start; i <= end; i++) {
        result.add(i);
      }
    } else {
      throw new Error(`無効な入力: "${segment}"`);
    }
  }

  return Array.from(result).sort((a, b) => a - b);
}

/**
 * ページ番号配列をページ範囲文字列に変換する（表示用）
 * @param pages - ソート済みページ番号配列（1始まり）
 * @returns ページ範囲文字列（例: "1-5, 8, 12-15"）
 */
export function formatPageRange(pages: number[]): string {
  if (pages.length === 0) return "";

  const sorted = [...pages].sort((a, b) => a - b);
  const ranges: string[] = [];
  let rangeStart = sorted[0];
  let rangeEnd = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === rangeEnd + 1) {
      rangeEnd = sorted[i];
    } else {
      ranges.push(rangeStart === rangeEnd ? `${rangeStart}` : `${rangeStart}-${rangeEnd}`);
      rangeStart = sorted[i];
      rangeEnd = sorted[i];
    }
  }
  ranges.push(rangeStart === rangeEnd ? `${rangeStart}` : `${rangeStart}-${rangeEnd}`);

  return ranges.join(", ");
}
