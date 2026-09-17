import type { RewriteResult } from "@/lib/pdf/content/rewrite";
import { describeRewriteFailures } from "@/lib/editor/rewrite-messages";

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
  const fallbackChars = [
    ...new Set(
      result.warnings.flatMap((w) =>
        w.kind === "fallback-font" ? w.chars : [],
      ),
    ),
  ];
  if (fallbackChars.length > 0) {
    messages.push(
      `「${fallbackChars.join("」「")}」は元の書体に無いため、ゴシック体（Noto Sans JP）で描きます`,
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
