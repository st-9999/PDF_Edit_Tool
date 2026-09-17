// @vitest-environment node
import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { extractPageText, readPageContent } from "./page-text";
import { buildPdf } from "./pdf-fixtures.test-helper";
import { compareWithOracle, pdfjsTextItems } from "./pdfjs-oracle.test-helper";

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
