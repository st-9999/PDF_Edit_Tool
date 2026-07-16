/**
 * PDF の間接オブジェクトを走査する最小トークナイザ。
 *
 * pdf-lib の内部 API に依存せず、以下だけを行う:
 *  - `N G obj` 〜 `endobj` の位置特定
 *  - ストリーム本体（`stream` 〜 `endstream`）の範囲特定
 *
 * 辞書の意味解釈（/Type や /Length の読み取り）は pdf-lib のパーサに任せる。
 * ここが担うのは「どこからどこまでが 1 オブジェクトか」の判定のみ。
 */

const enum Byte {
  LF = 0x0a,
  CR = 0x0d,
  SPACE = 0x20,
  TAB = 0x09,
  FF = 0x0c,
  NUL = 0x00,
  PERCENT = 0x25,
  LPAREN = 0x28,
  RPAREN = 0x29,
  LT = 0x3c,
  GT = 0x3e,
  LBRACKET = 0x5b,
  RBRACKET = 0x5d,
  SLASH = 0x2f,
  BACKSLASH = 0x5c,
}

function isWhitespace(b: number): boolean {
  return (
    b === Byte.SPACE ||
    b === Byte.LF ||
    b === Byte.CR ||
    b === Byte.TAB ||
    b === Byte.FF ||
    b === Byte.NUL
  );
}

function isDigit(b: number): boolean {
  return b >= 0x30 && b <= 0x39;
}

function isRegular(b: number): boolean {
  // 区切り文字・空白以外はレギュラー文字（名前や数値・キーワードを構成する）
  if (isWhitespace(b)) return false;
  return !(
    b === Byte.LPAREN ||
    b === Byte.RPAREN ||
    b === Byte.LT ||
    b === Byte.GT ||
    b === Byte.LBRACKET ||
    b === Byte.RBRACKET ||
    b === 0x7b ||
    b === 0x7d ||
    b === Byte.SLASH ||
    b === Byte.PERCENT
  );
}

/** 指定位置に ASCII キーワードが存在するか。 */
export function matchesAt(
  bytes: Uint8Array,
  pos: number,
  keyword: string,
): boolean {
  if (pos + keyword.length > bytes.length) return false;
  for (let i = 0; i < keyword.length; i += 1) {
    if (bytes[pos + i] !== keyword.charCodeAt(i)) return false;
  }
  return true;
}

/** `bytes` 内の `keyword` の次の出現位置（見つからなければ -1）。 */
export function indexOfKeyword(
  bytes: Uint8Array,
  keyword: string,
  from: number,
): number {
  const first = keyword.charCodeAt(0);
  for (let i = from; i <= bytes.length - keyword.length; i += 1) {
    if (bytes[i] === first && matchesAt(bytes, i, keyword)) return i;
  }
  return -1;
}

export interface ScannedObject {
  num: number;
  gen: number;
  /** `obj` キーワード直後（＝オブジェクト本体の開始）。 */
  bodyStart: number;
  /** 本体（辞書や値）の終端。ストリームがある場合は `stream` キーワードの手前。 */
  bodyEnd: number;
  /** ストリームデータの範囲（無ければ null）。 */
  stream: { start: number; end: number } | null;
  /** `endobj` の直後。 */
  end: number;
}

/**
 * 本体の終端（`stream` または `endobj` の直前）まで走査する。
 * 文字列・16進文字列・コメントは中身を解釈せずまとめて読み飛ばすため、
 * その内部に現れる `endobj` 等のバイト列に誤反応しない。
 */
function scanBody(
  bytes: Uint8Array,
  start: number,
): { bodyEnd: number; streamKeyword: number | null; endobj: number | null } {
  let pos = start;
  let depth = 0; // << >> と [ ] のネスト深さ

  while (pos < bytes.length) {
    const b = bytes[pos];

    if (isWhitespace(b)) {
      pos += 1;
      continue;
    }

    // コメント: 行末まで
    if (b === Byte.PERCENT) {
      while (
        pos < bytes.length &&
        bytes[pos] !== Byte.LF &&
        bytes[pos] !== Byte.CR
      ) {
        pos += 1;
      }
      continue;
    }

    // リテラル文字列: () のネストと \ エスケープを考慮
    if (b === Byte.LPAREN) {
      pos += 1;
      let nest = 1;
      while (pos < bytes.length && nest > 0) {
        const c = bytes[pos];
        if (c === Byte.BACKSLASH) {
          pos += 2;
          continue;
        }
        if (c === Byte.LPAREN) nest += 1;
        else if (c === Byte.RPAREN) nest -= 1;
        pos += 1;
      }
      continue;
    }

    if (b === Byte.LT) {
      if (bytes[pos + 1] === Byte.LT) {
        depth += 1;
        pos += 2;
        continue;
      }
      // 16進文字列
      pos += 1;
      while (pos < bytes.length && bytes[pos] !== Byte.GT) pos += 1;
      pos += 1;
      continue;
    }

    if (b === Byte.GT && bytes[pos + 1] === Byte.GT) {
      depth -= 1;
      pos += 2;
      continue;
    }

    if (b === Byte.LBRACKET) {
      depth += 1;
      pos += 1;
      continue;
    }
    if (b === Byte.RBRACKET) {
      depth -= 1;
      pos += 1;
      continue;
    }

    // 名前
    if (b === Byte.SLASH) {
      pos += 1;
      while (pos < bytes.length && isRegular(bytes[pos])) pos += 1;
      continue;
    }

    // キーワード・数値
    if (isRegular(b)) {
      const tokenStart = pos;
      while (pos < bytes.length && isRegular(bytes[pos])) pos += 1;
      if (depth === 0) {
        if (matchesAt(bytes, tokenStart, "stream") && pos - tokenStart === 6) {
          return {
            bodyEnd: tokenStart,
            streamKeyword: tokenStart,
            endobj: null,
          };
        }
        if (matchesAt(bytes, tokenStart, "endobj") && pos - tokenStart === 6) {
          return {
            bodyEnd: tokenStart,
            streamKeyword: null,
            endobj: tokenStart,
          };
        }
      }
      continue;
    }

    pos += 1;
  }
  return { bodyEnd: bytes.length, streamKeyword: null, endobj: null };
}

