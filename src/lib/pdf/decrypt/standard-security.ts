/**
 * PDF 標準セキュリティハンドラ（ISO 32000-1 7.6.3 / ISO 32000-2）の鍵導出と復号。
 *
 * 対応範囲:
 *  - V1/V2（RC4 40〜128bit）
 *  - V4（`/CFM /V2` = RC4、`/CFM /AESV2` = AES-128）
 *  - V5・R5/R6（`/CFM /AESV3` = AES-256）
 *
 * 空のユーザーパスワードで開ける文書のみを対象とする（Illustrator/Acrobat の
 * 「編集を制限」など、閲覧は自由だが権限フラグが立っている PDF が該当）。
 * 開くのに実パスワードが要る文書は `PdfPasswordRequiredError` を投げる。
 */
import { md5 } from "./md5";
import { rc4 } from "./rc4";
import {
  aesCbcDecryptNoPad,
  aesCbcEncryptNoPad,
  aesDecryptPdfData,
} from "./aes";

/** 暗号フィルタ方式（`/CF` の `/CFM`）。 */
export type Cfm = "V2" | "AESV2" | "AESV3" | "Identity";

export interface EncryptParams {
  v: number;
  r: number;
  /** 鍵長（bit）。 */
  lengthBits: number;
  o: Uint8Array;
  u: Uint8Array;
  /** V5 のみ。ファイル鍵を包んだ 32 バイト。 */
  ue: Uint8Array | null;
  p: number;
  encryptMetadata: boolean;
  /** ストリーム用フィルタ。 */
  stmF: Cfm;
  /** 文字列用フィルタ。 */
  strF: Cfm;
}

/** 閲覧に実パスワードが必要な PDF。 */
export class PdfPasswordRequiredError extends Error {
  constructor() {
    super("このPDFはパスワードで保護されているため開けません");
    this.name = "PdfPasswordRequiredError";
  }
}

/** 未対応の暗号化方式。 */
export class PdfUnsupportedEncryptionError extends Error {
  constructor(detail: string) {
    super(`未対応の暗号化方式です: ${detail}`);
    this.name = "PdfUnsupportedEncryptionError";
  }
}

/** ISO 32000-1 Table 20 のパディング文字列。 */
const PAD = new Uint8Array([
  0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56, 0xff,
  0xfa, 0x01, 0x08, 0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80, 0x2f, 0x0c,
  0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a,
]);

/** AES 用の per-object 鍵に付ける固定バイト "sAlT"。 */
const AES_SALT = new Uint8Array([0x73, 0x41, 0x6c, 0x54]);

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function equals(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

/** 符号付き 32bit をリトルエンディアン 4 バイトへ。 */
function int32le(value: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setInt32(0, value | 0, true);
  return out;
}

async function sha(
  algorithm: "SHA-256" | "SHA-384" | "SHA-512",
  data: Uint8Array,
): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest(algorithm, data as BufferSource);
  return new Uint8Array(digest);
}

/**
 * Algorithm 2: R2〜R4 のファイル暗号鍵を空ユーザーパスワードから導出する。
 */
function computeLegacyKey(params: EncryptParams, id0: Uint8Array): Uint8Array {
  const n =
    params.r === 2
      ? 5
      : Math.min(16, Math.max(5, Math.floor(params.lengthBits / 8)));

  // R4 かつ /EncryptMetadata false のときのみ FFFFFFFF を追加する
  const metadataSuffix =
    params.r >= 4 && !params.encryptMetadata
      ? new Uint8Array([0xff, 0xff, 0xff, 0xff])
      : new Uint8Array(0);

  let hash = md5(
    concat(
      PAD, // 空パスワードをパディングしたもの
      params.o.subarray(0, 32),
      int32le(params.p),
      id0,
      metadataSuffix,
    ),
  );

  if (params.r >= 3) {
    for (let i = 0; i < 50; i += 1) hash = md5(hash.subarray(0, n));
  }
  return hash.slice(0, n);
}

/**
 * Algorithm 4/6: 導出鍵が空ユーザーパスワードとして正しいかを /U と突き合わせる。
 */
function validateLegacyKey(
  key: Uint8Array,
  params: EncryptParams,
  id0: Uint8Array,
): boolean {
  if (params.r === 2) {
    return equals(rc4(key, PAD), params.u.subarray(0, 32));
  }
  // Algorithm 5: MD5(PAD || ID0) を RC4 で 20 回（鍵を i で XOR しながら）暗号化
  let u = rc4(key, md5(concat(PAD, id0)));
  for (let i = 1; i <= 19; i += 1) {
    u = rc4(
      key.map((b) => b ^ i),
      u,
    );
  }
  // R3 以降の /U は後半 16 バイトが任意のため先頭 16 バイトのみ比較する
  return equals(u.subarray(0, 16), params.u.subarray(0, 16));
}

