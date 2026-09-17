// @vitest-environment node
import { describe, it, expect } from "vitest";
import { PDFDict, PDFDocument, PDFName, type PDFContext } from "pdf-lib";
import { loadFontModel } from "./font";
import { buildTestTrueType } from "./truetype.test-helper";

const enc = (s: string) => new TextEncoder().encode(s);
const IDEOGRAPHIC_SPACE = String.fromCharCode(0x3000);

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

const hex4 = (n: number) => n.toString(16).padStart(4, "0");

/** Type0 / Identity-H。FontFile2 に指定の輪郭有無を持つ TrueType を埋め込む。 */
function cidFontWithProgram(
  ctx: PDFContext,
  opts: {
    toUnicode: Record<number, string>;
    outlines?: boolean[];
    cidToGid?: number[];
  },
): PDFDict {
  const entries = Object.entries(opts.toUnicode);
  const bfchar = entries
    .map(([code, ch]) => `<${hex4(Number(code))}> <${hex4(ch.charCodeAt(0))}>`)
    .join("\n");
  const descriptor = ctx.obj({ Type: "FontDescriptor", Flags: 4 });
  if (opts.outlines) {
    descriptor.set(
      PDFName.of("FontFile2"),
      ctx.register(
        ctx.flateStream(buildTestTrueType({ outlines: opts.outlines })),
      ),
    );
  }
  const descendant = ctx.obj({
    Type: "Font",
    Subtype: "CIDFontType2",
    BaseFont: "AAAAAA+MS-Gothic",
    FontDescriptor: ctx.register(descriptor),
  });
  if (opts.cidToGid) {
    const map = new Uint8Array(opts.cidToGid.length * 2);
    opts.cidToGid.forEach((gid, cid) => {
      map[cid * 2] = gid >> 8;
      map[cid * 2 + 1] = gid & 0xff;
    });
    descendant.set(
      PDFName.of("CIDToGIDMap"),
      ctx.register(ctx.flateStream(map)),
    );
  } else {
    descendant.set(PDFName.of("CIDToGIDMap"), PDFName.of("Identity"));
  }
  const font = ctx.obj({
    Type: "Font",
    Subtype: "Type0",
    BaseFont: "AAAAAA+MS-Gothic",
    Encoding: "Identity-H",
    DescendantFonts: [ctx.register(descendant)],
  });
  font.set(
    PDFName.of("ToUnicode"),
    toUnicodeStream(ctx, `${entries.length} beginbfchar\n${bfchar}\nendbfchar`),
  );
  return font;
}

