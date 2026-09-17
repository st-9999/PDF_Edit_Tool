import { BASE_PATH, joinBasePath } from "@/lib/config";
import type { PageRef, TextEdit } from "@/lib/editor/operations";
import {
  FONT_STYLES,
  type FallbackFonts,
  type FontStyle,
} from "@/lib/pdf/content/font-style";
import type { RewriteResult } from "@/lib/pdf/content/rewrite";

/**
 * 同梱フォント（SIL Open Font License 1.1）の配信パス。
 * ゴシック体は Noto Sans JP Regular（5.5MB）、明朝体は Noto Serif JP Regular（7.7MB）。
 */
export const FALLBACK_FONT_PATHS: Record<FontStyle, string> = {
  sans: "/fonts/NotoSansJP-Regular.ttf",
  serif: "/fonts/NotoSerifJP-Regular.ttf",
};

type Fetcher = (url: string) => Promise<Response>;

/** 指定した書体の同梱フォントを返す（取得済みのものは取得し直さない）。 */
export type FallbackFontLoader = (
  styles: Iterable<FontStyle>,
) => Promise<FallbackFonts>;

/**
 * 同梱フォントを必要になったときに書体ごとに 1 度だけ取得するローダーを作る（大きいため初期表示には含めない）。
 * 取得に失敗した場合は次回に取得し直す。
 */
export function createFallbackFontLoader(
  fetcher: Fetcher,
  basePath: string,
): FallbackFontLoader {
  const pending = new Map<FontStyle, Promise<Uint8Array>>();
  const loadOne = (style: FontStyle): Promise<Uint8Array> => {
    let task = pending.get(style);
    if (!task) {
      task = (async () => {
        try {
          const response = await fetcher(
            joinBasePath(basePath, FALLBACK_FONT_PATHS[style]),
          );
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return new Uint8Array(await response.arrayBuffer());
        } catch (err) {
          pending.delete(style);
          throw new Error("書き換え用のフォントを読み込めませんでした", {
            cause: err,
          });
        }
      })();
      pending.set(style, task);
    }
    return task;
  };
  return async (styles) => {
    const wanted = orderedStyles(styles);
    const loaded = await Promise.all(wanted.map(loadOne));
    return Object.fromEntries(
      wanted.map((style, i) => [style, loaded[i]]),
    ) as FallbackFonts;
  };
}

/** アプリで使う同梱フォントのローダー。 */
export const loadFallbackFonts = createFallbackFontLoader(
  (url) => fetch(url),
  BASE_PATH,
);

/** 重複を除き、決まった順（sans → serif）に並べる。 */
function orderedStyles(styles: Iterable<FontStyle>): FontStyle[] {
  const set = new Set(styles);
  return FONT_STYLES.filter((style) => set.has(style));
}

/** 書き換え履歴を再現するのに必要な同梱フォントの書体。 */
export function fallbackStylesOfEdits(edits: readonly TextEdit[]): FontStyle[] {
  return orderedStyles(edits.flatMap((edit) => edit.fallbackStyles ?? []));
}

/** ページ列（保存・抽出・分割の対象）の書き換えに必要な同梱フォントの書体。 */
export function fallbackStylesOfPages(pages: readonly PageRef[]): FontStyle[] {
  return fallbackStylesOfEdits(pages.flatMap((page) => page.textEdits ?? []));
}

/**
 * 確定前の確認結果から、同梱フォントの書体を求める。
 * 成功なら実際に同梱フォントで描いた書体、失敗なら描けない文字を補うのに必要な書体。
 */
export function fallbackStylesOfResult(result: RewriteResult): FontStyle[] {
  return orderedStyles(
    result.ok
      ? result.warnings.flatMap((w) =>
          w.kind === "fallback-font" ? [w.style] : [],
        )
      : result.failures.flatMap((f) =>
          f.kind === "missing-glyphs" ? [f.style] : [],
        ),
  );
}
