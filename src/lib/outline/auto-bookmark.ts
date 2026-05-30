import { createNode, type EditableOutlineNode } from "./edit";
import type {
  ExtractionProgress,
  HeadingPattern,
} from "@/types/heading-pattern";

/* ============================================================================
 * 報告書しおり自動作成（Auto-Bookmark）コアロジック
 *
 * PDF 本文テキストから章（第N章）/ 節（N.N）/ 項（N.N.N）の見出しを検出し、
 * 最大 3 階層の編集可能しおりツリー（EditableOutlineNode[]）を生成する。
 *
 * 純関数（reconstructLines / matchHeading / normalizeTitle / SequenceTracker /
 * detectHeadings / buildBookmarkTree）は pdf.js に依存せず単体テスト可能。
 * pdf.js 連携（extractPageLines / autoGenerateBookmarks）のみ TextSource を介する。
 * ========================================================================== */

/** localStorage 永続化キー（パターン設定の保存先）。 */
export const PATTERNS_STORAGE_KEY = "pdf-edit:auto-bookmark-patterns";

/** 行復元の許容 y 差: フォントサイズ中央値に対する係数（行間の取りこぼし防止）。 */
const Y_TOLERANCE_RATIO = 0.3;
/** 行復元の許容 y 差の下限(px)。 */
const Y_TOLERANCE_MIN = 2;

/** タイトル部に最低 1 文字要求する「文字」（日本語かな・漢字・英字）。数字のみの行を除外する。 */
const TEXT_CLASS = "A-Za-z\\u3040-\\u30ff\\u4e00-\\u9fff";
/** 半角・全角いずれの数字も許容する数字クラス。 */
const DIGIT_CLASS = "0-9\\uff10-\\uff19";

/**
 * デフォルト見出しパターン（章 / 節 / 項）。すべて builtin・初期状態は有効。
 * - 全角数字（第１章 / １.１）にも対応。
 * - タイトル部に日本語または英字を 1 文字以上要求し、数字のみの行（表データ等）を除外。
 * - 節（N.N）は直後にさらに `.N` が続く場合を否定先読みで除外し、項との誤検出を防ぐ。
 */
export const DEFAULT_PATTERNS: HeadingPattern[] = [
  {
    id: "builtin-chapter",
    label: "章（第N章）",
    level: 1,
    enabled: true,
    builtin: true,
    pattern: `^\\s*(?<title>第[${DIGIT_CLASS}]+章(?:\\s+\\S.*)?)\\s*$`,
  },
  {
    id: "builtin-section",
    label: "節（N.N）",
    level: 2,
    enabled: true,
    builtin: true,
    pattern: `^\\s*(?<title>[${DIGIT_CLASS}]+\\.[${DIGIT_CLASS}]+(?!\\.[${DIGIT_CLASS}])(?=.*[${TEXT_CLASS}])\\s+.*\\S)\\s*$`,
  },
  {
    id: "builtin-item",
    label: "項（N.N.N）",
    level: 3,
    enabled: true,
    builtin: true,
    pattern: `^\\s*(?<title>[${DIGIT_CLASS}]+\\.[${DIGIT_CLASS}]+\\.[${DIGIT_CLASS}]+(?=.*[${TEXT_CLASS}])\\s+.*\\S)\\s*$`,
  },
];

/* ------------------------------ テキスト正規化 ------------------------------ */

/** 全角数字（０-９）を半角（0-9）へ変換する。 */
export function normalizeDigits(input: string): string {
  return input.replace(/[０-９]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0xff10 + 0x30),
  );
}

const CJK = "\\u3040-\\u30ff\\u4e00-\\u9fff\\u30fb";

/**
 * PDF 抽出時に混入する不要なスペースを除去し、読みやすいタイトルへ整形する。
 * - 全角数字を半角化、`第 N 章`→`第N章`、`N. N. N`→`N.N.N`
 * - CJK 文字間の単一スペースを繰り返し除去
 * - 番号部分とタイトル部分の区切りスペースは復元（`第1章総則`→`第1章 総則`）
 */
export function normalizeTitle(title: string): string {
  let t = normalizeDigits(title).trim();

  // 第 N 章 → 第N章
  t = t.replace(/第\s*([0-9]+)\s*章/g, "第$1章");
  // 番号内のドット前後スペースを除去（ドット単位で処理し N.N.N まで対応）
  t = t.replace(/([0-9])\s+\./g, "$1.");
  t = t.replace(/\.\s+([0-9])/g, ".$1");

  // CJK 文字間の単一スペースを繰り返し除去（安定するまで）
  const cjkSpace = new RegExp(`([${CJK}]) ([${CJK}])`);
  let prev: string;
  do {
    prev = t;
    t = t.replace(cjkSpace, "$1$2");
  } while (t !== prev);

  // 連続スペースを 1 つに畳む
  t = t.replace(/\s{2,}/g, " ");

  // 番号ブロックとタイトルの境界スペースを復元（次が文字＝非空白/非ドット/非数字のときのみ）。
  // 否定先読みで `.` や数字を除外し、`1.1.1` のような番号列を分断しないようにする。
  t = t.replace(/^(第[0-9]+章|[0-9]+(?:\.[0-9]+)*)(?=[^\s.0-9])/, "$1 ");

  return t.trim();
}

