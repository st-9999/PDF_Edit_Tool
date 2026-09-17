import { PDFName, type PDFDocument } from "pdf-lib";
import type { FontModel, FontUnsupportedReason } from "./font";
import {
  GlyphResolver,
  type GlyphResolverOptions,
  type ResolvedGlyph,
} from "./glyph-resolver";
import type { ContentOperation, Operand } from "./operations";
import { extractPageText, type PageText } from "./page-text";
import { transformPoint, type Matrix, type PageGlyph } from "./text-layout";

/** 置き換え後の文字列をどこに揃えるか。 */
export type TextAlign = "left" | "right" | "center";

export interface TextReplacement {
  /** 置き換えるグリフ範囲（`extractPageText` の glyphs の index、start 以上 end 未満）。 */
  start: number;
  end: number;
  /** 新しい文字列（空文字なら削除）。 */
  text: string;
  align: TextAlign;
}

export type RewriteFailure =
  | { kind: "invalid-range"; replacement: number }
  | { kind: "overlap"; replacement: number }
  | { kind: "spans-operations"; replacement: number }
  | {
      kind: "unsupported-font";
      replacement: number;
      reason: FontUnsupportedReason;
    }
  | { kind: "missing-glyphs"; replacement: number; chars: string[] };

export type RewriteWarning =
  | {
      /** 文字がクリップからはみ出すが、クリップが矩形でないため広げられなかった。 */
      kind: "clip-not-adjusted";
      replacement: number;
    }
  | {
      /** 文書内のフォントで描けず、同梱フォントで描いた（書体が変わる）文字。 */
      kind: "fallback-font";
      replacement: number;
      chars: string[];
    };

/** 1 文字を描くフォントとコードを決める関数（描けなければ null）。 */
export type GlyphResolveFn = (
  fontResource: string,
  char: string,
) => ResolvedGlyph | null;

export type RewriteResult =
  | { ok: true; clipAdjustments: number; warnings: RewriteWarning[] }
  | { ok: false; failures: RewriteFailure[] };

const EPS = 1e-6;
const PATH_CONSTRUCTION = new Set(["m", "l", "c", "v", "y", "h", "re"]);
const PATH_END = new Set(["S", "s", "f", "F", "f*", "B", "B*", "b", "b*", "n"]);

// ---------------------------------------------------------------------------
// 数値・行列

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const s = n.toFixed(5).replace(/\.?0+$/, "");
  return s === "-0" || s === "" ? "0" : s;
}

/** クリップを広げる向きに丸める（最小側は切り捨て、最大側は切り上げ）。 */
const floor5 = (n: number) => Math.floor(n * 1e5) / 1e5;
const ceil5 = (n: number) => Math.ceil(n * 1e5) / 1e5;

function invert(m: Matrix): Matrix | null {
  const [a, b, c, d, e, f] = m;
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-12) return null;
  return [
    d / det,
    -b / det,
    -c / det,
    a / det,
    (c * f - d * e) / det,
    (b * e - a * f) / det,
  ];
}

// ---------------------------------------------------------------------------
// 置換する命令の単位列（グリフ／TJ の数値）

type Unit =
  | {
      kind: "glyph";
      bytes: Uint8Array;
      /** 元のグリフの index（新しいグリフは -1）。 */
      glyphIndex: number;
      /** 描くフォントのリソース名。 */
      resource: string;
    }
  | { kind: "number"; value: number };

/** 文字列を持つ引数（Tj・TJ・' は 0、" は 2）。 */
function textOperand(op: ContentOperation): Operand | undefined {
  return op.operands[op.operator === '"' ? 2 : 0];
}

function unitsOf(
  op: ContentOperation,
  font: FontModel,
  firstGlyphIndex: number,
): Unit[] {
  const units: Unit[] = [];
  let next = firstGlyphIndex;
  const pushString = (o: Operand) => {
    if (o.kind !== "string") return;
    for (const c of font.splitCodes(o.bytes)) {
      units.push({
        kind: "glyph",
        bytes: o.bytes.subarray(c.offset, c.offset + c.length),
        glyphIndex: next,
        resource: font.resourceName,
      });
      next += 1;
    }
  };
  const arg = textOperand(op);
  if (!arg) return units;
  if (op.operator === "TJ") {
    if (arg.kind !== "array") return units;
    for (const item of arg.items) {
      if (item.kind === "number")
        units.push({ kind: "number", value: item.value });
      else pushString(item);
    }
  } else {
    pushString(arg);
  }
  return units;
}

