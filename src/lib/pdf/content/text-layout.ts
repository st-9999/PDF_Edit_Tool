import type { FontModel, FontUnsupportedReason } from "./font";
import type { ContentOperation, Operand } from "./operations";

/** PDF の行列 [a b c d e f]（点 p は p × M で変換する）。 */
export type Matrix = [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** m1 × m2（先に m1、次に m2 を適用する変換）。 */
export function multiply(m1: Matrix, m2: Matrix): Matrix {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a1 * a2 + b1 * c2,
    a1 * b2 + b1 * d2,
    c1 * a2 + d1 * c2,
    c1 * b2 + d1 * d2,
    e1 * a2 + f1 * c2 + e2,
    e1 * b2 + f1 * d2 + f2,
  ];
}

export function transformPoint(
  m: Matrix,
  x: number,
  y: number,
): [number, number] {
  return [x * m[0] + y * m[2] + m[4], x * m[1] + y * m[3] + m[5]];
}

/** 描画命令上で、グリフのコードが置かれている場所。 */
export interface GlyphSource {
  /** 命令の index。 */
  opIndex: number;
  /** 文字列を持つ引数の番号（Tj・TJ・' は 0、" は 2）。 */
  operandIndex: number;
  /** TJ 配列内の要素番号（TJ 以外は -1）。 */
  itemIndex: number;
  /** 文字列（復号後のバイト列）内でのコードの位置。 */
  byteOffset: number;
  byteLength: number;
}

export interface PageGlyph {
  /** ページ内での出現順。 */
  index: number;
  /** 文字（ToUnicode 等で特定できなければ null）。 */
  text: string | null;
  code: number;
  fontResource: string;
  fontSize: number;
  /** グリフ空間での送り幅（1/1000 em）。 */
  width: number;
  /** ユーザー空間（ページの /Rotate 適用前の PDF 座標）での原点。 */
  x: number;
  y: number;
  /** ユーザー空間での送り幅（Tc・Tw・Tz を含む。次のグリフの原点までの距離）。 */
  advance: number;
  /** ユーザー空間でのグリフ本体の幅（Tc・Tw を除く。見た目の右端までの距離）。 */
  glyphWidth: number;
  /** グリフ空間 → ユーザー空間の変換（テキストレンダリング行列 × CTM）。 */
  matrix: Matrix;
  /** 四隅 [左下x, 左下y, 右下x, 右下y, 右上x, 右上y, 左上x, 左上y]（ユーザー空間）。 */
  quad: number[];
  /** 描画時のテキスト状態: 文字間隔 Tc・単語間隔 Tw（テキスト空間の単位）・水平倍率（Tz / 100）。 */
  charSpacing: number;
  wordSpacing: number;
  horizontalScale: number;
  /** BT 〜 ET の出現順。 */
  textObject: number;
  renderMode: number;
  source: GlyphSource;
  unsupported: FontUnsupportedReason | null;
}

export interface TextLayout {
  glyphs: PageGlyph[];
  /** Tf で指定されたがリソースに無かったフォント名。 */
  missingFonts: string[];
  /** Do で呼び出された XObject 名（Form XObject 内の文字は解釈しない）。 */
  xObjects: string[];
  /** 各命令（index）の実行直前の CTM。クリップ矩形の座標系を求めるのに使う。 */
  ctmBeforeOp: Matrix[];
}

interface GraphicsState {
  ctm: Matrix;
  font: FontModel | null;
  fontSize: number;
  charSpacing: number;
  wordSpacing: number;
  /** Tz / 100 */
  horizontalScale: number;
  leading: number;
  rise: number;
  renderMode: number;
}

function num(o: Operand | undefined): number {
  return o?.kind === "number" ? o.value : 0;
}

/**
 * コンテンツストリームの命令列を解釈し、グリフ単位の文字・位置・元データ上の位置を求める。
 * 仕様: ISO 32000-1 8.4（グラフィックス状態）/ 9.3（テキスト状態）/ 9.4（テキストオブジェクト）。
 */
