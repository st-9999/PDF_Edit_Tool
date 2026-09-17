import { describe, it, expect } from "vitest";
import type { FontModel } from "./font";
import { parseOperations } from "./operations";
import { layoutText, type PageGlyph } from "./text-layout";

const enc = (s: string) => new TextEncoder().encode(s);

/** 1 バイトコード・幅固定のテスト用フォント（コードの ASCII 文字をそのまま文字とする）。 */
function simpleFont(name: string, width = 500): FontModel {
  return {
    resourceName: name,
    subtype: "TrueType",
    baseFont: name,
    postScriptName: name,
    vertical: false,
    unsupportedReason: null,
    ascent: 800,
    descent: -200,
    toUnicode: null,
    splitCodes: (bytes) =>
      Array.from(bytes, (code, offset) => ({ code, offset, length: 1 })),
    unicode: (code) => String.fromCharCode(code),
    width: () => width,
    isWordSpace: (c) => c.length === 1 && c.code === 32,
    encode: (ch) => ch.charCodeAt(0),
    encodeViaFontProgram: () => null,
    typefaceKey: null,
  };
}

/** 2 バイトコード（Identity-H 相当）のテスト用フォント。 */
function cidFont(
  name: string,
  chars: Record<number, [string, number]>,
): FontModel {
  return {
    ...simpleFont(name),
    subtype: "Type0",
    splitCodes(bytes) {
      const out = [];
      for (let i = 0; i + 1 < bytes.length; i += 2) {
        out.push({
          code: (bytes[i]! << 8) | bytes[i + 1]!,
          offset: i,
          length: 2,
        });
      }
      return out;
    },
    unicode: (code) => chars[code]?.[0] ?? null,
    width: (code) => chars[code]?.[1] ?? 1000,
    isWordSpace: () => false,
  };
}

function run(src: string, fonts: FontModel[] = [simpleFont("F1")]) {
  const map = new Map(fonts.map((f) => [f.resourceName, f]));
  return layoutText(parseOperations(enc(src)), (name) => map.get(name) ?? null);
}

function origins(glyphs: PageGlyph[]) {
  return glyphs.map((g) => [g.text, round(g.x), round(g.y)]);
}

const round = (n: number) => Math.round(n * 1000) / 1000;