function codeBytes(code: number, length: number): Uint8Array {
  return length === 2
    ? Uint8Array.of(code >> 8, code & 0xff)
    : Uint8Array.of(code & 0xff);
}

function hex(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += b.toString(16).toUpperCase().padStart(2, "0");
  return s;
}

/**
 * 単位列を文字列表示の命令として書き出す。連続するグリフは 1 つの 16 進文字列にまとめ、
 * 描くフォントが変わる箇所では TJ を区切って Tf で切り替え、最後に元のフォントへ戻す。
 */
function serializeTextShow(
  units: Unit[],
  baseResource: string,
  fontSize: number,
): string {
  const out: string[] = [];
  let current = baseResource;
  let parts: string[] = [];
  let pending: number[] = [];
  const flushGlyphs = () => {
    if (pending.length > 0) parts.push(`<${hex(Uint8Array.from(pending))}>`);
    pending = [];
  };
  const flushArray = () => {
    flushGlyphs();
    if (parts.length > 0) out.push(`[${parts.join(" ")}] TJ`);
    parts = [];
  };
  const switchTo = (resource: string) => {
    flushArray();
    out.push(`${PDFName.of(resource).toString()} ${fmt(fontSize)} Tf`);
    current = resource;
  };
  for (const u of units) {
    if (u.kind === "glyph") {
      if (u.resource !== current) switchTo(u.resource);
      pending.push(...u.bytes);
    } else {
      flushGlyphs();
      parts.push(fmt(u.value));
    }
  }
  flushArray();
  if (current !== baseResource) switchTo(baseResource);
  return out.length > 0 ? out.join(" ") : "[] TJ";
}

// ---------------------------------------------------------------------------
// クリップ

interface ClipRecord {
  /** クリップパスを構成する命令の index。 */
  pathOps: number[];
  /** パス定義時の CTM（パス座標 → ユーザー空間）。 */
  ctm: Matrix;
}

/** 各命令の時点で有効なクリップの一覧を求める。 */
function activeClipsByOp(
  ops: ContentOperation[],
  ctmBeforeOp: Matrix[],
): Map<number, ClipRecord[]> {
  const result = new Map<number, ClipRecord[]>();
  let clips: ClipRecord[] = [];
  const stack: ClipRecord[][] = [];
  let path: number[] = [];
  let clipPending = false;
  for (const op of ops) {
    result.set(op.index, clips);
    const name = op.operator;
    if (name === "q") {
      stack.push(clips);
    } else if (name === "Q") {
      clips = stack.pop() ?? [];
    } else if (PATH_CONSTRUCTION.has(name)) {
      path.push(op.index);
    } else if (name === "W" || name === "W*") {
      clipPending = true;
    } else if (PATH_END.has(name)) {
      if (clipPending && path.length > 0) {
        clips = [
          ...clips,
          { pathOps: path, ctm: ctmBeforeOp[path[0]!] ?? [1, 0, 0, 1, 0, 0] },
        ];
      }
      path = [];
      clipPending = false;
    }
  }
  return result;
}

const nums = (op: ContentOperation) =>
  op.operands.map((o) => (o.kind === "number" ? o.value : Number.NaN));