/* ------------------------------ パターン適用 ------------------------------ */

/** コンパイル済みパターン（適用順に並ぶ）。 */
export interface CompiledPattern {
  regex: RegExp;
  level: 1 | 2 | 3;
}

/**
 * 有効パターンのみを抽出し、**level 降順（項3→節2→章1）** に並べて `RegExp`（フラグ `mu`）化する。
 * 具体的なパターンを先に試すことで `1.1.1` が `1.1` として誤検出されるのを防ぐ。
 * 不正な正規表現のパターンはスキップする。
 */
export function compilePatterns(patterns: HeadingPattern[]): CompiledPattern[] {
  return patterns
    .filter((p) => p.enabled)
    .sort((a, b) => b.level - a.level)
    .flatMap((p) => {
      try {
        return [{ regex: new RegExp(p.pattern, "mu"), level: p.level }];
      } catch {
        return [];
      }
    });
}

/** 目次（TOC）のリーダー線（連続するドット/ダッシュ等）を含む行か。 */
function isTocLeaderLine(line: string): boolean {
  return /\.{4,}|…|・{4,}|[-–—]{3,}|(?:\.\s){3,}/.test(line);
}

/**
 * 1 行に対し見出しを判定する。TOC リーダー線は除外し、先頭のパターンから順に試して
 * 最初にマッチしたものを採用する。タイトルは名前付きグループ `<title>`（無ければマッチ全体）
 * を `normalizeTitle` で正規化して返す。見出しでなければ null。
 */
export function matchHeading(
  line: string,
  patterns: CompiledPattern[],
): { title: string; level: 1 | 2 | 3 } | null {
  if (line.trim().length === 0) return null;
  if (isTocLeaderLine(line)) return null;

  for (const { regex, level } of patterns) {
    const m = regex.exec(line);
    if (m) {
      const raw = m.groups?.title ?? m[0];
      const title = normalizeTitle(raw);
      if (title.length === 0) continue;
      return { title, level };
    }
  }
  return null;
}

/* ------------------------------ 番号順序フィルタ ------------------------------ */

/** タイトル先頭の番号トークンを数値配列へ。番号が無ければ null（カスタム見出し等）。 */
function leadingNumbers(title: string): number[] | null {
  const t = normalizeDigits(title).trim();
  const chapter = t.match(/^第([0-9]+)章/);
  if (chapter) return [Number(chapter[1])];
  const dotted = t.match(/^([0-9]+(?:\.[0-9]+)*)/);
  if (dotted) return dotted[1]!.split(".").map(Number);
  return null;
}

/** 数値配列の辞書順比較（a<b: -1, a>b: 1, 等: 0）。 */
function compareSeq(a: number[], b: number[]): number {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    const av = a[i] ?? -Infinity;
    const bv = b[i] ?? -Infinity;
    if (av !== bv) return av < bv ? -1 : 1;
  }
  return 0;
}

/**
 * レベルごとに直前の番号を追跡し、**番号が後退するマッチを除外**する（偽マッチや本文中の
 * 数字を排除）。前方ジャンプは許可（章の欠落に対応）。上位レベルの見出しが出現したら
 * 下位レベルの追跡をリセットする（新章で節番号が 1 に戻るケースに対応）。
 * 番号を持たないカスタムパターンのマッチは常に採用する。
 */
export class SequenceTracker {
  private last: Record<1 | 2 | 3, number[] | null> = { 1: null, 2: null, 3: null };

  /** 採用してよければ true。後退していれば false。 */
  accept(level: 1 | 2 | 3, title: string): boolean {
    const seq = leadingNumbers(title);
    if (seq === null) return true; // 番号なし → 常に採用

    const prev = this.last[level];
    if (prev !== null && compareSeq(seq, prev) < 0) return false; // 後退 → 除外

    this.last[level] = seq;
    // 下位レベルの追跡をリセット
    for (const lower of [1, 2, 3] as const) {
      if (lower > level) this.last[lower] = null;
    }
    return true;
  }
}

/* ------------------------------ 行復元（pdf.js TextItem） ------------------------------ */

