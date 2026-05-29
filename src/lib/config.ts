/**
 * GitHub Pages のサブパス配信に対応するためのパス組み立てユーティリティ。
 * 静的アセット（pdf.worker など）を `<basePath>/...` で参照する際に使う。
 */

/** ビルド時に確定する公開パスのプレフィックス（ルート配信なら空文字）。 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/**
 * basePath とアプリ内パスを連結する純関数。
 * - `path` の先頭スラッシュ有無を吸収する
 * - `base` の末尾スラッシュを除去して二重スラッシュを防ぐ
 */
export function joinBasePath(base: string, path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const trimmedBase = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${trimmedBase}${normalizedPath}`;
}

/** 実行環境の BASE_PATH を用いてアセットの絶対パスを返す。 */
export function withBasePath(path: string): string {
  return joinBasePath(BASE_PATH, path);
}