export function layoutText(
  ops: ContentOperation[],
  fontFor: (resourceName: string) => FontModel | null,
  initialCtm: Matrix = IDENTITY,
): TextLayout {
  const glyphs: PageGlyph[] = [];
  const missingFonts = new Set<string>();
  const xObjects: string[] = [];
  const ctmBeforeOp: Matrix[] = [];

  let gs: GraphicsState = {
    ctm: initialCtm,
    font: null,
    fontSize: 0,
    charSpacing: 0,
    wordSpacing: 0,
    horizontalScale: 1,
    leading: 0,
    rise: 0,
    renderMode: 0,
  };
  const stack: GraphicsState[] = [];
  let tm: Matrix = IDENTITY;
  let tlm: Matrix = IDENTITY;
  let textObject = -1;

  const moveLine = (tx: number, ty: number) => {
    tlm = multiply([1, 0, 0, 1, tx, ty], tlm);
    tm = tlm;
  };

  const showString = (
    op: ContentOperation,
    operandIndex: number,
    itemIndex: number,
    str: Operand,
  ) => {
    if (str.kind !== "string") return;
    const font = gs.font;
    if (!font) return;
    const fs = gs.fontSize;
    const th = gs.horizontalScale;
    for (const c of font.splitCodes(str.bytes)) {
      const w0 = font.width(c.code);
      const trm = multiply(
        multiply([fs * th, 0, 0, fs, 0, gs.rise], tm),
        gs.ctm,
      );
      const tx =
        ((w0 / 1000) * fs +
          gs.charSpacing +
          (font.isWordSpace(c) ? gs.wordSpacing : 0)) *
        th;
      // ユーザー空間での送り（テキスト空間の (tx, 0) を Tm × CTM で変換した長さ）
      const lin = multiply(tm, gs.ctm);
      const scale = Math.hypot(lin[0], lin[1]);
      const advance = Math.abs(tx) * scale;
      const glyphWidth = Math.abs((w0 / 1000) * fs * th) * scale;

      const [x, y] = transformPoint(trm, 0, 0);
      // 四隅: trm は 1 em 単位の座標を変換するため、グリフ幅（Tc 等を除く）とアセント・ディセントを em で与える
      const w = w0 / 1000;
      const asc = font.ascent / 1000;
      const desc = font.descent / 1000;
      const quad = [
        ...transformPoint(trm, 0, desc),
        ...transformPoint(trm, w, desc),
        ...transformPoint(trm, w, asc),
        ...transformPoint(trm, 0, asc),
      ];

      glyphs.push({
        index: glyphs.length,
        text: font.unicode(c.code),
        code: c.code,
        fontResource: font.resourceName,
        fontSize: fs,
        width: w0,
        x,
        y,
        advance,
        glyphWidth,
        matrix: trm,
        quad,
        charSpacing: gs.charSpacing,
        wordSpacing: gs.wordSpacing,
        horizontalScale: th,
        textObject,
        renderMode: gs.renderMode,
        source: {
          opIndex: op.index,
          operandIndex,
          itemIndex,
          byteOffset: c.offset,
          byteLength: c.length,
        },
        unsupported: font.unsupportedReason,
      });
      tm = multiply([1, 0, 0, 1, tx, 0], tm);
    }
  };

  for (const op of ops) {
    ctmBeforeOp[op.index] = gs.ctm;
    const a = op.operands;
    switch (op.operator) {
      case "q":
        stack.push({ ...gs });
        break;
      case "Q":
        gs = stack.pop() ?? gs;
        break;
      case "cm":
        gs = {
          ...gs,
          ctm: multiply(
            [num(a[0]), num(a[1]), num(a[2]), num(a[3]), num(a[4]), num(a[5])],
            gs.ctm,
          ),
        };
        break;
      case "BT":
        tm = IDENTITY;
        tlm = IDENTITY;
        textObject += 1;
        break;
      case "ET":
        break;
      case "Tf": {
        const name = a[0]?.kind === "name" ? a[0].value : "";
        const font = fontFor(name);
        if (!font) missingFonts.add(name);
        gs = { ...gs, font, fontSize: num(a[1]) };
        break;
      }
      case "Tc":
        gs = { ...gs, charSpacing: num(a[0]) };
        break;
      case "Tw":
        gs = { ...gs, wordSpacing: num(a[0]) };
        break;
      case "Tz":
        gs = { ...gs, horizontalScale: num(a[0]) / 100 };
        break;
      case "TL":
        gs = { ...gs, leading: num(a[0]) };
        break;
      case "Ts":
        gs = { ...gs, rise: num(a[0]) };
        break;
      case "Tr":
        gs = { ...gs, renderMode: num(a[0]) };
        break;
      case "Tm":
        tlm = [
          num(a[0]),
          num(a[1]),
          num(a[2]),
          num(a[3]),
          num(a[4]),
          num(a[5]),
        ];
        tm = tlm;
        break;
      case "Td":
        moveLine(num(a[0]), num(a[1]));
        break;
      case "TD":
        gs = { ...gs, leading: -num(a[1]) };
        moveLine(num(a[0]), num(a[1]));
        break;
      case "T*":
        moveLine(0, -gs.leading);
        break;
      case "Tj":
        if (a[0]) showString(op, 0, -1, a[0]);
        break;
      case "'":
        moveLine(0, -gs.leading);
        if (a[0]) showString(op, 0, -1, a[0]);
        break;
      case '"':
        gs = { ...gs, wordSpacing: num(a[0]), charSpacing: num(a[1]) };
        moveLine(0, -gs.leading);
        if (a[2]) showString(op, 2, -1, a[2]);
        break;
      case "TJ": {
        const arr = a[0];
        if (arr?.kind !== "array") break;
        arr.items.forEach((item, i) => {
          if (item.kind === "number") {
            const tx = (-item.value / 1000) * gs.fontSize * gs.horizontalScale;
            tm = multiply([1, 0, 0, 1, tx, 0], tm);
          } else {
            showString(op, 0, i, item);
          }
        });
        break;
      }
      case "Do":
        if (a[0]?.kind === "name") xObjects.push(a[0].value);
        break;
    }
  }

  return { glyphs, missingFonts: [...missingFonts], xObjects, ctmBeforeOp };
}
