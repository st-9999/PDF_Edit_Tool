import { BASE_PATH, joinBasePath } from "@/lib/config";
import type { PageRef } from "@/lib/editor/operations";

/** 同梱フォント（Noto Sans JP Regular、SIL Open Font License 1.1）の配信パス。 */
export const FALLBACK_FONT_PATH = "/fonts/NotoSansJP-Regular.ttf";

type Fetcher = (url: string) => Promise<Response>;

/**
 * 同梱フォントを必要になったときに 1 度だけ取得するローダーを作る（5.5MB のため初期表示には含めない）。
 * 取得に失敗した場合は次回に取得し直す。
 */
export function createFallbackFontLoader(
  fetcher: Fetcher,
  basePath: string,
): () => Promise<Uint8Array> {
  let pending: Promise<Uint8Array> | null = null;
  return () => {
    if (!pending) {
      pending = (async () => {
        try {
          const response = await fetcher(
            joinBasePath(basePath, FALLBACK_FONT_PATH),
          );
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return new Uint8Array(await response.arrayBuffer());
        } catch (err) {
          pending = null;
          throw new Error("書き換え用のフォントを読み込めませんでした", {
            cause: err,
          });
        }
      })();
    }
    return pending;
  };
}

/** アプリで使う同梱フォントのローダー。 */
export const loadFallbackFont = createFallbackFontLoader(
  (url) => fetch(url),
  BASE_PATH,
);

/** テキストの書き換えを含むページがあるか（保存時に同梱フォントを渡す必要があるか）。 */
export function needsFallbackFont(pages: readonly PageRef[]): boolean {
  return pages.some((p) => (p.textEdits?.length ?? 0) > 0);
}