describe("layoutText（テキスト描画命令の解釈）", () => {
  it("Tj の各グリフの原点を、送り幅（幅/1000×文字サイズ）ずつ進める", () => {
    const { glyphs } = run("BT /F1 10 Tf 1 0 0 1 100 200 Tm (AB) Tj ET");
    expect(origins(glyphs)).toEqual([
      ["A", 100, 200],
      ["B", 105, 200],
    ]);
    expect(glyphs[0]!.advance).toBeCloseTo(5);
    expect(glyphs[0]!.fontSize).toBe(10);
    expect(glyphs[0]!.fontResource).toBe("F1");
  });

  it("文字間隔 Tc・単語間隔 Tw・水平倍率 Tz を送り幅に反映する（Tw は空白にのみ）", () => {
    const { glyphs } = run(
      "BT /F1 10 Tf 1 Tc 2 Tw 50 Tz 1 0 0 1 100 0 Tm (A B) Tj ET",
    );
    // A: (5 + 1) × 0.5 = 3、空白: (5 + 1 + 2) × 0.5 = 4
    expect(origins(glyphs)).toEqual([
      ["A", 100, 0],
      [" ", 103, 0],
      ["B", 107, 0],
    ]);
    // グリフ本体の幅は Tc・Tw を含まず Tz のみ反映: 5 × 0.5
    expect(glyphs.map((g) => g.glyphWidth)).toEqual([2.5, 2.5, 2.5]);
    expect(glyphs.map((g) => g.advance)).toEqual([3, 4, 3]);
  });

  it("TJ の数値は 1/1000 em 単位で位置を戻す（負なら右へ進む）", () => {
    const { glyphs } = run(
      "BT /F1 10 Tf 1 0 0 1 100 0 Tm [(A) -1000 (B) 500 (C)] TJ ET",
    );
    expect(origins(glyphs)).toEqual([
      ["A", 100, 0],
      ["B", 115, 0],
      ["C", 115, 0],
    ]);
  });

  it("Td / TD / T* / ' / \" で行を移動する（Td は行頭基準）", () => {
    const { glyphs } = run(
      [
        "BT /F1 10 Tf 1 0 0 1 10 100 Tm (A) Tj",
        "0 -12 Td (B) Tj", // 行頭 (10,100) から下へ 12
        "5 -12 TD (C) Tj", // TL = 12
        "T* (D) Tj",
        "(E) '",
        '3 1 (F) "', // Tw=3, Tc=1 を設定して次行へ
        "(GH) Tj ET",
      ].join("\n"),
    );
    expect(origins(glyphs)).toEqual([
      ["A", 10, 100],
      ["B", 10, 88],
      ["C", 15, 76],
      ["D", 15, 64],
      ["E", 15, 52],
      ["F", 15, 40],
      // F の送り幅は 5 + Tc(1)
      ["G", 21, 40],
      ["H", 27, 40],
    ]);
  });

  it("cm による座標変換を適用し、q / Q で元に戻す", () => {
    const { glyphs } = run(
      "q 2 0 0 2 10 20 cm BT /F1 10 Tf (AB) Tj ET Q BT /F1 10 Tf (C) Tj ET",
    );
    expect(origins(glyphs)).toEqual([
      ["A", 10, 20],
      ["B", 20, 20], // 送り幅 5 が 2 倍
      ["C", 0, 0],
    ]);
    expect(glyphs[0]!.advance).toBeCloseTo(10);
  });

  it("上下反転した座標系（Microsoft Print to PDF 形式）でも原点と送り幅が正しい", () => {
    const { glyphs } = run(
      "0.75 0 0 -0.75 0 595.32 cm BT /F1 12 Tf 1 0 0 -1 901.28 68.64 Tm (AB) Tj ET",
    );
    expect(origins(glyphs)).toEqual([
      ["A", 675.96, 543.84],
      ["B", 680.46, 543.84], // 6 × 0.75
    ]);
    expect(glyphs[0]!.advance).toBeCloseTo(4.5);
  });

  it("文字の上昇 Ts をベースライン位置に反映する", () => {
    const { glyphs } = run("BT /F1 10 Tf 3 Ts 1 0 0 1 0 50 Tm (A) Tj ET");
    expect(origins(glyphs)).toEqual([["A", 0, 53]]);
  });

  it("Tf などのテキスト状態は BT をまたいで保持し、Tm は BT ごとに初期化する", () => {
    const { glyphs } = run(
      "BT /F1 10 Tf 1 0 0 1 50 50 Tm (A) Tj ET BT (B) Tj ET",
    );
    expect(origins(glyphs)).toEqual([
      ["A", 50, 50],
      ["B", 0, 0],
    ]);
    expect(glyphs.map((g) => g.textObject)).toEqual([0, 1]);
  });

  it("グリフの四隅（アセント〜ディセント × 送り幅）を返す", () => {
    const { glyphs } = run("BT /F1 10 Tf 1 0 0 1 100 200 Tm (A) Tj ET");
    expect(glyphs[0]!.quad.map(round)).toEqual([
      100, 198, 105, 198, 105, 208, 100, 208,
    ]);
  });

  it("描画モード Tr を記録する", () => {
    const { glyphs } = run("BT /F1 10 Tf 2 Tr (A) Tj ET");
    expect(glyphs[0]!.renderMode).toBe(2);
  });

  it("グリフごとに、その時点のテキスト状態（Tc・Tw・Tz）を記録する", () => {
    const { glyphs } = run(
      "BT /F1 10 Tf 1 Tc 2 Tw 80 Tz [(A) -120.5 (B C)] TJ ET",
    );
    expect(
      glyphs.map((g) => [
        g.text,
        g.charSpacing,
        g.wordSpacing,
        g.horizontalScale,
      ]),
    ).toEqual([
      ["A", 1, 2, 0.8],
      ["B", 1, 2, 0.8],
      [" ", 1, 2, 0.8],
      ["C", 1, 2, 0.8],
    ]);
  });

  it("各命令の実行直前の CTM を命令番号ごとに返す", () => {
    const { ctmBeforeOp } = run("q 2 0 0 2 10 20 cm 0 0 5 5 re W n Q BT ET");
    // q, cm, re, W, n, Q, BT, ET
    expect(ctmBeforeOp[0]).toEqual([1, 0, 0, 1, 0, 0]);
    expect(ctmBeforeOp[2]).toEqual([2, 0, 0, 2, 10, 20]); // re
    expect(ctmBeforeOp[6]).toEqual([1, 0, 0, 1, 0, 0]); // Q の後の BT
  });

  describe("元データ上の位置", () => {
    it("TJ の配列要素番号と文字列内のバイト位置（2 バイトコード）を返す", () => {
      const font = cidFont("F1", {
        0x3ee4: ["8", 500],
        0x3edd: ["1", 500],
        0x46b7: [".", 300],
      });
      const src = "BT /F1 12 Tf [<3EE4>-10<3EDD46B7>] TJ ET";
      const { glyphs } = run(src, [font]);
      expect(glyphs.map((g) => g.text)).toEqual(["8", "1", "."]);
      expect(glyphs.map((g) => g.source)).toEqual([
        {
          opIndex: 2,
          operandIndex: 0,
          itemIndex: 0,
          byteOffset: 0,
          byteLength: 2,
        },
        {
          opIndex: 2,
          operandIndex: 0,
          itemIndex: 2,
          byteOffset: 0,
          byteLength: 2,
        },
        {
          opIndex: 2,
          operandIndex: 0,
          itemIndex: 2,
          byteOffset: 2,
          byteLength: 2,
        },
      ]);
      expect(glyphs.map((g) => g.code)).toEqual([0x3ee4, 0x3edd, 0x46b7]);
      expect(glyphs[2]!.width).toBe(300);
    });

    it('Tj は引数 0、" は引数 2 の文字列を指し、配列要素番号は -1', () => {
      const { glyphs } = run('BT /F1 10 Tf (A) Tj 1 2 (B) " ET');
      expect(
        glyphs.map((g) => [
          g.source.opIndex,
          g.source.operandIndex,
          g.source.itemIndex,
        ]),
      ).toEqual([
        [2, 0, -1],
        [3, 2, -1],
      ]);
    });
  });

  describe("解釈できないもの", () => {
    it("ページに無いフォントの文字列はグリフにせず、フォント名を報告する", () => {
      const { glyphs, missingFonts } = run("BT /F9 10 Tf (A) Tj ET");
      expect(glyphs).toEqual([]);
      expect(missingFonts).toEqual(["F9"]);
    });

    it("Tf より前の文字列はグリフにしない", () => {
      expect(run("BT (A) Tj ET").glyphs).toEqual([]);
    });

    it("Do で呼び出す XObject 名を報告する（Form 内の文字は対象外）", () => {
      expect(run("q /Fm0 Do Q /Im1 Do").xObjects).toEqual(["Fm0", "Im1"]);
    });

    it("フォントの未対応理由をグリフに引き継ぐ", () => {
      const vertical = {
        ...simpleFont("F1"),
        vertical: true,
        unsupportedReason: "vertical" as const,
      };
      const { glyphs } = run("BT /F1 10 Tf (A) Tj ET", [vertical]);
      expect(glyphs[0]!.unsupported).toBe("vertical");
    });

    it("インライン画像や未知の演算子があっても後続の文字を解釈する", () => {
      const { glyphs } = run(
        "BI /W 1 /H 1 ID \u0000 EI /P <</MCID 0>> BDC BT /F1 10 Tf (A) Tj ET EMC",
      );
      expect(origins(glyphs)).toEqual([["A", 0, 0]]);
    });
  });
});
