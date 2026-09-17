import type { RewriteFailure } from "@/lib/pdf/content/rewrite";

/**
 * テキスト書き換えの失敗理由を利用者向けの日本語にする。
 * 画面から使うため、pdf-lib を含むモジュールには依存しない（型の import のみ）。
 */

const UNSUPPORTED_FONT: Record<string, string> = {
  vertical: "縦書きの文字",
  encoding: "対応していない文字コード方式のフォントの文字",
  metrics: "文字幅の情報が無いフォントの文字",
  type3: "Type3 フォントの文字",
};

/** 失敗の理由を利用者向けの日本語にする。 */
export function describeRewriteFailures(failures: RewriteFailure[]): string {
  const reasons = failures.map((f) => {
    switch (f.kind) {
      case "invalid-range":
        return "書き換える範囲が正しくありません";
      case "overlap":
        return "書き換える範囲が重なっています";
      case "spans-operations":
        return "選んだ範囲は PDF 内で別々の行・書式に分かれているため、まとめて書き換えられません";
      case "unsupported-font":
        return `${UNSUPPORTED_FONT[f.reason] ?? "このフォントの文字"}は書き換えられません`;
      case "missing-glyphs":
        return `「${f.chars.join("」「")}」を描けるフォントがありません`;
    }
  });
  return [...new Set(reasons)].join("。");
}
