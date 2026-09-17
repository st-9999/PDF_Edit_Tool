/**
 * PDF コンテンツストリーム（ページの描画命令）の字句解析。
 *
 * テキスト書き換えでは元のバイト列の一部だけを差し替えるため、各トークンは
 * 元バイト列上の範囲（`start` 以上 `end` 未満）を持つ。
 * 仕様: ISO 32000-1 7.2（字句規則）/ 7.8.2（コンテンツストリーム）/ 8.9.7（インライン画像）。
 */

interface Span {
  /** 元バイト列上の開始位置。 */
  start: number;
  /** 元バイト列上の終了位置（この位置は含まない）。 */
  end: number;
}

export type Token = Span &
  (
    | { type: "number"; value: number }
    | { type: "name"; value: string }
    | { type: "string"; bytes: Uint8Array; hex: boolean }
    | { type: "keyword"; value: string }
    | { type: "arrayStart" }
    | { type: "arrayEnd" }
    | { type: "dictStart" }
    | { type: "dictEnd" }
    /** インライン画像（`ID` 〜 `EI`）の生データ。 */
    | { type: "inlineImageData" }
  );

const LF = 0x0a;
const CR = 0x0d;
const PERCENT = 0x25;
const LPAREN = 0x28;
const RPAREN = 0x29;
const LT = 0x3c;
const GT = 0x3e;
const LBRACKET = 0x5b;
const RBRACKET = 0x5d;
const LBRACE = 0x7b;
const RBRACE = 0x7d;
const SLASH = 0x2f;
const BACKSLASH = 0x5c;
const HASH = 0x23;

export function isWhitespace(b: number): boolean {
  return (
    b === 0x20 || b === LF || b === CR || b === 0x09 || b === 0x0c || b === 0x00
  );
}

function isDelimiter(b: number): boolean {
  return (
    b === LPAREN ||
    b === RPAREN ||
    b === LT ||
    b === GT ||
    b === LBRACKET ||
    b === RBRACKET ||
    b === LBRACE ||
    b === RBRACE ||
    b === SLASH ||
    b === PERCENT
  );
}

function isRegular(b: number): boolean {
  return !isWhitespace(b) && !isDelimiter(b);
}

function hexValue(b: number): number {
  if (b >= 0x30 && b <= 0x39) return b - 0x30;
  if (b >= 0x41 && b <= 0x46) return b - 0x41 + 10;
  if (b >= 0x61 && b <= 0x66) return b - 0x61 + 10;
  return -1;
}

const NUMBER_RE = /^[+-]?(\d+\.?\d*|\.\d+)$/;

function ascii(bytes: Uint8Array, start: number, end: number): string {
  let s = "";
  for (let i = start; i < end; i += 1) s += String.fromCharCode(bytes[i]!);
  return s;
}

/** リテラル文字列 `( … )` を読む。`pos` は `(` の位置。 */
function readLiteralString(
  bytes: Uint8Array,
  pos: number,
): { value: Uint8Array; end: number } {
  const out: number[] = [];
  let depth = 1;
  let i = pos + 1;
  while (i < bytes.length) {
    const b = bytes[i]!;
    if (b === BACKSLASH) {
      i += 1;
      if (i >= bytes.length) break;
      const e = bytes[i]!;
      if (e >= 0x30 && e <= 0x37) {
        // 最大 3 桁の 8 進数
        let v = 0;
        let n = 0;
        while (
          n < 3 &&
          i < bytes.length &&
          bytes[i]! >= 0x30 &&
          bytes[i]! <= 0x37
        ) {
          v = v * 8 + (bytes[i]! - 0x30);
          i += 1;
          n += 1;
        }
        out.push(v & 0xff);
        continue;
      }
      i += 1;
      switch (e) {
        case 0x6e: // \n
          out.push(LF);
          break;
        case 0x72: // \r
          out.push(CR);
          break;
        case 0x74: // \t
          out.push(0x09);
          break;
        case 0x62: // \b
          out.push(0x08);
          break;
        case 0x66: // \f
          out.push(0x0c);
          break;
        case CR:
          // 行継続（\CR または \CRLF）
          if (bytes[i] === LF) i += 1;
          break;
        case LF:
          break;
        default:
          // \( \) \\ および未知のエスケープは文字そのもの
          out.push(e);
      }
      continue;
    }
    if (b === LPAREN) depth += 1;
    if (b === RPAREN) {
      depth -= 1;
      if (depth === 0) return { value: Uint8Array.from(out), end: i + 1 };
    }
    out.push(b);
    i += 1;
  }
  return { value: Uint8Array.from(out), end: bytes.length };
}