/**
 * Algorithm 2.B: R6 のハッシュ（R5 は SHA-256 一回）。
 * 実装は pdf.js の `PDF20._hash` と同じ手順に揃えてある。
 */
async function hash2B(
  password: Uint8Array,
  salt: Uint8Array,
  userBytes: Uint8Array,
  r: number,
): Promise<Uint8Array> {
  let k: Uint8Array = await sha("SHA-256", concat(password, salt, userBytes));
  if (r === 5) return k;

  let e: Uint8Array = new Uint8Array([0]);
  let i = 0;
  // i >= 64 かつ e の末尾バイトが i-32 以下になるまで繰り返す
  while (i < 64 || e[e.length - 1] > i - 32) {
    // k はラウンドごとに 32/48/64 バイトへ変化する。長さをそのまま使うのが仕様。
    const combined = concat(password, k, userBytes);
    const k1 = new Uint8Array(combined.length * 64);
    for (let j = 0; j < 64; j += 1) k1.set(combined, j * combined.length);

    e = aesCbcEncryptNoPad(k.subarray(0, 16), k.subarray(16, 32), k1);

    let sum = 0;
    for (let j = 0; j < 16; j += 1) sum += e[j];
    const remainder = sum % 3;
    k = await sha(
      remainder === 0 ? "SHA-256" : remainder === 1 ? "SHA-384" : "SHA-512",
      e,
    );
    i += 1;
  }
  return k.subarray(0, 32);
}

/** Algorithm 2.A: V5（R5/R6）のファイル鍵を空ユーザーパスワードから得る。 */
async function computeV5Key(params: EncryptParams): Promise<Uint8Array> {
  if (params.u.length < 48) {
    throw new PdfUnsupportedEncryptionError("/U が 48 バイト未満です");
  }
  const empty = new Uint8Array(0);
  const validationSalt = params.u.subarray(32, 40);
  const keySalt = params.u.subarray(40, 48);

  const check = await hash2B(empty, validationSalt, empty, params.r);
  if (!equals(check, params.u.subarray(0, 32))) {
    throw new PdfPasswordRequiredError();
  }
  if (!params.ue || params.ue.length < 32) {
    throw new PdfUnsupportedEncryptionError("/UE がありません");
  }
  const intermediate = await hash2B(empty, keySalt, empty, params.r);
  // /UE をパディング無し・IV=0 の AES-256-CBC で復号するとファイル鍵になる
  return aesCbcDecryptNoPad(
    intermediate,
    new Uint8Array(16),
    params.ue.subarray(0, 32),
  );
}

/** Algorithm 1: オブジェクト番号・世代番号ごとの鍵を導出する（V5 以外）。 */
function objectKey(
  fileKey: Uint8Array,
  num: number,
  gen: number,
  aes: boolean,
): Uint8Array {
  const suffix = new Uint8Array([
    num & 0xff,
    (num >> 8) & 0xff,
    (num >> 16) & 0xff,
    gen & 0xff,
    (gen >> 8) & 0xff,
  ]);
  const key = md5(concat(fileKey, suffix, aes ? AES_SALT : new Uint8Array(0)));
  return key.subarray(0, Math.min(fileKey.length + 5, 16));
}

/** オブジェクト単位の復号関数。 */
export type DecryptFn = (
  data: Uint8Array,
  num: number,
  gen: number,
) => Uint8Array;

export interface Decryptor {
  decryptStream: DecryptFn;
  decryptString: DecryptFn;
}

function makeTransform(cfm: Cfm, fileKey: Uint8Array): DecryptFn {
  switch (cfm) {
    case "Identity":
      return (data) => data;
    case "AESV3":
      // V5 は per-object 鍵を作らず、ファイル鍵をそのまま使う
      return (data) => aesDecryptPdfData(fileKey, data);
    case "AESV2":
      return (data, num, gen) =>
        aesDecryptPdfData(objectKey(fileKey, num, gen, true), data);
    case "V2":
    default:
      return (data, num, gen) => rc4(objectKey(fileKey, num, gen, false), data);
  }
}

/**
 * 暗号化パラメータからオブジェクト復号器を作る。
 * 空ユーザーパスワードで開けない場合は `PdfPasswordRequiredError`。
 */
export async function createDecryptor(
  params: EncryptParams,
  id0: Uint8Array,
): Promise<Decryptor> {
  let fileKey: Uint8Array;
  if (params.v === 5 || params.r >= 5) {
    fileKey = await computeV5Key(params);
  } else {
    fileKey = computeLegacyKey(params, id0);
    if (!validateLegacyKey(fileKey, params, id0)) {
      throw new PdfPasswordRequiredError();
    }
  }
  return {
    decryptStream: makeTransform(params.stmF, fileKey),
    decryptString: makeTransform(params.strF, fileKey),
  };
}

/** テスト用に内部関数を公開する。 */
export const internals = {
  computeLegacyKey,
  validateLegacyKey,
  objectKey,
  hash2B,
  PAD,
};
