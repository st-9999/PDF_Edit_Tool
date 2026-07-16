import { describe, expect, it } from "vitest";
import { md5 } from "@/lib/pdf/decrypt/md5";
import { rc4 } from "@/lib/pdf/decrypt/rc4";

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function ascii(text: string): Uint8Array {
  return Uint8Array.from(text, (ch) => ch.charCodeAt(0));
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

describe("md5", () => {
  // RFC 1321 Appendix A.5 の公式テストベクタ
  it.each([
    ["", "d41d8cd98f00b204e9800998ecf8427e"],
    ["a", "0cc175b9c0f1b6a831c399e269772661"],
    ["abc", "900150983cd24fb0d6963f7d28e17f72"],
    ["message digest", "f96b697d7cb7938d525a2f31aaf161d0"],
    ["abcdefghijklmnopqrstuvwxyz", "c3fcd3d76192e4007dfb496cca67e13b"],
    [
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
      "d174ab98d277d9f5a5611c2c9f419d9f",
    ],
    [
      "12345678901234567890123456789012345678901234567890123456789012345678901234567890",
      "57edf4a22be3c955ac49da2e2107b67a",
    ],
  ])("RFC 1321 ベクタ: %j", (input, expected) => {
    expect(toHex(md5(ascii(input)))).toBe(expected);
  });

  it("ブロック境界（55/56/64 バイト）でも正しくパディングする", () => {
    // 56 バイトは「0x80 を足すと 57 > 56」となり追加ブロックが要る境界
    expect(toHex(md5(ascii("a".repeat(55))))).toBe(
      "ef1772b6dff9a122358552954ad0df65",
    );
    expect(toHex(md5(ascii("a".repeat(56))))).toBe(
      "3b0c8ac703f828b04c6c197006d17218",
    );
    expect(toHex(md5(ascii("a".repeat(64))))).toBe(
      "014842d480b571495a4a0363793f7367",
    );
  });

  it("常に 16 バイトを返す", () => {
    expect(md5(ascii("x")).length).toBe(16);
    expect(md5(new Uint8Array(1000)).length).toBe(16);
  });
});

describe("rc4", () => {
  // RFC 6229 / 一般的な RC4 テストベクタ
  it.each([
    ["Key", "Plaintext", "bbf316e8d940af0ad3"],
    ["Wiki", "pedia", "1021bf0420"],
    ["Secret", "Attack at dawn", "45a01f645fc35b383552544b9bf5"],
  ])("既知ベクタ: key=%j", (key, plain, expected) => {
    expect(toHex(rc4(ascii(key), ascii(plain)))).toBe(expected);
  });

  it("同じ鍵で 2 回適用すると元に戻る（対合性）", () => {
    const key = ascii("pdf-key");
    const data = ascii("Hello, encrypted PDF!");
    expect(rc4(key, rc4(key, data))).toEqual(data);
  });

  it("暗号文の長さは平文と等しい", () => {
    const data = fromHex("00112233445566778899aabbccddeeff");
    expect(rc4(ascii("k"), data).length).toBe(data.length);
  });
});
