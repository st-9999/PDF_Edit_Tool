import type { FontStyle } from "@/lib/pdf/content/font-style";
import type { RewriteResult } from "@/lib/pdf/content/rewrite";
import { describeRewriteFailures } from "@/lib/editor/rewrite-messages";

/** 同梱フォントの書体の表示名。 */
const FALLBACK_FONT_LABELS: Record<FontStyle, string> = {
  serif: "明朝体（Noto Serif JP）",
  sans: "ゴシック体（Noto Sans JP）",
};

export interface PreviewStatus {
  /**
   * - `unchanged`: 入力が元の文字列と同じ
   * - `checking`: 確認中
   * - `ok`: 元の書体のまま書き換えられる
   * - `warning`: 書き換えられるが注意がある（書体が変わる等）
   * - `error`: 書き換えられない
   */
  kind: "unchanged" | "checking" | "ok" | "warning" | "error";
  message: string | null;
  canConfirm: boolean;
}

/** 確定前の確認結果から、編集ボックスに出す状態を決める。 */
export function previewStatus({
  original,
  text,
  result,
}: {
  original: string;
  text: string;
  result: RewriteResult | null;
}): PreviewStatus {
  if (text === original) {
    return { kind: "unchanged", message: null, canConfirm: false };
  }
  if (!result) return { kind: "checking", message: null, canConfirm: false };
  if (!result.ok) {
    return {
      kind: "error",
      message: describeRewriteFailures(result.failures),
      canConfirm: false,
    };
  }
  const messages: string[] = [];
  // 同梱フォントで描く文字を、書体ごとに（最初に現れた書体の順で）まとめる
  const fallbackChars = new Map<FontStyle, Set<string>>();
  for (const w of result.warnings) {
    if (w.kind !== "fallback-font") continue;
    const chars = fallbackChars.get(w.style) ?? new Set<string>();
    for (const ch of w.chars) chars.add(ch);
    fallbackChars.set(w.style, chars);
  }
  for (const [style, chars] of fallbackChars) {
    messages.push(
      `「${[...chars].join("」「")}」は元の書体に無いため、${FALLBACK_FONT_LABELS[style]}で描きます`,
    );
  }
  if (result.warnings.some((w) => w.kind === "clip-not-adjusted")) {
    messages.push(
      "表示範囲の形が複雑なため広げられず、文字の一部が表示されない可能性があります",
    );
  }
  return messages.length > 0
    ? { kind: "warning", message: messages.join("。"), canConfirm: true }
    : { kind: "ok", message: null, canConfirm: true };
}
