// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  type PDFContext,
} from "pdf-lib";
import { loadFontModel } from "./font";

const enc = (s: string) => new TextEncoder().encode(s);

async function newContext(): Promise<PDFContext> {
  return (await PDFDocument.create()).context;
}

function toUnicodeStream(ctx: PDFContext, body: string) {
  return ctx.register(
    ctx.flateStream(
      enc(`1 begincodespacerange <0000> <FFFF> endcodespacerange\n${body}`),
    ),
  );
}

/** Excel 出力に近い Type0 / Identity-H フォント辞書を作る。 */
function type0Font(
  ctx: PDFContext,
  opts: {
    encoding?: string;
    w?: (number | number[])[];
    dw?: number;
    toUnicode?: string;
  },
): PDFDict {
  const descendant = ctx.obj({
    Type: "Font",
    Subtype: "CIDFontType2",
    BaseFont: "BCDEEE+MS-Mincho",
    CIDSystemInfo: {
      Registry: PDFHexString.fromText("Adobe"),
      Ordering: PDFHexString.fromText("Identity"),
      Supplement: 0,
    },
    FontDescriptor: ctx.obj({
      Type: "FontDescriptor",
      Ascent: 859,
      Descent: -140,
    }),
    CIDToGIDMap: "Identity",
  });
  if (opts.w) descendant.set(PDFName.of("W"), ctx.obj(opts.w));
  if (opts.dw !== undefined) descendant.set(PDFName.of("DW"), ctx.obj(opts.dw));

  const font = ctx.obj({
    Type: "Font",
    Subtype: "Type0",
    BaseFont: "BCDEEE+MS-Mincho",
    Encoding: opts.encoding ?? "Identity-H",
    DescendantFonts: [ctx.register(descendant)],
  });
  if (opts.toUnicode !== undefined) {
    font.set(PDFName.of("ToUnicode"), toUnicodeStream(ctx, opts.toUnicode));
  }
  return font;
}