/** 行復元に必要な TextItem の最小情報。 */
export interface LineItem {
  str: string;
  /** x 座標（transform[4]）。 */
  x: number;
  /** y 座標（transform[5]）。 */
  y: number;
  /** フォントサイズ（item.height か transform[3]）。 */
  fontSize: number;
}

/** 数値配列の中央値（昇順ソート前提でなくてよい）。空なら 0。 */
function median(values: number[]): number {
  const sorted = values.filter((v) => v > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  return sorted[Math.floor(sorted.length / 2)]!;
}

/**
 * TextItem 群を行テキストへ復元する。
 * フォントサイズ中央値から動的に `yTolerance = max(2, 中央値 × 0.3)` を算出し、
 * y 座標降順でグループ化、同一行内は x 昇順に並べて結合する。
 * 固定 2px ではなくフォントサイズ比例の許容差を使うことで、大きい見出し文字でも 1 行にまとまる。
 */
export function reconstructLines(items: LineItem[]): string[] {
  if (items.length === 0) return [];
  const yTolerance = Math.max(
    Y_TOLERANCE_MIN,
    median(items.map((i) => i.fontSize)) * Y_TOLERANCE_RATIO,
  );

  const byY = [...items].sort((a, b) => b.y - a.y);
  const groups: { y: number; items: LineItem[] }[] = [];
  for (const item of byY) {
    const last = groups[groups.length - 1];
    if (last && Math.abs(item.y - last.y) <= yTolerance) {
      last.items.push(item);
    } else {
      groups.push({ y: item.y, items: [item] });
    }
  }

  return groups.map((g) =>
    g.items
      .sort((a, b) => a.x - b.x)
      .map((i) => i.str)
      .join(""),
  );
}

/* ------------------------------ 見出し検出 → ツリー構築 ------------------------------ */

/** 検出された見出し（pageNumber は表示位置・1 始まり）。 */
export interface HeadingMatch {
  title: string;
  level: 1 | 2 | 3;
  pageNumber: number;
}

/** 1 ページ分の行に検出を適用し、採用された見出しを out へ追記する。 */
function detectInLines(
  lines: string[],
  compiled: CompiledPattern[],
  tracker: SequenceTracker,
  pageNumber: number,
  out: HeadingMatch[],
): void {
  for (const line of lines) {
    const m = matchHeading(line, compiled);
    if (m && tracker.accept(m.level, m.title)) {
      out.push({ title: m.title, level: m.level, pageNumber });
    }
  }
}

/**
 * ページごとの行配列から見出しを検出する純関数。
 * パターンを level 降順に適用し、番号後退フィルタ（SequenceTracker）で偽マッチを除外する。
 */
export function detectHeadings(
  pageLines: string[][],
  patterns: HeadingPattern[],
): HeadingMatch[] {
  const compiled = compilePatterns(patterns);
  const tracker = new SequenceTracker();
  const out: HeadingMatch[] = [];
  pageLines.forEach((lines, i) => detectInLines(lines, compiled, tracker, i + 1, out));
  return out;
}

/** ツリー構築が宛先解決に用いる、表示ページの最小情報。 */
export interface PageTarget {
  sourceId: string;
  sourceIndex: number;
}

/**
 * 検出済み見出しをスタックベースで親子に組み立て、編集可能しおりツリーへ変換する。
 * 各ノードの宛先は `pages[pageNumber-1]` の {sourceId, sourceIndex}。
 * 親レベルが欠落していても破綻せず、出現順を保った妥当なツリーを返す。
 */
export function buildBookmarkTree(
  headings: HeadingMatch[],
  pages: PageTarget[],
): EditableOutlineNode[] {
  const roots: EditableOutlineNode[] = [];
  const stack: { level: 1 | 2 | 3; node: EditableOutlineNode }[] = [];

  for (const h of headings) {
    const ref = pages[h.pageNumber - 1];
    if (!ref) continue;
    const node = createNode({
      title: h.title,
      sourceId: ref.sourceId,
      sourceIndex: ref.sourceIndex,
    });

    while (stack.length > 0 && stack[stack.length - 1]!.level >= h.level) {
      stack.pop();
    }
    if (stack.length === 0) roots.push(node);
    else stack[stack.length - 1]!.node.children.push(node);
    stack.push({ level: h.level, node });
  }

  return roots;
}

/* ------------------------------ pdf.js 連携 ------------------------------ */

/** pdf.js の TextItem（必要部分のみ）。 */
interface RawTextItem {
  str?: string;
  height?: number;
  transform?: number[];
}

/**
 * extractPageLines が必要とする pdf.js プロキシの最小インターフェース。
 * `items` は TextItem と TextMarkedContent が混在しうるため unknown[] で受け、
 * `toLineItems` 側で str/transform を持つ項目のみ取り出す。
 */
export interface TextSource {
  getPage(pageNumber: number): Promise<{
    getTextContent(): Promise<{ items: readonly unknown[] }>;
    cleanup?: () => void;
  }>;
}

/** TextItem を行復元用 LineItem へ写像する（str/transform を持たない項目は除外）。 */
function toLineItems(items: readonly unknown[]): LineItem[] {
  const out: LineItem[] = [];
  for (const raw of items) {
    if (typeof raw !== "object" || raw === null) continue;
    const it = raw as RawTextItem;
    if (typeof it.str !== "string" || it.str.length === 0) continue;
    const tf = it.transform;
    if (!tf || tf.length < 6) continue;
    const fontSize = it.height && it.height > 0 ? it.height : Math.abs(tf[3]!);
    out.push({ str: it.str, x: tf[4]!, y: tf[5]!, fontSize });
  }
  return out;
}

/** 指定ソース内ページ（0 始まり sourceIndex）のテキストを行へ復元する。 */
export async function extractPageLines(
  source: TextSource,
  sourceIndex: number,
): Promise<string[]> {
  const page = await source.getPage(sourceIndex + 1);
  try {
    const content = await page.getTextContent();
    return reconstructLines(toLineItems(content.items));
  } finally {
    page.cleanup?.();
  }
}

/** 自動生成の対象となる表示ページ（順序＝出力ページ順）。 */
export interface AutoBookmarkPage {
  sourceId: string;
  sourceIndex: number;
}

/**
 * 表示ページ列からしおりを自動生成する統合関数。
 * 表示順にテキストを抽出・検出し、編集可能しおりツリーを返す。
 *
 * - `getSource(sourceId)` で各ソースの pdf.js プロキシを解決（未解決ソースは空ページ扱い）。
 * - 各ページ処理前に `signal?.aborted` を確認し、中止時は AbortError を投げる。
 * - `onProgress` で {現在ページ/総ページ/検出件数} を通知する。
 * - `startPage`（1 始まり・既定 1）より前のページはスキップする（表紙・目次の除外）。
 */
export async function autoGenerateBookmarks(
  pages: AutoBookmarkPage[],
  getSource: (sourceId: string) => TextSource | undefined,
  patterns: HeadingPattern[],
  onProgress?: (progress: ExtractionProgress) => void,
  signal?: AbortSignal,
  startPage = 1,
): Promise<EditableOutlineNode[]> {
  const compiled = compilePatterns(patterns);
  const tracker = new SequenceTracker();
  const matches: HeadingMatch[] = [];
  const totalPages = pages.length;

  for (let i = 0; i < pages.length; i += 1) {
    if (signal?.aborted) {
      throw new DOMException("中止されました", "AbortError");
    }
    const pageNumber = i + 1;

    if (pageNumber >= startPage) {
      const ref = pages[i]!;
      const source = getSource(ref.sourceId);
      if (source) {
        try {
          const lines = await extractPageLines(source, ref.sourceIndex);
          detectInLines(lines, compiled, tracker, pageNumber, matches);
        } catch {
          // 当該ページの抽出失敗はスキップ（画像ページ等）
        }
      }
    }

    onProgress?.({
      currentPage: pageNumber,
      totalPages,
      foundCount: matches.length,
    });
  }

  return buildBookmarkTree(matches, pages);
}

/* ------------------------------ パターン永続化（純関数部） ------------------------------ */

/**
 * localStorage に保存されたパターン設定を既定パターンへ合成する（純関数）。
 * 組み込みは保存済みの enabled を反映し、カスタム（builtin=false）は末尾へ追加する。
 * 保存値が不正な場合は既定パターンをそのまま返す。
 */
export function mergeStoredPatterns(
  stored: unknown,
  defaults: HeadingPattern[] = DEFAULT_PATTERNS,
): HeadingPattern[] {
  if (!Array.isArray(stored)) return defaults.map((p) => ({ ...p }));

  const isPattern = (v: unknown): v is HeadingPattern =>
    typeof v === "object" &&
    v !== null &&
    typeof (v as HeadingPattern).id === "string" &&
    typeof (v as HeadingPattern).pattern === "string" &&
    [1, 2, 3].includes((v as HeadingPattern).level);

  const storedPatterns = stored.filter(isPattern);
  const byId = new Map(storedPatterns.map((p) => [p.id, p]));

  const builtins = defaults.map((p) => ({
    ...p,
    enabled: byId.get(p.id)?.enabled ?? p.enabled,
  }));
  const customs = storedPatterns
    .filter((p) => !p.builtin && !defaults.some((d) => d.id === p.id))
    .map((p) => ({ ...p, builtin: false as const }));

  return [...builtins, ...customs];
}
