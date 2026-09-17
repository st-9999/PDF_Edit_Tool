/**
 * 元のフォントが明朝体（セリフ体）かゴシック体（サンセリフ体）かを判定する。
 * 元のフォントに無い文字を同梱フォントで描くとき、近い書体を選ぶために使う。
 */

/** `sans` = ゴシック体（Noto Sans JP）、`serif` = 明朝体（Noto Serif JP）。 */
export type FontStyle = "sans" | "serif";

export const FONT_STYLES: readonly FontStyle[] = ["sans", "serif"];

/** 書体ごとの同梱フォント（TrueType）。必要な書体だけ渡せばよい。 */
export type FallbackFonts = Partial<Record<FontStyle, Uint8Array>>;

/** FontDescriptor の Flags の Serif（bit 2。仕様 9.8.2）。 */
export const SERIF_FLAG = 2;

/** ゴシック体・サンセリフ体を表す名前（「Sans Serif」を含むため明朝体より先に調べる）。 */
const SANS_NAME =
  /gothic|ゴシック|sans|kaku|meiryo|メイリオ|arial|helvetica|verdana|dotum|gulim/i;

/** 明朝体・セリフ体を表す名前。 */
const SERIF_NAME =
  /mincho|明朝|serif|hiramin|heiseimin|ming|song|sun$|batang|times|century|garamond|georgia/i;

/**
 * 書体を判定する。名前（ベースフォント名・埋め込みフォントのファミリー名の順）で決まればそれを使い、
 * 決まらなければ Flags の Serif を使う。どちらも無ければゴシック体とみなす。
 * （Word・Excel が出力する MS 明朝は Flags に Serif を立てないことがあるため、名前を優先する。）
 */
export function fontStyleOf({
  flags,
  names,
}: {
  flags: number | undefined;
  names: readonly (string | null | undefined)[];
}): FontStyle {
  for (const name of names) {
    if (!name) continue;
    if (SANS_NAME.test(name)) return "sans";
    if (SERIF_NAME.test(name)) return "serif";
  }
  return ((flags ?? 0) & SERIF_FLAG) !== 0 ? "serif" : "sans";
}