describe("loadFontModel", () => {
  describe("Type0 / Identity-H", () => {
    it("2 バイトずつコードに区切り、バイト位置を返す", async () => {
      const ctx = await newContext();
      const font = loadFontModel(ctx, "F1", type0Font(ctx, { toUnicode: "" }));
      expect(
        font.splitCodes(Uint8Array.from([0x0f, 0x22, 0x25, 0xc1, 0x31])),
      ).toEqual([
        { code: 0x0f22, offset: 0, length: 2 },
        { code: 0x25c1, offset: 2, length: 2 },
        // 端数の 1 バイトもコードとして返す（読み飛ばすと位置がずれるため）
        { code: 0x31, offset: 4, length: 1 },
      ]);
      expect(font.unsupportedReason).toBeNull();
      expect(font.vertical).toBe(false);
    });

    it("W 配列の両形式（c [w…] と c1 c2 w）と DW から幅を得る", async () => {
      const ctx = await newContext();
      const font = loadFontModel(
        ctx,
        "F1",
        type0Font(ctx, { w: [3, [250, 333], 100, 102, 500], dw: 1000 }),
      );
      expect(font.width(3)).toBe(250);
      expect(font.width(4)).toBe(333);
      expect(font.width(100)).toBe(500);
      expect(font.width(102)).toBe(500);
      expect(font.width(103)).toBe(1000); // DW
    });

    it("DW が無ければ既定幅 1000 を使う", async () => {
      const ctx = await newContext();
      const font = loadFontModel(ctx, "F1", type0Font(ctx, {}));
      expect(font.width(5)).toBe(1000);
    });

    it("ToUnicode で文字に変換し、無いコードは null", async () => {
      const ctx = await newContext();
      const font = loadFontModel(
        ctx,
        "F1",
        type0Font(ctx, { toUnicode: "1 beginbfchar <0F95> <53F7> endbfchar" }),
      );
      expect(font.unicode(0x0f95)).toBe("号");
      expect(font.unicode(0x0001)).toBeNull();
    });

    it("FontDescriptor（子孫フォント側）のアセント・ディセントを読む", async () => {
      const ctx = await newContext();
      const font = loadFontModel(ctx, "F1", type0Font(ctx, {}));
      expect(font.ascent).toBe(859);
      expect(font.descent).toBe(-140);
    });

    it("Identity-V は縦書きとして未対応扱いにする", async () => {
      const ctx = await newContext();
      const font = loadFontModel(
        ctx,
        "F1",
        type0Font(ctx, { encoding: "Identity-V" }),
      );
      expect(font.vertical).toBe(true);
      expect(font.unsupportedReason).toBe("vertical");
    });

    it("Identity 以外の CMap は未対応扱いにする", async () => {
      const ctx = await newContext();
      const font = loadFontModel(
        ctx,
        "F1",
        type0Font(ctx, { encoding: "90ms-RKSJ-H" }),
      );
      expect(font.unsupportedReason).toBe("encoding");
    });

    it("ワード間隔（Tw）は 2 バイトコードには適用しない", async () => {
      const ctx = await newContext();
      const font = loadFontModel(ctx, "F1", type0Font(ctx, {}));
      expect(font.isWordSpace({ code: 32, offset: 0, length: 2 })).toBe(false);
    });
  });

  describe("単純フォント（TrueType / Type1）", () => {
    function simpleFont(
      ctx: PDFContext,
      extra: Record<string, unknown>,
    ): PDFDict {
      return ctx.obj({
        Type: "Font",
        Subtype: "TrueType",
        BaseFont: "BCDFEE+MS-Mincho",
        FirstChar: 48,
        LastChar: 50,
        Widths: [500, 510, 520],
        FontDescriptor: ctx.obj({
          Type: "FontDescriptor",
          Ascent: 900,
          Descent: -100,
          MissingWidth: 250,
        }),
        ...extra,
      }) as PDFDict;
    }

    it("1 バイトずつコードに区切る", async () => {
      const ctx = await newContext();
      const font = loadFontModel(
        ctx,
        "F2",
        simpleFont(ctx, { Encoding: "WinAnsiEncoding" }),
      );
      expect(font.splitCodes(enc("18"))).toEqual([
        { code: 0x31, offset: 0, length: 1 },
        { code: 0x38, offset: 1, length: 1 },
      ]);
    });

    it("FirstChar / Widths から幅を得て、範囲外は MissingWidth", async () => {
      const ctx = await newContext();
      const font = loadFontModel(
        ctx,
        "F2",
        simpleFont(ctx, { Encoding: "WinAnsiEncoding" }),
      );
      expect(font.width(48)).toBe(500);
      expect(font.width(50)).toBe(520);
      expect(font.width(51)).toBe(250);
    });

    it("ToUnicode が無ければ WinAnsiEncoding で文字にする（0x80 台の特殊文字を含む）", async () => {
      const ctx = await newContext();
      const font = loadFontModel(
        ctx,
        "F2",
        simpleFont(ctx, { Encoding: "WinAnsiEncoding" }),
      );
      expect(font.unicode(0x31)).toBe("1");
      expect(font.unicode(0x80)).toBe("€");
      expect(font.unicode(0x97)).toBe("—");
      expect(font.unicode(0xe9)).toBe("é");
      expect(font.unicode(0x81)).toBeNull(); // 未定義
    });

    it("Differences の uniXXXX 形式の名前を文字にし、それ以外は BaseEncoding に従う", async () => {
      const ctx = await newContext();
      const font = loadFontModel(
        ctx,
        "F2",
        simpleFont(ctx, {
          Encoding: {
            Type: "Encoding",
            BaseEncoding: "WinAnsiEncoding",
            Differences: [65, "uni53F7", "unknownglyph"],
          },
        }),
      );
      expect(font.unicode(65)).toBe("号");
      expect(font.unicode(66)).toBeNull(); // 名前から文字が分からない
      expect(font.unicode(67)).toBe("C"); // Differences 範囲外は BaseEncoding
    });

    it("ToUnicode があればエンコーディングより優先する", async () => {
      const ctx = await newContext();
      const font = loadFontModel(
        ctx,
        "F2",
        simpleFont(ctx, {
          Encoding: "WinAnsiEncoding",
          ToUnicode: toUnicodeStream(
            ctx,
            "1 beginbfchar <0031> <FF11> endbfchar",
          ),
        }),
      );
      expect(font.unicode(0x31)).toBe("１");
    });

    it("ワード間隔（Tw）は 1 バイトのコード 32 にだけ適用する", async () => {
      const ctx = await newContext();
      const font = loadFontModel(ctx, "F2", simpleFont(ctx, {}));
      expect(font.isWordSpace({ code: 32, offset: 0, length: 1 })).toBe(true);
      expect(font.isWordSpace({ code: 33, offset: 0, length: 1 })).toBe(false);
    });

    it("Widths を持たない標準 14 フォントは幅が不明なため未対応扱いにする", async () => {
      const ctx = await newContext();
      const dict = ctx.obj({
        Type: "Font",
        Subtype: "Type1",
        BaseFont: "Helvetica",
        Encoding: "WinAnsiEncoding",
      }) as PDFDict;
      const font = loadFontModel(ctx, "F3", dict);
      expect(font.unsupportedReason).toBe("metrics");
      expect(font.unicode(0x41)).toBe("A");
    });
  });

  it("Type3 フォントは未対応扱いにする", async () => {
    const ctx = await newContext();
    const dict = ctx.obj({
      Type: "Font",
      Subtype: "Type3",
      FirstChar: 0,
      Widths: [1],
    }) as PDFDict;
    expect(loadFontModel(ctx, "T3", dict).unsupportedReason).toBe("type3");
  });

  it("ベースフォント名とサブセット接頭辞を除いた名前を返す", async () => {
    const ctx = await newContext();
    const font = loadFontModel(ctx, "F1", type0Font(ctx, {}));
    expect(font.baseFont).toBe("BCDEEE+MS-Mincho");
    expect(font.postScriptName).toBe("MS-Mincho");
    expect(font.resourceName).toBe("F1");
  });
});
