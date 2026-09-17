import type { TextAlign } from "./rewrite";
import type { PageGlyph } from "./text-layout";

/**
 * 画面で書き換え範囲を選ぶための補助。
 * - クリック: 同じ行に詰まって並ぶ「語・数値のまとまり」を選ぶ
 * - ドラッグ: 同じ行の 2 つのグリフの間を選ぶ
 */

export interface TextRun {
  /** グリフ範囲（start 以上 end 未満）。 */
  start: number;
  end: number;
  text: string;
}

/** まとまりを区切る間隔（文字サイズに対する比）。表のセル間などの大きな間隔で区切る。 */
const RUN_GAP_RATIO = 0.3;
/** 前へ戻る方向の許容（カーニングなど）。 */
const RUN_BACKWARD_RATIO = 0.5;
/** 同じ行とみなすベースラインのずれ（文字サイズに対する比）。 */
const SAME_LINE_RATIO = 0.25;
const SAME_SIZE_RATIO = 0.01;

const isBlank = (text: string | null) => !text || /^\s+$/u.test(text);

function direction(g: PageGlyph): [number, number] {
  const len = Math.hypot(g.matrix[0], g.matrix[1]) || 1;
  return [g.matrix[0] / len, g.matrix[1] / len];
}

/** ユーザー空間での文字サイズ（ベースラインと直交する方向の大きさ）。 */
function fontSizeUser(g: PageGlyph): number {
  return Math.hypot(g.matrix[2], g.matrix[3]) || g.fontSize;
}

/** `g` の原点を `base` の原点基準のベースライン方向・直交方向の距離に分解する。 */
function relative(base: PageGlyph, g: PageGlyph) {
  const [dx, dy] = direction(base);
  const rx = g.x - base.x;
  const ry = g.y - base.y;
  return { along: rx * dx + ry * dy, across: -rx * dy + ry * dx };
}

function sameLine(base: PageGlyph, g: PageGlyph): boolean {
  const [bx, by] = direction(base);
  const [gx, gy] = direction(g);
  if (Math.abs(bx - gx) > 1e-3 || Math.abs(by - gy) > 1e-3) return false;
  return (
    Math.abs(relative(base, g).across) <= fontSizeUser(base) * SAME_LINE_RATIO
  );
}

/** `next` が `prev` の直後に続く文字か。 */
function continues(prev: PageGlyph, next: PageGlyph): boolean {
  const size = fontSizeUser(prev);
  if (Math.abs(fontSizeUser(next) - size) > size * SAME_SIZE_RATIO) {
    return false;
  }
  if (!sameLine(prev, next)) return false;
  const gap = relative(prev, next).along - prev.advance;
  return gap <= size * RUN_GAP_RATIO && gap >= -size * RUN_BACKWARD_RATIO;
}

/** ページのグリフを「語・数値のまとまり」に分ける（空白・位置計算に未対応の文字は含めない）。 */
export function findTextRuns(glyphs: PageGlyph[]): TextRun[] {
  const runs: TextRun[] = [];
  let current: TextRun | null = null;
  let previous: PageGlyph | null = null;
  const close = () => {
    if (current) runs.push(current);
    current = null;
    previous = null;
  };
  glyphs.forEach((g, i) => {
    if (isBlank(g.text) || g.unsupported) {
      close();
      return;
    }
    if (current && previous && !continues(previous, g)) close();
    if (!current) current = { start: i, end: i, text: "" };
    current.end = i + 1;
    current.text += g.text;
    previous = g;
  });
  close();
  return runs;
}

/** グリフ `glyphIndex` を含むまとまり（無ければ null）。 */
export function runAt(runs: TextRun[], glyphIndex: number): TextRun | null {
  return runs.find((r) => glyphIndex >= r.start && glyphIndex < r.end) ?? null;
}

/** 隣とみなす間隔の上限（文字サイズに対する比）。字間を空けた見出しの空白 1 つ分は含み、表のセル間は含まない。 */
const NEIGHBOR_GAP_RATIO = 1;

/** `prev` の終わりから `next` の始まりまでが、隣とみなせるほど近いか（同じ行・同じ文字サイズ）。 */
function isNeighbor(prev: PageGlyph, next: PageGlyph): boolean {
  const size = fontSizeUser(prev);
  if (Math.abs(fontSizeUser(next) - size) > size * SAME_SIZE_RATIO) {
    return false;
  }
  if (!sameLine(prev, next)) return false;
  const gap = relative(prev, next).along - prev.advance;
  return gap >= -size * RUN_BACKWARD_RATIO && gap <= size * NEIGHBOR_GAP_RATIO;
}

/**
 * 選んだ範囲の前後すぐ近くに、同じ行の別のまとまりがあるか。
 * 字間を空けた見出し（「土 工 計 算 書」）の 1 文字だけをクリックで選んだときに、
 * ドラッグでまとめて選べることを案内するために使う。
 */
export function hasNeighborRun(
  glyphs: PageGlyph[],
  runs: TextRun[],
  range: { start: number; end: number },
): boolean {
  const first = glyphs[range.start];
  const last = glyphs[range.end - 1];
  if (!first || !last) return false;
  return runs.some((run) => {
    if (run.end <= range.start) {
      return isNeighbor(glyphs[run.end - 1]!, first);
    }
    if (run.start >= range.end) {
      return isNeighbor(last, glyphs[run.start]!);
    }
    return false;
  });
}

/**
 * ドラッグで選んだ 2 つのグリフの間の範囲。向きは問わない。
 * 間のグリフがすべて同じ行に無ければ null。
 */
export function rangeBetween(
  glyphs: PageGlyph[],
  a: number,
  b: number,
): { start: number; end: number } | null {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const base = glyphs[lo];
  if (!base || !glyphs[hi]) return null;
  for (let i = lo + 1; i <= hi; i += 1) {
    if (!sameLine(base, glyphs[i]!)) return null;
  }
  return { start: lo, end: hi + 1 };
}

/** 数値だけの文字列（桁区切り・小数点・符号・通貨・％・円を含む）。全角数字も可。 */
const NUMERIC = /^[+\-−]?[¥￥$]?[0-9０-９][0-9０-９,，.．]*[%％円]?$/u;

/** 揃え方の初期値: 数値だけなら右揃え、それ以外は左揃え。 */
export function suggestAlign(text: string): TextAlign {
  return NUMERIC.test(text.trim()) ? "right" : "left";
}