interface Rect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** クリップパスが軸に平行な矩形（re、または m + l×3 [+ l] [+ h]）なら、その範囲を返す。 */
function clipRect(ops: ContentOperation[], clip: ClipRecord): Rect | null {
  const pathOps = clip.pathOps.map((i) => ops[i]!);
  if (pathOps.length === 1 && pathOps[0]!.operator === "re") {
    const [x, y, w, h] = nums(pathOps[0]!);
    if ([x, y, w, h].some((v) => !Number.isFinite(v))) return null;
    return {
      minX: Math.min(x!, x! + w!),
      maxX: Math.max(x!, x! + w!),
      minY: Math.min(y!, y! + h!),
      maxY: Math.max(y!, y! + h!),
    };
  }
  const body = pathOps.filter((o) => o.operator !== "h");
  if (
    body.length < 4 ||
    body.length > 5 ||
    body[0]!.operator !== "m" ||
    body.slice(1).some((o) => o.operator !== "l")
  ) {
    return null;
  }
  const points = body.map((o) => nums(o));
  if (
    points.some((p) => p.length !== 2 || p.some((v) => !Number.isFinite(v)))
  ) {
    return null;
  }
  const xs = [...new Set(points.map((p) => p[0]!))];
  const ys = [...new Set(points.map((p) => p[1]!))];
  if (xs.length !== 2 || ys.length !== 2) return null;
  // 4 隅すべてが現れること（台形などを除外）
  const corners = new Set(points.map((p) => `${p[0]},${p[1]}`));
  for (const x of xs)
    for (const y of ys) if (!corners.has(`${x},${y}`)) return null;
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

/** クリップパスの座標の外接矩形（はみ出し判定用）。 */
function pathBounds(ops: ContentOperation[], clip: ClipRecord): Rect | null {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const i of clip.pathOps) {
    const op = ops[i]!;
    const v = nums(op);
    if (op.operator === "re") {
      xs.push(v[0]!, v[0]! + v[2]!);
      ys.push(v[1]!, v[1]! + v[3]!);
      continue;
    }
    for (let k = 0; k + 1 < v.length; k += 2) {
      xs.push(v[k]!);
      ys.push(v[k + 1]!);
    }
  }
  if (xs.length === 0 || [...xs, ...ys].some((n) => !Number.isFinite(n))) {
    return null;
  }
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

/** 矩形クリップのパス命令を、新しい範囲で書き直した文字列にする。 */
function rewriteClipPath(
  ops: ContentOperation[],
  clip: ClipRecord,
  from: Rect,
  to: Rect,
): { op: ContentOperation; text: string }[] {
  const pathOps = clip.pathOps.map((i) => ops[i]!);
  if (pathOps.length === 1 && pathOps[0]!.operator === "re") {
    const op = pathOps[0]!;
    return [
      {
        op,
        text: `${fmt(to.minX)} ${fmt(to.minY)} ${fmt(to.maxX - to.minX)} ${fmt(to.maxY - to.minY)} re`,
      },
    ];
  }
  const mapX = (x: number) => (x === from.minX ? to.minX : to.maxX);
  const mapY = (y: number) => (y === from.minY ? to.minY : to.maxY);
  return pathOps
    .filter((op) => op.operator !== "h")
    .map((op) => {
      const [x, y] = nums(op);
      return { op, text: `${fmt(mapX(x!))} ${fmt(mapY(y!))} ${op.operator}` };
    });
}

// ---------------------------------------------------------------------------
// 本体

interface PlannedReplacement {
  index: number;
  replacement: TextReplacement;
  glyphs: PageGlyph[];
  font: FontModel;
  resolved: ResolvedGlyph[];
}

/**
 * 1 つの描画命令の中で置き換える部分。範囲が複数の命令にまたがる場合、
 * 先頭の命令の部分に新しい文字列を入れ、2 つ目以降の命令の部分は削除する。
 */
interface Portion {
  plan: PlannedReplacement;
  opIndex: number;
  /** この命令の中の範囲（グリフ index、start 以上 end 未満）。 */
  start: number;
  end: number;
  glyphs: PageGlyph[];
  /** 先頭の部分（新しい文字列・揃え・クリップ判定を担う）か。 */
  primary: boolean;
}

/** ベースライン方向の単位ベクトル（ユーザー空間）。 */
function baselineDirection(g: PageGlyph): [number, number] {
  const len = Math.hypot(g.matrix[0], g.matrix[1]) || 1;
  return [g.matrix[0] / len, g.matrix[1] / len];
}

/** 範囲外の許容差（文字サイズに対する比）。 */
const SAME_LINE_TOLERANCE = 0.25;
const SAME_SIZE_TOLERANCE = 0.01;

/**
 * 複数の命令にまたがる範囲をまとめて書き換えられるか。
 * 同じフォント・同じ文字サイズ・同じ水平倍率で、同じ行に読み順どおり並んでいること。
 */
function canMergeAcrossOperations(glyphs: PageGlyph[]): boolean {
  const first = glyphs[0]!;
  const [dx, dy] = baselineDirection(first);
  const fontSizeUser =
    Math.hypot(first.matrix[2], first.matrix[3]) || first.fontSize;
  let previousAlong = -Infinity;
  for (const g of glyphs) {
    if (g.fontResource !== first.fontResource) return false;
    if (
      Math.abs(g.fontSize - first.fontSize) >
        first.fontSize * SAME_SIZE_TOLERANCE ||
      Math.abs(g.horizontalScale - first.horizontalScale) > SAME_SIZE_TOLERANCE
    ) {
      return false;
    }
    const [gx, gy] = baselineDirection(g);
    if (Math.abs(gx - dx) > 1e-3 || Math.abs(gy - dy) > 1e-3) return false;
    const rx = g.x - first.x;
    const ry = g.y - first.y;
    const along = rx * dx + ry * dy;
    const across = -rx * dy + ry * dx;
    if (Math.abs(across) > fontSizeUser * SAME_LINE_TOLERANCE) return false;
    if (along < previousAlong - 1e-6) return false;
    previousAlong = along;
  }
  return true;
}

function validate(
  page: PageText,
  replacements: TextReplacement[],
  resolveGlyph: GlyphResolveFn,
): { planned: PlannedReplacement[]; failures: RewriteFailure[] } {
  const failures: RewriteFailure[] = [];
  const planned: PlannedReplacement[] = [];
  const taken: [number, number][] = [];

  replacements.forEach((r, index) => {
    if (
      !Number.isInteger(r.start) ||
      !Number.isInteger(r.end) ||
      r.start < 0 ||
      r.end <= r.start ||
      r.end > page.glyphs.length
    ) {
      failures.push({ kind: "invalid-range", replacement: index });
      return;
    }
    if (taken.some(([s, e]) => r.start < e && s < r.end)) {
      failures.push({ kind: "overlap", replacement: index });
      return;
    }
    taken.push([r.start, r.end]);

    const glyphs = page.glyphs.slice(r.start, r.end);
    const first = glyphs[0]!;
    const spansOperations = glyphs.some(
      (g) => g.source.opIndex !== first.source.opIndex,
    );
    if (spansOperations && !canMergeAcrossOperations(glyphs)) {
      failures.push({ kind: "spans-operations", replacement: index });
      return;
    }
    const font = page.fonts.get(first.fontResource)!;
    if (first.unsupported) {
      failures.push({
        kind: "unsupported-font",
        replacement: index,
        reason: first.unsupported,
      });
      return;
    }
    const resolved: ResolvedGlyph[] = [];
    const missing: string[] = [];
    for (const ch of r.text) {
      const glyph = resolveGlyph(first.fontResource, ch);
      if (glyph === null) {
        if (!missing.includes(ch)) missing.push(ch);
      } else {
        resolved.push(glyph);
      }
    }
    if (missing.length > 0) {
      failures.push({
        kind: "missing-glyphs",
        replacement: index,
        chars: missing,
      });
      return;
    }
    planned.push({ index, replacement: r, glyphs, font, resolved });
  });

  return { planned, failures };
}

/** グリフ 1 つ分の送り（テキスト空間、Tc・Tw・Tz を含む）。 */
function textAdvance(
  width: number,
  isWordSpace: boolean,
  state: PageGlyph,
): number {
  const tw = isWordSpace ? state.wordSpacing : 0;
  return (
    ((width / 1000) * state.fontSize + state.charSpacing + tw) *
    state.horizontalScale
  );
}

/** 元のフォントの ToUnicode だけで解決する（補完しない）。 */
function sameFontResolver(page: PageText): GlyphResolveFn {
  return (resource, char) => {
    const font = page.fonts.get(resource);
    const code = font?.encode(char) ?? null;
    if (!font || code === null) return null;
    const codeLength = font.subtype === "Type0" ? 2 : 1;
    return {
      char,
      resource,
      code,
      codeLength,
      width: font.width(code),
      ascent: font.ascent,
      descent: font.descent,
      isWordSpace: font.isWordSpace({ code, offset: 0, length: codeLength }),
      source: "same-font",
    };
  };
}

/**
 * ページのコンテンツストリームに書き換えを適用した新しいバイト列を作る（文書は変更しない）。
 * すべての置換が有効な場合のみ成功する。
 */
export function rewritePageContent(
  page: PageText,
  replacements: TextReplacement[],
  resolveGlyph: GlyphResolveFn = sameFontResolver(page),
):
  | {
      ok: true;
      content: Uint8Array;
      clipAdjustments: number;
      warnings: RewriteWarning[];
    }
  | { ok: false; failures: RewriteFailure[] } {
  const { planned, failures } = validate(page, replacements, resolveGlyph);
  if (failures.length > 0) {
    return {
      ok: false,
      failures: failures.sort((a, b) => a.replacement - b.replacement),
    };
  }

  const ops = page.content.operations;
  const edits: { start: number; end: number; text: string }[] = [];
  const warnings: RewriteWarning[] = [];
  const clipsAt = activeClipsByOp(ops, page.ctmBeforeOp);
  /** 広げるクリップ（最初のパス命令 index → 元の矩形と新しい矩形）。 */
  const clipGrowth = new Map<
    number,
    { clip: ClipRecord; from: Rect; to: Rect }
  >();

  // 置換を描画命令ごとの部分に分ける
  const byOp = new Map<number, Portion[]>();
  for (const p of planned) {
    let portionStart = p.replacement.start;
    for (let i = p.replacement.start; i <= p.replacement.end; i += 1) {
      const g = page.glyphs[i];
      const startGlyph = page.glyphs[portionStart]!;
      if (
        i === p.replacement.end ||
        g!.source.opIndex !== startGlyph.source.opIndex
      ) {
        const opIndex = startGlyph.source.opIndex;
        const portion: Portion = {
          plan: p,
          opIndex,
          start: portionStart,
          end: i,
          glyphs: page.glyphs.slice(portionStart, i),
          primary: portionStart === p.replacement.start,
        };
        byOp.set(opIndex, [...(byOp.get(opIndex) ?? []), portion]);
        portionStart = i;
      }
    }
  }

  for (const [opIndex, list] of byOp) {
    const op = ops[opIndex]!;
    const font = list[0]!.plan.font;
    const opGlyphs = page.glyphs.filter((g) => g.source.opIndex === opIndex);
    let units = unitsOf(op, font, opGlyphs[0]!.index);

    // 後ろの範囲から置き換えると、前の範囲の単位位置がずれない
    for (const portion of [...list].sort((a, b) => b.start - a.start)) {
      const p = portion.plan;
      const { start, end } = portion;
      const align = portion.primary ? p.replacement.align : "left";
      const resolved = portion.primary ? p.resolved : [];
      const first = portion.glyphs[0]!;
      const from = units.findIndex(
        (u) => u.kind === "glyph" && u.glyphIndex === start,
      );
      const to = units.findIndex(
        (u) => u.kind === "glyph" && u.glyphIndex === end - 1,
      );

      // 旧: 範囲内のグリフの送り＋範囲内の TJ 数値
      let oldSpan = 0;
      for (let k = from; k <= to; k += 1) {
        const u = units[k]!;
        if (u.kind === "glyph") {
          const g = page.glyphs[u.glyphIndex]!;
          oldSpan += textAdvance(
            g.width,
            font.isWordSpace({
              code: g.code,
              offset: 0,
              length: g.source.byteLength,
            }),
            g,
          );
        } else {
          oldSpan += (-u.value / 1000) * first.fontSize * first.horizontalScale;
        }
      }
      // 新: 新しいコードの送り
      const newAdvances = resolved.map((r) =>
        textAdvance(r.width, r.isWordSpace, first),
      );
      const newSpan = newAdvances.reduce((s, a) => s + a, 0);
      const delta = newSpan - oldSpan;
      const toTj = (textUnits: number) =>
        (textUnits * 1000) / (first.fontSize * first.horizontalScale);

      // 揃えの基準は置換範囲全体の幅。命令をまたぐ場合は、先頭の文字の原点から
      // 最後の文字の送り終点までのベースライン方向の距離をテキスト空間の単位に直して使う。
      let wholeDelta = delta;
      if (portion.primary && p.glyphs.length > portion.glyphs.length) {
        const last = p.glyphs[p.glyphs.length - 1]!;
        const [dx, dy] = baselineDirection(first);
        const lastEnd =
          (last.x - first.x) * dx + (last.y - first.y) * dy + last.advance;
        const userPerText =
          Math.hypot(first.matrix[0], first.matrix[1]) /
          (first.fontSize * first.horizontalScale);
        wholeDelta = newSpan - lastEnd / userPerText;
      }
      const shift =
        align === "left" ? 0 : align === "right" ? wholeDelta : wholeDelta / 2;
      const replacementUnits: Unit[] = [];
      if (Math.abs(shift) > EPS)
        replacementUnits.push({ kind: "number", value: toTj(shift) });
      for (const r of resolved) {
        replacementUnits.push({
          kind: "glyph",
          bytes: codeBytes(r.code, r.codeLength),
          glyphIndex: -1,
          resource: r.resource,
        });
      }
      const fallbackChars = [
        ...new Set(
          resolved.filter((r) => r.source === "fallback").map((r) => r.char),
        ),
      ];
      if (fallbackChars.length > 0) {
        warnings.push({
          kind: "fallback-font",
          replacement: p.index,
          chars: fallbackChars,
        });
      }
      const after = delta - shift;
      if (Math.abs(after) > EPS)
        replacementUnits.push({ kind: "number", value: toTj(after) });
      units = [
        ...units.slice(0, from),
        ...replacementUnits,
        ...units.slice(to + 1),
      ];

      // クリップ: 新しいグリフの範囲（ベースライン方向）が元の文字より外へ伸びた分だけ広げる
      const clips = portion.primary ? (clipsAt.get(opIndex) ?? []) : [];
      if (clips.length === 0) continue;
      const trm = first.matrix;
      const em = first.fontSize * first.horizontalScale;
      const newQuads: number[][] = [];
      let offset = -shift;
      resolved.forEach((r, i) => {
        const u = offset / em;
        const w = r.width / 1000;
        const asc = r.ascent / 1000;
        const desc = r.descent / 1000;
        newQuads.push([
          ...transformPoint(trm, u, desc),
          ...transformPoint(trm, u + w, desc),
          ...transformPoint(trm, u + w, asc),
          ...transformPoint(trm, u, asc),
        ]);
        offset += newAdvances[i]!;
      });
      const oldQuads = p.glyphs.map((g) => g.quad);

      for (const clip of clips) {
        const inv = invert(clip.ctm);
        const rect = inv ? clipRect(ops, clip) : null;
        // ベースライン方向（クリップ座標系）
        const dir = inv
          ? [
              trm[0] * inv[0] + trm[1] * inv[2],
              trm[0] * inv[1] + trm[1] * inv[3],
            ]
          : [1, 0];
        const axis: "x" | "y" =
          Math.abs(dir[0]!) >= Math.abs(dir[1]!) ? "x" : "y";
        const extent = (quads: number[][]) => {
          let min = Infinity;
          let max = -Infinity;
          for (const q of quads) {
            for (let k = 0; k < 8; k += 2) {
              const [cx, cy] = inv
                ? transformPoint(inv, q[k]!, q[k + 1]!)
                : [q[k]!, q[k + 1]!];
              const v = axis === "x" ? cx : cy;
              min = Math.min(min, v);
              max = Math.max(max, v);
            }
          }
          return { min, max };
        };
        if (newQuads.length === 0) continue;
        const next = extent(newQuads);
        const prev = extent(oldQuads);
        const key = clip.pathOps[0]!;
        const current =
          clipGrowth.get(key)?.to ?? rect ?? pathBounds(ops, clip);
        const lo = axis === "x" ? "minX" : "minY";
        const hi = axis === "x" ? "maxX" : "maxY";
        const clipMin = current ? current[lo] : -Infinity;
        const clipMax = current ? current[hi] : Infinity;
        const growLow =
          next.min < clipMin - EPS ? Math.max(0, prev.min - next.min) : 0;
        const growHigh =
          next.max > clipMax + EPS ? Math.max(0, next.max - prev.max) : 0;
        if (growLow <= EPS && growHigh <= EPS) continue;
        if (!rect || !current) {
          // 矩形でない（または座標を読めない）クリップは変更しない
          if (
            !warnings.some(
              (w) =>
                w.kind === "clip-not-adjusted" && w.replacement === p.index,
            )
          ) {
            warnings.push({ kind: "clip-not-adjusted", replacement: p.index });
          }
          continue;
        }
        const grown: Rect = { ...current };
        grown[lo] = floor5(current[lo] - growLow);
        grown[hi] = ceil5(current[hi] + growHigh);
        clipGrowth.set(key, { clip, from: rect, to: grown });
      }
    }

    // 命令を書き出す（Tj・'・" は等価な TJ に変換する）
    const body = serializeTextShow(
      units,
      font.resourceName,
      list[0]!.glyphs[0]!.fontSize,
    );
    const numberText = (o: Operand | undefined) =>
      o
        ? new TextDecoder("latin1").decode(
            page.content.bytes.subarray(o.start, o.end),
          )
        : "0";
    let text: string;
    switch (op.operator) {
      case "'":
        text = `T* ${body}`;
        break;
      case '"':
        text = `${numberText(op.operands[0])} Tw ${numberText(op.operands[1])} Tc T* ${body}`;
        break;
      default:
        text = body;
    }
    edits.push({ start: op.start, end: op.end, text });
  }

  for (const { clip, from, to } of clipGrowth.values()) {
    for (const e of rewriteClipPath(ops, clip, from, to)) {
      edits.push({ start: e.op.start, end: e.op.end, text: e.text });
    }
  }

  // 置換の番号順、同じ置換ではクリップ → 同梱フォントの順
  const order = { "clip-not-adjusted": 0, "fallback-font": 1 } as const;
  warnings.sort(
    (a, b) => a.replacement - b.replacement || order[a.kind] - order[b.kind],
  );
  return {
    ok: true,
    content: splice(page.content.bytes, edits),
    clipAdjustments: clipGrowth.size,
    warnings,
  };
}

/** 範囲の重ならない編集をバイト列に適用する。 */
function splice(
  bytes: Uint8Array,
  edits: { start: number; end: number; text: string }[],
): Uint8Array {
  const sorted = [...edits].sort((a, b) => a.start - b.start);
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  let pos = 0;
  for (const e of sorted) {
    parts.push(bytes.subarray(pos, e.start));
    parts.push(encoder.encode(e.text));
    pos = e.end;
  }
  parts.push(bytes.subarray(pos));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/**
 * ページの文字列を書き換える。成功した場合のみ、ページの /Contents を
 * 新しい 1 つのコンテンツストリームに差し替える（共有ストリームは変更しない）。
 * 元のフォントに無い文字は `GlyphResolver` の順で補い、そのための追記（ToUnicode・W・
 * リソース・同梱フォント）も成功した場合にだけ反映する。
 */
export function replacePageText(
  doc: PDFDocument,
  pageIndex: number,
  replacements: TextReplacement[],
  options: GlyphResolverOptions = {},
): RewriteResult {
  const page = extractPageText(doc, pageIndex);
  const resolver = new GlyphResolver(doc, pageIndex, page, options);
  const result = rewritePageContent(page, replacements, (resource, char) =>
    resolver.resolve(resource, char),
  );
  if (!result.ok) return result;
  resolver.commit();
  const ctx = doc.context;
  const stream = ctx.register(ctx.flateStream(result.content));
  doc.getPage(pageIndex).node.set(PDFName.of("Contents"), stream);
  return {
    ok: true,
    clipAdjustments: result.clipAdjustments,
    warnings: result.warnings,
  };
}
