/**
 * MD5 ハッシュ。
 *
 * PDF の標準セキュリティハンドラ（ISO 32000-1 7.6.3）は鍵導出に MD5 を使うが、
 * Web Crypto（SubtleCrypto）は MD5 を提供しないため自前実装する。
 * ここでの用途は「暗号化 PDF を復号して編集可能にする」ことであり、
 * メッセージ認証やパスワード保存には使わない。
 */

/** 各ラウンドの左ローテート量（RFC 1321）。 */
const SHIFTS = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5,
  9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11,
  16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15,
  21,
];

/** K[i] = floor(abs(sin(i+1)) * 2^32)（RFC 1321）。 */
const K = (() => {
  const table = new Uint32Array(64);
  for (let i = 0; i < 64; i += 1) {
    table[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32);
  }
  return table;
})();

function rotateLeft(value: number, count: number): number {
  return (value << count) | (value >>> (32 - count));
}

/** 入力バイト列の MD5 ダイジェスト（16 バイト）を返す。 */
export function md5(message: Uint8Array): Uint8Array {
  // パディング: 0x80 を付け、長さが 56 mod 64 になるまで 0 を詰め、最後に 64bit 長（LE）。
  const zeros = (56 - ((message.length + 1) % 64) + 64) % 64;
  const total = message.length + 1 + zeros + 8;
  const buf = new Uint8Array(total);
  buf.set(message);
  buf[message.length] = 0x80;

  const view = new DataView(buf.buffer);
  const bitLength = message.length * 8;
  view.setUint32(total - 8, bitLength >>> 0, true);
  view.setUint32(total - 4, Math.floor(bitLength / 2 ** 32), true);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  const words = new Uint32Array(16);
  for (let offset = 0; offset < total; offset += 64) {
    for (let j = 0; j < 16; j += 1) {
      words[j] = view.getUint32(offset + j * 4, true);
    }

    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;

    for (let i = 0; i < 64; i += 1) {
      let f: number;
      let g: number;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }
      const tmp = (f + a + K[i] + words[g]) >>> 0;
      a = d;
      d = c;
      c = b;
      b = (b + rotateLeft(tmp, SHIFTS[i])) >>> 0;
    }

    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }

  const out = new Uint8Array(16);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, a0, true);
  outView.setUint32(4, b0, true);
  outView.setUint32(8, c0, true);
  outView.setUint32(12, d0, true);
  return out;
}