describe("FontModel.encode（新しい文字を、そのフォントで描けるコードに変換する）", () => {
  describe("Type0 / Identity-H", () => {
    it("ToUnicode を逆引きし、輪郭データのある字形のコードを返す", async () => {
      const ctx = await newContext();
      const font = loadFontModel(
        ctx,
        "F1",
        cidFontWithProgram(ctx, {
          toUnicode: { 1: "1", 2: "2", 3: "3" },
          outlines: [false, true, false, true],
        }),
      );
      expect(font.encode("1")).toBe(1);
      expect(font.encode("3")).toBe(3);
      // ToUnicode にはあるが、サブセットで輪郭が削られている
      expect(font.encode("2")).toBeNull();
      // ToUnicode に無い
      expect(font.encode("4")).toBeNull();
    });

    it("同じ文字に複数のコードがあれば、輪郭データのあるコードを選ぶ", async () => {
      const ctx = await newContext();
      const font = loadFontModel(
        ctx,
        "F1",
        cidFontWithProgram(ctx, {
          toUnicode: { 1: "5", 2: "5" },
          outlines: [false, false, true],
        }),
      );
      expect(font.encode("5")).toBe(2);
    });

    it("空白（半角・全角）は輪郭データが空でも使える", async () => {
      const ctx = await newContext();
      const font = loadFontModel(
        ctx,
        "F1",
        cidFontWithProgram(ctx, {
          toUnicode: { 1: " ", 2: IDEOGRAPHIC_SPACE },
          outlines: [false, false, false],
        }),
      );
      expect(font.encode(" ")).toBe(1);
      expect(font.encode(IDEOGRAPHIC_SPACE)).toBe(2);
    });

    it("CIDToGIDMap ストリームで CID から GID を引いて輪郭を確かめる", async () => {
      const ctx = await newContext();
      const font = loadFontModel(
        ctx,
        "F1",
        cidFontWithProgram(ctx, {
          toUnicode: { 1: "A", 2: "B" },
          // CID 1 → GID 3（輪郭あり）、CID 2 → GID 1（輪郭なし）
          cidToGid: [0, 3, 1],
          outlines: [false, false, false, true],
        }),
      );
      expect(font.encode("A")).toBe(1);
      expect(font.encode("B")).toBeNull();
    });

    it("フォント実体が埋め込まれていなければ ToUnicode を信用する", async () => {
      const ctx = await newContext();
      const font = loadFontModel(
        ctx,
        "F1",
        cidFontWithProgram(ctx, { toUnicode: { 7: "7" } }),
      );
      expect(font.encode("7")).toBe(7);
      expect(font.encode("8")).toBeNull();
    });

    it("1 文字でない入力は null", async () => {
      const ctx = await newContext();
      const font = loadFontModel(
        ctx,
        "F1",
        cidFontWithProgram(ctx, { toUnicode: { 1: "1" } }),
      );
      expect(font.encode("")).toBeNull();
      expect(font.encode("11")).toBeNull();
    });

    it("未対応のフォントは常に null", async () => {
      const ctx = await newContext();
      const dict = cidFontWithProgram(ctx, { toUnicode: { 1: "1" } });
      dict.set(PDFName.of("Encoding"), PDFName.of("Identity-V"));
      expect(loadFontModel(ctx, "F1", dict).encode("1")).toBeNull();
    });
  });

  describe("単純 TrueType（Excel の数字用フォント相当）", () => {
    function simpleTrueType(
      ctx: PDFContext,
      opts: { flags: number; program: Uint8Array; toUnicode?: string },
    ): PDFDict {
      const dict = ctx.obj({
        Type: "Font",
        Subtype: "TrueType",
        BaseFont: "BCDFEE+MS-Mincho",
        FirstChar: 32,
        LastChar: 128,
        Widths: Array.from({ length: 97 }, () => 500),
        Encoding: "WinAnsiEncoding",
        FontDescriptor: ctx.register(
          ctx.obj({
            Type: "FontDescriptor",
            Flags: opts.flags,
            FontFile2: ctx.register(ctx.flateStream(opts.program)),
          }),
        ),
      });
      if (opts.toUnicode) {
        dict.set(PDFName.of("ToUnicode"), toUnicodeStream(ctx, opts.toUnicode));
      }
      return dict;
    }

    it("非記号フォントは WinAnsi の逆引きと (3,1) cmap で字形を確かめる", async () => {
      const ctx = await newContext();
      const program = buildTestTrueType({
        outlines: [false, true, false, true],
        // '1' は輪郭あり、'7' は輪郭なし（サブセットで削除）、'€' は輪郭あり
        unicodeBmp: { 0x31: 1, 0x37: 2, 0x20ac: 3 },
      });
      const font = loadFontModel(
        ctx,
        "F2",
        simpleTrueType(ctx, { flags: 32, program }),
      );
      expect(font.encode("1")).toBe(0x31);
      expect(font.encode("7")).toBeNull();
      expect(font.encode("€")).toBe(0x80);
      expect(font.encode("9")).toBeNull(); // cmap に無い
      expect(font.encode("号")).toBeNull(); // WinAnsi で表せない
    });

    it("記号フォントは (3,0) cmap でコードから字形を確かめる", async () => {
      const ctx = await newContext();
      const program = buildTestTrueType({
        outlines: [false, true],
        symbol: { 0xf031: 1 },
      });
      const font = loadFontModel(
        ctx,
        "F2",
        simpleTrueType(ctx, { flags: 4, program }),
      );
      expect(font.encode("1")).toBe(0x31);
      expect(font.encode("2")).toBeNull();
    });

    it("Widths の範囲外のコードは使わない", async () => {
      const ctx = await newContext();
      const program = buildTestTrueType({
        outlines: [false, true],
        unicodeBmp: { 0xe9: 1 },
      });
      const font = loadFontModel(
        ctx,
        "F2",
        simpleTrueType(ctx, { flags: 32, program }),
      );
      // é = 0xE9 は LastChar(128) を超える
      expect(font.encode("é")).toBeNull();
    });

    it("ToUnicode があれば ToUnicode の逆引きを候補にする", async () => {
      const ctx = await newContext();
      const program = buildTestTrueType({
        outlines: [false, true],
        symbol: { 0x41: 1 },
      });
      const font = loadFontModel(
        ctx,
        "F2",
        simpleTrueType(ctx, {
          flags: 4,
          program,
          toUnicode: "1 beginbfchar <41> <FF11> endbfchar",
        }),
      );
      expect(font.encode("１")).toBe(0x41);
    });
  });
});
