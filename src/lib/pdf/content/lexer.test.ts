import { describe, it, expect } from "vitest";
import { tokenize, type Token } from "./lexer";

const enc = (s: string) => new TextEncoder().encode(s);
const latin1 = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));

function tokens(src: string | Uint8Array): Token[] {
  return [...tokenize(typeof src === "string" ? enc(src) : src)];
}

/** 比較しやすい形（種別と値のみ）に落とす。 */
function simplify(t: Token): unknown {
  switch (t.type) {
    case "number":
    case "name":
    case "keyword":
      return [t.type, t.value];
    case "string":
      return [t.hex ? "hex" : "str", Array.from(t.bytes)];
    default:
      return [t.type];
  }
}

describe("tokenize（コンテンツストリームの字句解析）", () => {
  describe("数値", () => {
    it("整数・実数・符号・先頭/末尾の小数点を解釈する", () => {
      expect(tokens("12 -3 +4 0.5 .5 -.25 4. 11.999500").map(simplify)).toEqual(
        [
          ["number", 12],
          ["number", -3],
          ["number", 4],
          ["number", 0.5],
          ["number", 0.5],
          ["number", -0.25],
          ["number", 4],
          ["number", 11.9995],
        ],
      );
    });
  });

  describe("名前", () => {
    it("先頭の / を除き、#xx エスケープを復号する", () => {
      expect(tokens("/F1 /A#20B /MS#2DMincho").map(simplify)).toEqual([
        ["name", "F1"],
        ["name", "A B"],
        ["name", "MS-Mincho"],
      ]);
    });

    it("区切り文字で名前が終わる", () => {
      expect(tokens("/F1[/F2]").map(simplify)).toEqual([
        ["name", "F1"],
        ["arrayStart"],
        ["name", "F2"],
        ["arrayEnd"],
      ]);
    });
  });

  describe("文字列", () => {
    it("入れ子の括弧を含むリテラル文字列を 1 トークンにする", () => {
      expect(tokens("(a(b)c)").map(simplify)).toEqual([
        ["str", Array.from(enc("a(b)c"))],
      ]);
    });

    it("エスケープ（\\n \\( \\\\ 8 進数・行継続）を復号する", () => {
      const src = "(x\\ny\\(\\\\\\101\\7z\\\nw)";
      expect(tokens(src).map(simplify)).toEqual([
        ["str", [0x78, 0x0a, 0x79, 0x28, 0x5c, 0x41, 0x07, 0x7a, 0x77]],
      ]);
    });

    it("未知のエスケープはバックスラッシュを無視して文字を残す", () => {
      expect(tokens("(\\q)").map(simplify)).toEqual([["str", [0x71]]]);
    });

    it("16 進文字列は空白を無視し、奇数桁は末尾を 0 で補う", () => {
      expect(tokens("<0F 95><3ecc4><>").map(simplify)).toEqual([
        ["hex", [0x0f, 0x95]],
        ["hex", [0x3e, 0xcc, 0x40]],
        ["hex", []],
      ]);
    });

    it("8 ビットのバイトをそのまま保持する", () => {
      expect(tokens(latin1("(\x82\xa0)")).map(simplify)).toEqual([
        ["str", [0x82, 0xa0]],
      ]);
    });
  });

  describe("配列・辞書・キーワード・コメント", () => {
    it("TJ 配列と演算子を分解する", () => {
      expect(tokens("[<3EE4>-10.000000<3EDD>] TJ").map(simplify)).toEqual([
        ["arrayStart"],
        ["hex", [0x3e, 0xe4]],
        ["number", -10],
        ["hex", [0x3e, 0xdd]],
        ["arrayEnd"],
        ["keyword", "TJ"],
      ]);
    });

    it("辞書の区切りと、' \" T* などの演算子を認識する", () => {
      expect(
        tokens("/P <</MCID 0>> BDC T* (a) ' 1 2 (b) \" EMC").map(simplify),
      ).toEqual([
        ["name", "P"],
        ["dictStart"],
        ["name", "MCID"],
        ["number", 0],
        ["dictEnd"],
        ["keyword", "BDC"],
        ["keyword", "T*"],
        ["str", [0x61]],
        ["keyword", "'"],
        ["number", 1],
        ["number", 2],
        ["str", [0x62]],
        ["keyword", '"'],
        ["keyword", "EMC"],
      ]);
    });

    it("コメントは行末まで読み飛ばす", () => {
      expect(tokens("1 % comment ( [ \n2").map(simplify)).toEqual([
        ["number", 1],
        ["number", 2],
      ]);
    });

    it("true / false / null はキーワードとして返す", () => {
      expect(tokens("true false null").map(simplify)).toEqual([
        ["keyword", "true"],
        ["keyword", "false"],
        ["keyword", "null"],
      ]);
    });
  });

  describe("インライン画像", () => {
    it("ID 〜 EI の間のバイナリを 1 トークンにし、中の 'EI' に惑わされない", () => {
      // データ中に "EI" が現れても、後ろが空白でなければ終端ではない
      const src = latin1("BI /W 2 /H 1 ID \x00EIx\xff\x0a EI Q");
      expect(tokens(src).map(simplify)).toEqual([
        ["keyword", "BI"],
        ["name", "W"],
        ["number", 2],
        ["name", "H"],
        ["number", 1],
        ["keyword", "ID"],
        ["inlineImageData"],
        ["keyword", "EI"],
        ["keyword", "Q"],
      ]);
    });
  });

  describe("位置情報", () => {
    it("各トークンの start / end が元バイト列上の範囲を指す", () => {
      const src = "BT /F1 9.84 Tf [<0F95>] TJ";
      const bytes = enc(src);
      for (const t of tokenize(bytes)) {
        const text = src.slice(t.start, t.end);
        if (t.type === "name") expect(text).toBe(`/${t.value}`);
        if (t.type === "keyword") expect(text).toBe(t.value);
        if (t.type === "number") expect(Number(text)).toBe(t.value);
        if (t.type === "string") expect(text).toBe("<0F95>");
      }
      const tj = [...tokenize(bytes)].find(
        (t) => t.type === "keyword" && t.value === "TJ",
      );
      expect(tj?.start).toBe(src.indexOf("TJ"));
    });
  });

  it("空入力・空白のみでは何も返さない", () => {
    expect(tokens("")).toEqual([]);
    expect(tokens(" \r\n\t")).toEqual([]);
  });
});
