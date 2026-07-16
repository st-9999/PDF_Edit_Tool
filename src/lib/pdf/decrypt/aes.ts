/**
 * AES（128/256bit）の CBC モード実装。
 *
 * PDF 標準セキュリティハンドラの `/CFM /AESV2`（AES-128）・`/AESV3`（AES-256）に使う。
 * Web Crypto を使わないのは以下の理由による:
 *  - R6 の鍵導出（ISO 32000-2 Algorithm 2.B）はパディング無しの CBC 暗号化を要求するが、
 *    SubtleCrypto は PKCS#7 パディングを強制するため表現できない。
 *  - PDF にはパディングが規約どおりでないファイルが実在し、SubtleCrypto では復号自体が
 *    失敗してしまう。パディング除去を自前で寛容に扱いたい。
 * テーブルは転記ミスを避けるため実行時に生成する。
 */

/** GF(2^8) で 2 倍（既約多項式 0x11b）。 */
function xtime(a: number): number {
  return ((a << 1) ^ (a & 0x80 ? 0x1b : 0)) & 0xff;
}

// 生成元 3 による指数/対数テーブル（GF(2^8) の乗算・逆元用）
const EXP = new Uint8Array(255);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x;
    LOG[x] = i;
    x = (x ^ xtime(x)) & 0xff; // x *= 3
  }
}

/** GF(2^8) の乗算。 */
function mul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[(LOG[a] + LOG[b]) % 255];
}

/** GF(2^8) の乗法逆元（0 の逆元は 0 と定義）。 */
function inverse(a: number): number {
  return a === 0 ? 0 : EXP[(255 - LOG[a]) % 255];
}

const SBOX = new Uint8Array(256);
const INV_SBOX = new Uint8Array(256);
{
  for (let i = 0; i < 256; i += 1) {
    let s = inverse(i);
    let r = s;
    // アフィン変換: s ^= rotl(s,1)^rotl(s,2)^rotl(s,3)^rotl(s,4) ^ 0x63
    for (let k = 0; k < 4; k += 1) {
      r = ((r << 1) | (r >>> 7)) & 0xff;
      s ^= r;
    }
    s = (s ^ 0x63) & 0xff;
    SBOX[i] = s;
    INV_SBOX[s] = i;
  }
}

interface RoundKeys {
  /** 展開済みラウンド鍵（4*(rounds+1) ワード = そのバイト列）。 */
  words: Uint8Array;
  rounds: number;
}

/** 鍵拡張（AES-128: 10 ラウンド / AES-256: 14 ラウンド）。 */
export function expandKey(key: Uint8Array): RoundKeys {
  if (key.length !== 16 && key.length !== 32) {
    throw new Error(`AES の鍵長が不正です: ${key.length} バイト`);
  }
  const nk = key.length / 4;
  const rounds = nk + 6;
  const totalWords = 4 * (rounds + 1);
  const words = new Uint8Array(totalWords * 4);
  words.set(key);

  let rcon = 1;
  const t = new Uint8Array(4);
  for (let i = nk; i < totalWords; i += 1) {
    t[0] = words[(i - 1) * 4];
    t[1] = words[(i - 1) * 4 + 1];
    t[2] = words[(i - 1) * 4 + 2];
    t[3] = words[(i - 1) * 4 + 3];

    if (i % nk === 0) {
      // RotWord + SubWord + Rcon
      const first = t[0];
      t[0] = SBOX[t[1]] ^ rcon;
      t[1] = SBOX[t[2]];
      t[2] = SBOX[t[3]];
      t[3] = SBOX[first];
      rcon = xtime(rcon);
    } else if (nk > 6 && i % nk === 4) {
      t[0] = SBOX[t[0]];
      t[1] = SBOX[t[1]];
      t[2] = SBOX[t[2]];
      t[3] = SBOX[t[3]];
    }

    for (let j = 0; j < 4; j += 1) {
      words[i * 4 + j] = words[(i - nk) * 4 + j] ^ t[j];
    }
  }
  return { words, rounds };
}

function addRoundKey(state: Uint8Array, keys: RoundKeys, round: number): void {
  const offset = round * 16;
  for (let i = 0; i < 16; i += 1) state[i] ^= keys.words[offset + i];
}

/** state は列優先（index = row + 4*col）。 */
function shiftRows(state: Uint8Array): void {
  const src = state.slice();
  for (let r = 1; r < 4; r += 1) {
    for (let c = 0; c < 4; c += 1) {
      state[r + 4 * c] = src[r + 4 * ((c + r) % 4)];
    }
  }
}

function invShiftRows(state: Uint8Array): void {
  const src = state.slice();
  for (let r = 1; r < 4; r += 1) {
    for (let c = 0; c < 4; c += 1) {
      state[r + 4 * ((c + r) % 4)] = src[r + 4 * c];
    }
  }
}

function subBytes(state: Uint8Array): void {
  for (let i = 0; i < 16; i += 1) state[i] = SBOX[state[i]];
}

function invSubBytes(state: Uint8Array): void {
  for (let i = 0; i < 16; i += 1) state[i] = INV_SBOX[state[i]];
}

