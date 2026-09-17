import { tokenize } from "./lexer";

interface Span {
  start: number;
  end: number;
}

/** 命令の引数。元バイト列上の範囲を持ち、書き換え時に部分置換できる。 */
export type Operand = Span &
  (
    | { kind: "number"; value: number }
    | { kind: "name"; value: string }
    | { kind: "string"; bytes: Uint8Array; hex: boolean }
    | { kind: "boolean"; value: boolean }
    | { kind: "null" }
    | { kind: "array"; items: Operand[] }
    | { kind: "dict"; entries: [string, Operand][] }
  );

/** 1 つの描画命令（引数＋演算子）。 */
export interface ContentOperation extends Span {
  /** ストリーム内での出現順（0 始まり）。 */
  index: number;
  operator: string;
  operands: Operand[];
}

type Container =
  | { kind: "array"; start: number; items: Operand[] }
  | { kind: "dict"; start: number; items: Operand[] };

/** 開いている配列・辞書を閉じて Operand にする。 */
function closeContainer(c: Container, end: number): Operand {
  if (c.kind === "array") {
    return { kind: "array", items: c.items, start: c.start, end };
  }
  // 辞書は「名前, 値」の並び。キーが名前でない組は捨てる
  const entries: [string, Operand][] = [];
  for (let i = 0; i + 1 < c.items.length; i += 2) {
    const key = c.items[i]!;
    if (key.kind === "name") entries.push([key.value, c.items[i + 1]!]);
  }
  return { kind: "dict", entries, start: c.start, end };
}

/**
 * コンテンツストリームを命令列に変換する。
 * 壊れた入力（閉じていない配列など）でも例外にせず、可能な範囲で解釈を続ける。
 */
export function parseOperations(bytes: Uint8Array): ContentOperation[] {
  const ops: ContentOperation[] = [];
  let operands: Operand[] = [];
  const stack: Container[] = [];

  const push = (o: Operand) => {
    const top = stack[stack.length - 1];
    if (top) top.items.push(o);
    else operands.push(o);
  };

  let inlineImageStart = -1;

  for (const t of tokenize(bytes)) {
    // インライン画像: BI 〜 EI は 1 命令（演算子 BI・引数なし）として扱う
    if (inlineImageStart >= 0) {
      if (t.type === "keyword" && t.value === "EI") {
        ops.push({
          index: ops.length,
          operator: "BI",
          operands: [],
          start: inlineImageStart,
          end: t.end,
        });
        inlineImageStart = -1;
      }
      continue;
    }

    switch (t.type) {
      case "number":
        push({ kind: "number", value: t.value, start: t.start, end: t.end });
        break;
      case "name":
        push({ kind: "name", value: t.value, start: t.start, end: t.end });
        break;
      case "string":
        push({
          kind: "string",
          bytes: t.bytes,
          hex: t.hex,
          start: t.start,
          end: t.end,
        });
        break;
      case "arrayStart":
      case "dictStart":
        stack.push({
          kind: t.type === "arrayStart" ? "array" : "dict",
          start: t.start,
          items: [],
        });
        break;
      case "arrayEnd":
      case "dictEnd": {
        const want = t.type === "arrayEnd" ? "array" : "dict";
        if (stack[stack.length - 1]?.kind !== want) break; // 対応しない閉じ括弧は無視
        push(closeContainer(stack.pop()!, t.end));
        break;
      }
      case "inlineImageData":
        break;
      case "keyword": {
        if (t.value === "true" || t.value === "false") {
          push({
            kind: "boolean",
            value: t.value === "true",
            start: t.start,
            end: t.end,
          });
          break;
        }
        if (t.value === "null") {
          push({ kind: "null", start: t.start, end: t.end });
          break;
        }
        // 演算子: 閉じ忘れの配列・辞書はここで閉じる
        while (stack.length > 0) {
          const c = stack.pop()!;
          const closed = closeContainer(c, t.start);
          push(closed);
        }
        if (t.value === "BI") {
          inlineImageStart = operands[0]?.start ?? t.start;
          operands = [];
          break;
        }
        ops.push({
          index: ops.length,
          operator: t.value,
          operands,
          start: operands[0]?.start ?? t.start,
          end: t.end,
        });
        operands = [];
        break;
      }
    }
  }
  return ops;
}
