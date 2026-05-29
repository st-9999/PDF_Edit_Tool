const SIZE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;
const BYTES_PER_UNIT = 1024;

/**
 * バイト数を人間が読みやすい単位に整形する（例: 13002342 -> "12.4 MB"）。
 * B 単位は整数、それ以上は小数第1位まで。不正値は "—"。
 */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes === 0) return "0 B";

  const exponent = Math.min(
    SIZE_UNITS.length - 1,
    Math.floor(Math.log(bytes) / Math.log(BYTES_PER_UNIT)),
  );
  const value = bytes / BYTES_PER_UNIT ** exponent;
  const text = exponent === 0 ? String(bytes) : value.toFixed(1);
  return `${text} ${SIZE_UNITS[exponent]}`;
}