function mixColumns(state: Uint8Array): void {
  for (let c = 0; c < 4; c += 1) {
    const o = c * 4;
    const a0 = state[o];
    const a1 = state[o + 1];
    const a2 = state[o + 2];
    const a3 = state[o + 3];
    state[o] = mul(a0, 2) ^ mul(a1, 3) ^ a2 ^ a3;
    state[o + 1] = a0 ^ mul(a1, 2) ^ mul(a2, 3) ^ a3;
    state[o + 2] = a0 ^ a1 ^ mul(a2, 2) ^ mul(a3, 3);
    state[o + 3] = mul(a0, 3) ^ a1 ^ a2 ^ mul(a3, 2);
  }
}

function invMixColumns(state: Uint8Array): void {
  for (let c = 0; c < 4; c += 1) {
    const o = c * 4;
    const a0 = state[o];
    const a1 = state[o + 1];
    const a2 = state[o + 2];
    const a3 = state[o + 3];
    state[o] = mul(a0, 14) ^ mul(a1, 11) ^ mul(a2, 13) ^ mul(a3, 9);
    state[o + 1] = mul(a0, 9) ^ mul(a1, 14) ^ mul(a2, 11) ^ mul(a3, 13);
    state[o + 2] = mul(a0, 13) ^ mul(a1, 9) ^ mul(a2, 14) ^ mul(a3, 11);
    state[o + 3] = mul(a0, 11) ^ mul(a1, 13) ^ mul(a2, 9) ^ mul(a3, 14);
  }
}

/** 16 バイトブロックを暗号化する。 */
export function encryptBlock(keys: RoundKeys, block: Uint8Array): Uint8Array {
  const state = block.slice(0, 16);
  addRoundKey(state, keys, 0);
  for (let round = 1; round < keys.rounds; round += 1) {
    subBytes(state);
    shiftRows(state);
    mixColumns(state);
    addRoundKey(state, keys, round);
  }
  subBytes(state);
  shiftRows(state);
  addRoundKey(state, keys, keys.rounds);
  return state;
}

/** 16 バイトブロックを復号する。 */
export function decryptBlock(keys: RoundKeys, block: Uint8Array): Uint8Array {
  const state = block.slice(0, 16);
  addRoundKey(state, keys, keys.rounds);
  for (let round = keys.rounds - 1; round >= 1; round -= 1) {
    invShiftRows(state);
    invSubBytes(state);
    addRoundKey(state, keys, round);
    invMixColumns(state);
  }
  invShiftRows(state);
  invSubBytes(state);
  addRoundKey(state, keys, 0);
  return state;
}

/**
 * CBC 復号（パディング除去なし）。`data` はブロック長の倍数であること。
 */
export function aesCbcDecryptNoPad(
  key: Uint8Array,
  iv: Uint8Array,
  data: Uint8Array,
): Uint8Array {
  const keys = expandKey(key);
  const blocks = Math.floor(data.length / 16);
  const out = new Uint8Array(blocks * 16);
  let prev: Uint8Array = iv.slice(0, 16);
  for (let b = 0; b < blocks; b += 1) {
    const cipher = data.subarray(b * 16, b * 16 + 16);
    const plain = decryptBlock(keys, cipher);
    for (let i = 0; i < 16; i += 1) plain[i] ^= prev[i];
    out.set(plain, b * 16);
    prev = cipher.slice();
  }
  return out;
}

/**
 * CBC 暗号化（パディング付与なし）。`data` はブロック長の倍数であること。
 * R6 の鍵導出（Algorithm 2.B）が「パディング無し」を要求するため必要。
 */
export function aesCbcEncryptNoPad(
  key: Uint8Array,
  iv: Uint8Array,
  data: Uint8Array,
): Uint8Array {
  const keys = expandKey(key);
  const blocks = Math.floor(data.length / 16);
  const out = new Uint8Array(blocks * 16);
  let prev: Uint8Array = iv.slice(0, 16);
  for (let b = 0; b < blocks; b += 1) {
    const block = data.slice(b * 16, b * 16 + 16);
    for (let i = 0; i < 16; i += 1) block[i] ^= prev[i];
    const cipher = encryptBlock(keys, block);
    out.set(cipher, b * 16);
    prev = cipher;
  }
  return out;
}

/**
 * PKCS#7 パディングを寛容に除去する。
 * 規約に合わない値なら「パディング無し」とみなして元データを返す（実在する壊れた PDF 対策）。
 */
export function stripPkcs7(data: Uint8Array): Uint8Array {
  if (data.length === 0) return data;
  const pad = data[data.length - 1];
  if (pad < 1 || pad > 16 || pad > data.length) return data;
  for (let i = data.length - pad; i < data.length; i += 1) {
    if (data[i] !== pad) return data;
  }
  return data.subarray(0, data.length - pad);
}

/**
 * PDF の AES 暗号文（先頭 16 バイトが IV）を復号し、PKCS#7 パディングを除去する。
 */
export function aesDecryptPdfData(
  key: Uint8Array,
  data: Uint8Array,
): Uint8Array {
  // IV(16) すら無い、またはブロック長に満たないものは空データとして扱う
  if (data.length <= 16) return new Uint8Array(0);
  const iv = data.subarray(0, 16);
  const body = data.subarray(16, 16 + Math.floor((data.length - 16) / 16) * 16);
  return stripPkcs7(aesCbcDecryptNoPad(key, iv, body));
}
