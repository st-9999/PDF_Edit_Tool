// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  PDFDocument,
  PDFHexString,
  PDFName,
  type PDFContext,
  type PDFRef,
} from "pdf-lib";
import { extractPageText, readPageContent } from "./page-text";
import { compareWithOracle, pdfjsTextItems } from "./pdfjs-oracle.test-helper";

const enc = (s: string) => new TextEncoder().encode(s);

/** 埋め込みなしの単純 TrueType フォント（WinAnsi・Widths 付き）。 */
function addSimpleFont(ctx: PDFContext): PDFRef {
  const widths = Array.from({ length: 95 }, (_, i) => 400 + ((i * 37) % 300));
  return ctx.register(
    ctx.obj({
      Type: "Font",
      Subtype: "TrueType",
      BaseFont: "TestSans",
      FirstChar: 32,
      LastChar: 126,
      Widths: widths,
      Encoding: "WinAnsiEncoding",
      FontDescriptor: ctx.register(
        ctx.obj({
          Type: "FontDescriptor",
          FontName: "TestSans",
          Flags: 32,
          FontBBox: [0, -200, 1000, 800],
          ItalicAngle: 0,
          Ascent: 800,
          Descent: -200,
          CapHeight: 700,
          StemV: 80,
          MissingWidth: 500,
        }),
      ),
    }),
  );
}

/**
 * Excel / Print to PDF 相当の Type0（Identity-H）フォント。
 * 文字コード（CID）は 0x3E00 台に割り当て、ToUnicode と W で文字・幅を与える。
 */
const CID_CHARS: [number, string, number][] = [
  [0x3ed4, "0", 507],
  [0x3ed5, "1", 507],
  [0x3ed6, "2", 507],
  [0x3ed9, "5", 507],
  [0x3edc, "8", 507],
  [0x3edd, "9", 507],
  [0x46b7, ".", 313],
  [0x0f95, "号", 1000],
  [0x27a8, "第", 1000],
  [0x3ecc, "*", 507],
];

function addCidFont(ctx: PDFContext): PDFRef {
  const bfchar = CID_CHARS.map(
    ([code, ch]) =>
      `<${code.toString(16).padStart(4, "0")}> <${ch.charCodeAt(0).toString(16).padStart(4, "0")}>`,
  ).join("\n");
  const toUnicode = ctx.register(
    ctx.flateStream(
      enc(
        `/CIDInit /ProcSet findresource begin 12 dict begin begincmap\n1 begincodespacerange <0000> <FFFF> endcodespacerange\n${CID_CHARS.length} beginbfchar\n${bfchar}\nendbfchar endcmap end end`,
      ),
    ),
  );
  const w = CID_CHARS.flatMap(([code, , width]) => [code, [width]]);
  const descendant = ctx.register(
    ctx.obj({
      Type: "Font",
      Subtype: "CIDFontType2",
      BaseFont: "CIDFont+F1",
      CIDSystemInfo: {
        Registry: PDFHexString.fromText("Adobe"),
        Ordering: PDFHexString.fromText("Identity"),
        Supplement: 0,
      },
      FontDescriptor: ctx.register(
        ctx.obj({
          Type: "FontDescriptor",
          FontName: "CIDFont+F1",
          Flags: 32,
          FontBBox: [0, -140, 1000, 859],
          ItalicAngle: 0,
          Ascent: 859,
          Descent: -140,
          CapHeight: 700,
          StemV: 80,
        }),
      ),
      DW: 1000,
      W: w,
      CIDToGIDMap: "Identity",
    }),
  );
  return ctx.register(
    ctx.obj({
      Type: "Font",
      Subtype: "Type0",
      BaseFont: "CIDFont+F1",
      Encoding: "Identity-H",
      DescendantFonts: [descendant],
      ToUnicode: toUnicode,
    }),
  );
}

/** 指定したコンテンツストリーム（複数可）とフォントでページを 1 枚作る。 */
async function buildPdf(
  streams: string[],
  size: [number, number] = [842, 595],
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const ctx = doc.context;
  const page = doc.addPage(size);
  const fonts = ctx.obj({ F1: addCidFont(ctx), F2: addSimpleFont(ctx) });
  page.node.set(PDFName.of("Resources"), ctx.obj({ Font: fonts }));
  const refs = streams.map((s) => ctx.register(ctx.flateStream(enc(s))));
  page.node.set(
    PDFName.of("Contents"),
    refs.length === 1 ? refs[0]! : ctx.obj(refs),
  );
  return doc.save();
}

async function extract(bytes: Uint8Array, pageIndex = 0) {
  const doc = await PDFDocument.load(bytes);
  return extractPageText(doc, pageIndex);
}

async function expectMatchesPdfjs(bytes: Uint8Array) {
  const { glyphs } = await extract(bytes);
  const result = compareWithOracle(await pdfjsTextItems(bytes, 1), glyphs);
  expect(result.actualText).toBe(result.expectedText);
  expect(result.comparedItems).toBeGreaterThan(0);
  expect(result.positionMismatches).toEqual([]);
  return result;
}