/** 16 進文字列 `< … >` を読む。`pos` は `<` の位置。 */
function readHexString(
  bytes: Uint8Array,
  pos: number,
): { value: Uint8Array; end: number } {
  const out: number[] = [];
  let high = -1;
  let i = pos + 1;
  for (; i < bytes.length; i += 1) {
    const b = bytes[i]!;
    if (b === GT) {
      i += 1;
      break;
    }
    const v = hexValue(b);
    if (v < 0) continue; // 空白などは無視
    if (high < 0) {
      high = v;
    } else {
      out.push((high << 4) | v);
      high = -1;
    }
  }
  if (high >= 0) out.push(high << 4); // 奇数桁は末尾を 0 で補う
  return { value: Uint8Array.from(out), end: i };
}

/**
 * インライン画像データの終端を探す。`ID` の直後の空白 1 バイトの次から走査し、
 * 「空白＋`EI`＋空白（または末尾）」の `EI` の位置を返す。
 */
function findInlineImageEnd(bytes: Uint8Array, dataStart: number): number {
  for (let i = dataStart; i + 1 < bytes.length; i += 1) {
    if (
      bytes[i] === 0x45 &&
      bytes[i + 1] === 0x49 &&
      (i === dataStart || isWhitespace(bytes[i - 1]!)) &&
      (i + 2 >= bytes.length || isWhitespace(bytes[i + 2]!))
    ) {
      return i;
    }
  }
  return bytes.length;
}

/** コンテンツストリームのバイト列をトークン列にする。 */
export function* tokenize(bytes: Uint8Array): Generator<Token> {
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i]!;
    if (isWhitespace(b)) {
      i += 1;
      continue;
    }
    const start = i;

    if (b === PERCENT) {
      while (i < bytes.length && bytes[i] !== LF && bytes[i] !== CR) i += 1;
      continue;
    }
    if (b === LPAREN) {
      const { value, end } = readLiteralString(bytes, i);
      i = end;
      yield { type: "string", bytes: value, hex: false, start, end };
      continue;
    }
    if (b === LT) {
      if (bytes[i + 1] === LT) {
        i += 2;
        yield { type: "dictStart", start, end: i };
        continue;
      }
      const { value, end } = readHexString(bytes, i);
      i = end;
      yield { type: "string", bytes: value, hex: true, start, end };
      continue;
    }
    if (b === GT) {
      i += bytes[i + 1] === GT ? 2 : 1;
      yield { type: "dictEnd", start, end: i };
      continue;
    }
    if (b === LBRACKET || b === RBRACKET) {
      i += 1;
      yield { type: b === LBRACKET ? "arrayStart" : "arrayEnd", start, end: i };
      continue;
    }
    if (b === LBRACE || b === RBRACE || b === RPAREN) {
      // コンテンツストリームでは現れない区切り文字。読み飛ばす
      i += 1;
      continue;
    }
    if (b === SLASH) {
      i += 1;
      let name = "";
      while (i < bytes.length && isRegular(bytes[i]!)) {
        const c = bytes[i]!;
        if (c === HASH && i + 2 < bytes.length) {
          const h = hexValue(bytes[i + 1]!);
          const l = hexValue(bytes[i + 2]!);
          if (h >= 0 && l >= 0) {
            name += String.fromCharCode((h << 4) | l);
            i += 3;
            continue;
          }
        }
        name += String.fromCharCode(c);
        i += 1;
      }
      yield { type: "name", value: name, start, end: i };
      continue;
    }

    while (i < bytes.length && isRegular(bytes[i]!)) i += 1;
    const word = ascii(bytes, start, i);
    if (NUMBER_RE.test(word)) {
      yield { type: "number", value: Number(word), start, end: i };
      continue;
    }
    yield { type: "keyword", value: word, start, end: i };

    if (word === "ID") {
      // ID の直後の空白 1 バイトを区切りとして読み飛ばし、EI までを生データとする
      const dataStart = isWhitespace(bytes[i] ?? 0) ? i + 1 : i;
      const eiAt = findInlineImageEnd(bytes, dataStart);
      yield { type: "inlineImageData", start: dataStart, end: eiAt };
      i = eiAt;
    }
  }
}
