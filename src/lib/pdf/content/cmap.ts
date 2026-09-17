import { tokenize, type Token } from "./lexer";

/** ToUnicode CMap（文字コード → Unicode 文字列）の対応表。 */
export interface ToUnicodeCMap {
  /** 対応する文字列（未定義なら null）。 */
  lookup(code: number): string | null;
  /** その文字列に対応するコード（定義順）。書き換え時の逆引きに使う。 */
  codesFor(text: string): number[];
  /** コード空間に現れるコードのバイト長（昇順・重複なし）。 */
  readonly codeLengths: number[];
  /** 定義済みのコードと文字列の組。 */
  entries(): IterableIterator<[number, string]>;
}

function bytesToNumber(bytes: Uint8Array): number {
  let v = 0;
  for (const b of bytes) v = v * 256 + b;
  return v;
}

/** UTF-16BE のバイト列を文字列にする（サロゲートペア対応）。 */
function utf16be(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    s += String.fromCharCode((bytes[i]! << 8) | bytes[i + 1]!);
  }
  if (bytes.length % 2 === 1)
    s += String.fromCharCode(bytes[bytes.length - 1]!);
  return s;
}

/** bfrange の開始値を `offset` だけ進める（末尾バイトに加算。仕様 9.10.3）。 */
function incrementLastByte(bytes: Uint8Array, offset: number): Uint8Array {
  const out = Uint8Array.from(bytes);
  if (out.length === 0) return out;
  let carry = offset;
  for (let i = out.length - 1; i >= 0 && carry > 0; i -= 1) {
    const sum = out[i]! + carry;
    out[i] = sum & 0xff;
    carry = Math.floor(sum / 256);
  }
  return out;
}

function isKeyword(t: Token | undefined, value: string): boolean {
  return t?.type === "keyword" && t.value === value;
}

/** ToUnicode CMap ストリーム（復号済み）を解析する。 */
export function parseToUnicodeCMap(bytes: Uint8Array): ToUnicodeCMap {
  const tokens = [...tokenize(bytes)];
  const map = new Map<number, string>();
  const lengths = new Set<number>();

  const define = (code: number, text: string) => {
    if (!map.has(code)) map.set(code, text);
  };

  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i]!;
    if (t.type !== "keyword") continue;

    if (t.value === "begincodespacerange") {
      for (
        i += 1;
        i < tokens.length && !isKeyword(tokens[i], "endcodespacerange");
        i += 1
      ) {
        const tok = tokens[i]!;
        if (tok.type === "string") lengths.add(tok.bytes.length);
      }
      continue;
    }

    if (t.value === "beginbfchar") {
      const body: Token[] = [];
      for (
        i += 1;
        i < tokens.length && !isKeyword(tokens[i], "endbfchar");
        i += 1
      ) {
        body.push(tokens[i]!);
      }
      for (let k = 0; k + 1 < body.length; k += 2) {
        const src = body[k]!;
        const dst = body[k + 1]!;
        if (src.type !== "string" || dst.type !== "string") break;
        define(bytesToNumber(src.bytes), utf16be(dst.bytes));
      }
      continue;
    }

    if (t.value === "beginbfrange") {
      for (i += 1; i < tokens.length && !isKeyword(tokens[i], "endbfrange"); ) {
        const lo = tokens[i];
        const hi = tokens[i + 1];
        const dst = tokens[i + 2];
        if (lo?.type !== "string" || hi?.type !== "string" || !dst) break;
        const low = bytesToNumber(lo.bytes);
        const high = bytesToNumber(hi.bytes);
        if (dst.type === "string") {
          for (let c = low; c <= high; c += 1) {
            define(c, utf16be(incrementLastByte(dst.bytes, c - low)));
          }
          i += 3;
          continue;
        }
        if (dst.type === "arrayStart") {
          let k = i + 3;
          let c = low;
          while (k < tokens.length && tokens[k]!.type !== "arrayEnd") {
            const item = tokens[k]!;
            if (item.type === "string" && c <= high)
              define(c, utf16be(item.bytes));
            c += 1;
            k += 1;
          }
          i = k + 1;
          continue;
        }
        break;
      }
    }
  }

  // 逆引き表（文字列 → 定義順のコード）
  const reverse = new Map<string, number[]>();
  for (const [code, text] of map) {
    const list = reverse.get(text);
    if (list) list.push(code);
    else reverse.set(text, [code]);
  }

  return {
    lookup: (code) => map.get(code) ?? null,
    codesFor: (text) => [...(reverse.get(text) ?? [])],
    codeLengths: [...lengths].sort((a, b) => a - b),
    entries: () => map.entries(),
  };
}
