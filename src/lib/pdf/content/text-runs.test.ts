// @vitest-environment node
import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { extractPageText } from "./page-text";
import { buildPdf } from "./pdf-fixtures.test-helper";
import { findTextRuns, rangeBetween, runAt, suggestAlign } from "./text-runs";

async function glyphsOf(content: string) {
  const doc = await PDFDocument.load(await buildPdf([content], [842, 595]));
  return extractPageText(doc, 0).glyphs;
}

const runTexts = (content: Awaited<ReturnType<typeof glyphsOf>>) =>
  findTextRuns(content).map((r) => r.text);

describe("findTextRuns（クリックで選ぶ「語・数値のまとまり」）", () => {
  it("大きな間隔で区切る（Print to PDF の 1 行に詰めた複数セル）", async () => {
    const glyphs = await glyphsOf(
      [
        "0.75 0 0 -0.75 0 595.32 cm",
        "BT /F1 11.9995 Tf 1 0 0 -1 331.68 748.32 Tm",
        "[<3EDC>-10<3ED5>-6<46B7>-0.0625<3EDD>-2320<3ED6><46B7>10<3ED4>] TJ ET",
      ].join("\n"),
    );
    expect(runTexts(glyphs)).toEqual(["81.9", "2.0"]);
  });

  it("空白で区切り、空白そのものはまとまりに含めない", async () => {
    const glyphs = await glyphsOf(
      "BT /F2 12 Tf 72 500 Td (Hello World  x) Tj ET",
    );
    expect(runTexts(glyphs)).toEqual(["Hello", "World", "x"]);
  });

  it("1 文字ずつ別の命令でも、同じ行で詰まっていれば 1 つのまとまりにする", async () => {
    const glyphs = await glyphsOf(
      [
        "BT /F1 10 Tf 1 0 0 1 100 500 Tm <3ED5> Tj ET",
        "BT /F1 10 Tf 1 0 0 1 105.07 500 Tm <3ED6> Tj ET",
        "BT /F1 10 Tf 1 0 0 1 110.14 500 Tm <3ED7> Tj ET",
      ].join("\n"),
    );
    expect(runTexts(glyphs)).toEqual(["123"]);
  });

  it("行・文字サイズが違えば区切る", async () => {
    const glyphs = await glyphsOf(
      [
        "BT /F1 10 Tf 1 0 0 1 100 500 Tm <3ED53ED6> Tj ET",
        "BT /F1 10 Tf 1 0 0 1 100 480 Tm <3ED7> Tj ET",
        "BT /F1 14 Tf 1 0 0 1 105.07 480 Tm <3ED8> Tj ET",
      ].join("\n"),
    );
    expect(runTexts(glyphs)).toEqual(["12", "3", "4"]);
  });

  it("まとまりはグリフ範囲 [start, end) を持つ", async () => {
    const glyphs = await glyphsOf("BT /F2 12 Tf 72 500 Td (ab cd) Tj ET");
    expect(findTextRuns(glyphs).map((r) => [r.start, r.end])).toEqual([
      [0, 2],
      [3, 5],
    ]);
  });

  it("runAt: グリフを含むまとまりを返し、空白グリフでは null", async () => {
    const glyphs = await glyphsOf("BT /F2 12 Tf 72 500 Td (ab cd) Tj ET");
    const runs = findTextRuns(glyphs);
    expect(runAt(runs, 4)?.text).toBe("cd");
    expect(runAt(runs, 2)).toBeNull();
  });
});

describe("rangeBetween（ドラッグで選んだ 2 つのグリフの間の範囲）", () => {
  it("向きに関係なく [小さい方, 大きい方 + 1) を返す", async () => {
    const glyphs = await glyphsOf("BT /F2 12 Tf 72 500 Td (abcdef) Tj ET");
    expect(rangeBetween(glyphs, 1, 3)).toEqual({ start: 1, end: 4 });
    expect(rangeBetween(glyphs, 3, 1)).toEqual({ start: 1, end: 4 });
    expect(rangeBetween(glyphs, 2, 2)).toEqual({ start: 2, end: 3 });
  });

  it("別の行にまたがる場合は null", async () => {
    const glyphs = await glyphsOf(
      "BT /F2 12 Tf 72 500 Td (ab) Tj 0 -20 Td (cd) Tj ET",
    );
    expect(rangeBetween(glyphs, 0, 3)).toBeNull();
  });
});

describe("suggestAlign（揃え方の初期値）", () => {
  it("数値だけ（桁区切り・小数点・符号・単位記号を含む）なら右揃え", () => {
    for (const text of ["81.9", "1,234.5", "-12", "１２３", "50%", "¥1,000"]) {
      expect([text, suggestAlign(text)]).toEqual([text, "right"]);
    }
  });

  it("それ以外は左揃え", () => {
    for (const text of ["令和8年度", "Y330B", "箇所", "", "..."]) {
      expect([text, suggestAlign(text)]).toEqual([text, "left"]);
    }
  });
});