/**
 * `stream` キーワード直後のデータ開始位置を返す。
 * 仕様上 `stream` の後は CRLF か LF（CR 単独は不可）。
 */
function streamDataStart(bytes: Uint8Array, streamKeyword: number): number {
  const pos = streamKeyword + "stream".length;
  if (bytes[pos] === Byte.CR && bytes[pos + 1] === Byte.LF) return pos + 2;
  if (bytes[pos] === Byte.LF) return pos + 1;
  // 仕様外だが実在するため許容する
  if (bytes[pos] === Byte.CR) return pos + 1;
  return pos;
}

/**
 * ストリームの終端を決める。
 * `declaredLength` が妥当（その位置の直後に `endstream` が続く）ならそれを使い、
 * そうでなければ `endstream` を走査して求める（/Length が間接参照や誤りの場合の保険）。
 */
function resolveStreamEnd(
  bytes: Uint8Array,
  dataStart: number,
  declaredLength: number | null,
): number {
  if (declaredLength !== null && declaredLength >= 0) {
    const candidate = dataStart + declaredLength;
    if (candidate <= bytes.length) {
      let probe = candidate;
      while (probe < bytes.length && isWhitespace(bytes[probe])) probe += 1;
      if (matchesAt(bytes, probe, "endstream")) return candidate;
    }
  }
  const found = indexOfKeyword(bytes, "endstream", dataStart);
  if (found < 0) return bytes.length;
  // endstream 直前の EOL はデータに含めない
  let end = found;
  if (end > dataStart && bytes[end - 1] === Byte.LF) end -= 1;
  if (end > dataStart && bytes[end - 1] === Byte.CR) end -= 1;
  return end;
}

/**
 * `N G obj` のヘッダを見つけて全オブジェクトを走査する。
 * `lengthOf` は辞書から /Length を取り出すコールバック（呼び出し側が pdf-lib で解決する）。
 */
export function scanObjects(
  bytes: Uint8Array,
  lengthOf: (bodyStart: number, bodyEnd: number) => number | null,
): ScannedObject[] {
  const objects: ScannedObject[] = [];
  let pos = 0;

  while (pos < bytes.length - 3) {
    // "obj" を探し、直前に "N G " があるか確認する
    const objAt = indexOfKeyword(bytes, "obj", pos);
    if (objAt < 0) break;

    // 直後がレギュラー文字なら "object" 等の別語
    if (isRegular(bytes[objAt + 3])) {
      pos = objAt + 3;
      continue;
    }

    let cursor = objAt - 1;
    while (cursor >= 0 && isWhitespace(bytes[cursor])) cursor -= 1;
    const genEnd = cursor + 1;
    while (cursor >= 0 && isDigit(bytes[cursor])) cursor -= 1;
    const genStart = cursor + 1;
    if (genStart === genEnd) {
      pos = objAt + 3;
      continue;
    }

    while (cursor >= 0 && isWhitespace(bytes[cursor])) cursor -= 1;
    const numEnd = cursor + 1;
    if (numEnd === genStart) {
      pos = objAt + 3;
      continue;
    }
    while (cursor >= 0 && isDigit(bytes[cursor])) cursor -= 1;
    const numStart = cursor + 1;
    if (numStart === numEnd) {
      pos = objAt + 3;
      continue;
    }

    const decoder = new TextDecoder("latin1");
    const num = Number.parseInt(
      decoder.decode(bytes.subarray(numStart, numEnd)),
      10,
    );
    const gen = Number.parseInt(
      decoder.decode(bytes.subarray(genStart, genEnd)),
      10,
    );
    if (!Number.isFinite(num) || !Number.isFinite(gen)) {
      pos = objAt + 3;
      continue;
    }

    const bodyStart = objAt + 3;
    const scanned = scanBody(bytes, bodyStart);

    let stream: { start: number; end: number } | null = null;
    let end: number;

    if (scanned.streamKeyword !== null) {
      const dataStart = streamDataStart(bytes, scanned.streamKeyword);
      const declared = lengthOf(bodyStart, scanned.bodyEnd);
      const dataEnd = resolveStreamEnd(bytes, dataStart, declared);
      stream = { start: dataStart, end: dataEnd };
      const endstream = indexOfKeyword(bytes, "endstream", dataEnd);
      const endobj = indexOfKeyword(
        bytes,
        "endobj",
        endstream < 0 ? dataEnd : endstream,
      );
      end = endobj < 0 ? bytes.length : endobj + "endobj".length;
    } else if (scanned.endobj !== null) {
      end = scanned.endobj + "endobj".length;
    } else {
      end = bytes.length;
    }

    objects.push({
      num,
      gen,
      bodyStart,
      bodyEnd: scanned.bodyEnd,
      stream,
      end,
    });
    pos = end;
  }

  return objects;
}
