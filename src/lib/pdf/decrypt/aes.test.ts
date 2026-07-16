import { describe, expect, it } from "vitest";
import {
  aesCbcDecryptNoPad,
  aesCbcEncryptNoPad,
  decryptBlock,
  encryptBlock,
  expandKey,
  stripPkcs7,
} from "@/lib/pdf/decrypt/aes";

function fromHex(hex: string): Uint8Array {
  const clean = hex.replace(/\s+/g, "");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

describe("AES ブロック暗号（FIPS-197 公式ベクタ）", () => {
  it("AES-128: Appendix C.1", () => {
    const key = fromHex("000102030405060708090a0b0c0d0e0f");
    const plain = fromHex("00112233445566778899aabbccddeeff");
    const expected = "69c4e0d86a7b0430d8cdb78070b4c55a";
    const keys = expandKey(key);
    expect(toHex(encryptBlock(keys, plain))).toBe(expected);
    expect(toHex(decryptBlock(keys, fromHex(expected)))).toBe(toHex(plain));
  });

  it("AES-256: Appendix C.3", () => {
    const key = fromHex(
      "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
    );
    const plain = fromHex("00112233445566778899aabbccddeeff");
    const expected = "8ea2b7ca516745bfeafc49904b496089";
    const keys = expandKey(key);
    expect(toHex(encryptBlock(keys, plain))).toBe(expected);
    expect(toHex(decryptBlock(keys, fromHex(expected)))).toBe(toHex(plain));
  });

  it("192bit 鍵など未対応長は明示的に失敗する", () => {
    expect(() => expandKey(new Uint8Array(24))).toThrow(/鍵長/);
  });
});

describe("AES-CBC（NIST SP 800-38A 公式ベクタ）", () => {
  // F.2.1 CBC-AES128.Encrypt
  const key128 = fromHex("2b7e151628aed2a6abf7158809cf4f3c");
  const iv = fromHex("000102030405060708090a0b0c0d0e0f");
  const plain = fromHex(
    "6bc1bee22e409f96e93d7e117393172a" +
      "ae2d8a571e03ac9c9eb76fac45af8e51" +
      "30c81c46a35ce411e5fbc1191a0a52ef" +
      "f69f2445df4f9b17ad2b417be66c3710",
  );
  const cipher128 = fromHex(
    "7649abac8119b246cee98e9b12e9197d" +
      "5086cb9b507219ee95db113a917678b2" +
      "73bed6b8e3c1743b7116e69e22229516" +
      "3ff1caa1681fac09120eca307586e1a7",
  );

  it("CBC-AES128 暗号化", () => {
    expect(toHex(aesCbcEncryptNoPad(key128, iv, plain))).toBe(toHex(cipher128));
  });

  it("CBC-AES128 復号", () => {
    expect(toHex(aesCbcDecryptNoPad(key128, iv, cipher128))).toBe(toHex(plain));
  });

  it("CBC-AES256 暗号化・復号（F.2.5 / F.2.6）", () => {
    const key256 = fromHex(
      "603deb1015ca71be2b73aef0857d77811f352c073b6108d72d9810a30914dff4",
    );
    const cipher256 = fromHex(
      "f58c4c04d6e5f1ba779eabfb5f7bfbd6" +
        "9cfc4e967edb808d679f777bc6702c7d" +
        "39f23369a9d9bacfa530e26304231461" +
        "b2eb05e2c39be9fcda6c19078c6a9d1b",
    );
    expect(toHex(aesCbcEncryptNoPad(key256, iv, plain))).toBe(toHex(cipher256));
    expect(toHex(aesCbcDecryptNoPad(key256, iv, cipher256))).toBe(toHex(plain));
  });

  it("暗号化 → 復号で元に戻る（往復）", () => {
    const key = fromHex("00112233445566778899aabbccddeeff");
    const data = fromHex("0".repeat(64));
    expect(
      aesCbcDecryptNoPad(key, iv, aesCbcEncryptNoPad(key, iv, data)),
    ).toEqual(data);
  });
});

describe("stripPkcs7", () => {
  it("正しいパディングを除去する", () => {
    const padded = new Uint8Array([1, 2, 3, 4, 4, 4, 4]);
    expect(Array.from(stripPkcs7(padded))).toEqual([1, 2, 3]);
  });

  it("フルブロックのパディング（16）を除去する", () => {
    const padded = new Uint8Array(16).fill(16);
    expect(stripPkcs7(padded).length).toBe(0);
  });

  it("パディングが不正なら元データをそのまま返す（壊れた PDF 対策）", () => {
    const bad = new Uint8Array([1, 2, 3, 9]); // 9 > 長さ
    expect(Array.from(stripPkcs7(bad))).toEqual([1, 2, 3, 9]);
    const inconsistent = new Uint8Array([1, 2, 3, 3]); // 末尾 3 バイトが 3,3,3 でない
    expect(Array.from(stripPkcs7(inconsistent))).toEqual([1, 2, 3, 3]);
  });

  it("空データを壊さない", () => {
    expect(stripPkcs7(new Uint8Array(0)).length).toBe(0);
  });
});