describe("extractPageText（pdf.js の抽出結果と一致すること）", () => {
  it("Excel 形式: セルごとの BT〜ET・クリップ・マーク付きコンテンツ・単純フォントの数字", async () => {
    const bytes = await buildPdf([
      [
        "/P <</MCID 0>> BDC q 48.504 31.8 744.82 505.56 re W* n",
        "BT /F1 9.84 Tf 1 0 0 1 244.85 442.78 Tm 0 g [<0F95>] TJ ET Q EMC",
        "/P <</MCID 1>> BDC q 48.504 31.8 744.82 505.56 re W* n",
        "BT /F2 9.84 Tf 1 0 0 1 573.34 442.78 Tm 0 g [(18)] TJ ET Q EMC",
        "q BT /F1 9.84 Tf 1 0 0 1 607.18 419.5 Tm [<27A83ED53ED9>] TJ ET Q",
      ].join("\n"),
    ]);
    const result = await expectMatchesPdfjs(bytes);
    expect(result.actualText).toBe("号18第15");
  });

  it("Print to PDF 形式: 上下反転の cm・1 行に複数セルを詰めた TJ・カーニング・2 Tr", async () => {
    const bytes = await buildPdf([
      [
        "0.750000 0.000000 0.000000 -0.750000 0.000000 595.320007 cm",
        "q 331.68 738.72 m 353.76 738.72 l 353.76 750.08 l 331.68 750.08 l h W* n",
        "0 0 0 rg 0.120 w BT 2 Tr /F1 11.999500 Tf 1 0 0.000000 -1 331.679993 748.320007 Tm",
        "[<3EDC>-10.000000<3ED5>-6.000000<46B7>-0.062500<3EDD>-2320.000000<3ED6><46B7>10<3ED4>] TJ ET Q",
        "q BT /F1 15.9994 Tf 1 0 0 -1 260.8 100.8 Tm [<3ED6><3ED6><3ECC>-0.6875] TJ ET Q",
      ].join("\n"),
    ]);
    const result = await expectMatchesPdfjs(bytes);
    expect(result.actualText).toBe("81.92.022*");
  });

  it("行移動（Td / TD / T* / ' / \"）と文字間隔・単語間隔・水平倍率", async () => {
    const bytes = await buildPdf(
      [
        [
          "BT /F2 12 Tf 72 700 Td (Hello World) Tj",
          "0 -14 Td 2 Tc 3 Tw (Spaced out words) Tj",
          "0 -14 TD 0 Tc 0 Tw 80 Tz (Scaled text) Tj",
          "T* 100 Tz (Next line) Tj",
          "(Quote line) '",
          '1 0.5 (Double quote) " ET',
        ].join("\n"),
      ],
      [612, 792],
    );
    await expectMatchesPdfjs(bytes);
  });

  it("q / Q と cm の入れ子・Tm の回転を含む座標変換", async () => {
    const bytes = await buildPdf(
      [
        [
          "q 1 0 0 1 50 50 cm q 0.5 0 0 0.5 0 0 cm",
          "BT /F2 20 Tf 1 0 0 1 100 100 Tm (Nested) Tj ET Q",
          "BT /F2 10 Tf 0 1 -1 0 300 200 Tm (Rotated) Tj ET Q",
          "BT /F2 10 Tf 1 0 0 1 10 10 Tm (Outer) Tj ET",
        ].join("\n"),
      ],
      [612, 792],
    );
    await expectMatchesPdfjs(bytes);
  });

  it("複数のコンテンツストリームに分かれたページを連結して解釈する", async () => {
    const bytes = await buildPdf(
      [
        "q BT /F2 12 Tf 72 700 Td (First) Tj ET",
        "BT /F1 12 Tf 72 680 Td <3ED53ED6> Tj ET Q",
        "BT /F2 12 Tf 72 660 Td (Third) Tj ET",
      ],
      [612, 792],
    );
    const result = await expectMatchesPdfjs(bytes);
    expect(result.actualText).toBe("First12Third");
  });
});

describe("readPageContent", () => {
  it("複数ストリームを改行で連結し、各ストリームの範囲を返す", async () => {
    const bytes = await buildPdf(["q", "BT ET", "Q"], [100, 100]);
    const doc = await PDFDocument.load(bytes);
    const content = readPageContent(doc, 0);
    const text = new TextDecoder().decode(content.bytes);
    expect(content.segments.map((s) => text.slice(s.start, s.end))).toEqual([
      "q",
      "BT ET",
      "Q",
    ]);
    expect(content.segments.map((s) => s.streamIndex)).toEqual([0, 1, 2]);
    expect(content.operations.map((o) => o.operator)).toEqual([
      "q",
      "BT",
      "ET",
      "Q",
    ]);
  });

  it("コンテンツが無いページは空の結果になる", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([100, 100]);
    const loaded = await PDFDocument.load(await doc.save());
    const content = readPageContent(loaded, 0);
    expect(content.operations).toEqual([]);
    expect(extractPageText(loaded, 0).glyphs).toEqual([]);
  });
});
