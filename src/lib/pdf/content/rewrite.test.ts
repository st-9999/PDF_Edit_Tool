// @vitest-environment node
import { describe, it, expect } from "vitest";
import { PDFDocument, PDFName } from "pdf-lib";
import { extractPageText, readPageContent, type PageText } from "./page-text";
import {
  addCidFont,
  addSimpleFont,
  buildPdf,
  enc,
} from "./pdf-fixtures.test-helper";
import { compareWithOracle, pdfjsTextItems } from "./pdfjs-oracle.test-helper";
import {
  replacePageText,
  type TextAlign,
  type TextReplacement,
} from "./rewrite";
import type { PageGlyph } from "./text-layout";

const EPS = 1e-6;

/** グリフ列の文字を連結する（空白も含む）。 */
const textOf = (glyphs: PageGlyph[]) =>
  glyphs.map((g) => g.text ?? "?").join("");

/** 連結文字列で `needle` が現れる位置をグリフ範囲 [start, end) で返す。 */
function findRange(
  glyphs: PageGlyph[],
  needle: string,
  occurrence = 0,
): [number, number] {
  const hay = textOf(glyphs);
  let at = -1;
  for (let i = 0; i <= occurrence; i += 1) at = hay.indexOf(needle, at + 1);
  if (at < 0) throw new Error(`"${needle}" が見つかりません: ${hay}`);
  return [at, at + needle.length];
}

function replacement(
  glyphs: PageGlyph[],
  needle: string,
  text: string,
  align: TextAlign,
  occurrence = 0,
): TextReplacement {
  const [start, end] = findRange(glyphs, needle, occurrence);
  return { start, end, text, align };
}

/** 送り幅の終点（原点からベースライン方向に advance 進めた点）。 */
function endPoint(g: PageGlyph): [number, number] {
  const len = Math.hypot(g.matrix[0], g.matrix[1]);
  return [
    g.x + (g.advance * g.matrix[0]) / len,
    g.y + (g.advance * g.matrix[1]) / len,
  ];
}

function expectSamePoint(a: [number, number], b: [number, number]) {
  expect(a[0]).toBeCloseTo(b[0], 6);
  expect(a[1]).toBeCloseTo(b[1], 6);
}

function expectSamePositions(before: PageGlyph[], after: PageGlyph[]) {
  expect(after.map((g) => g.text)).toEqual(before.map((g) => g.text));
  after.forEach((g, i) =>
    expectSamePoint([g.x, g.y], [before[i]!.x, before[i]!.y]),
  );
}

/** 書き換えを適用して保存し、再読込したページを解析する。 */
async function rewrite(
  bytes: Uint8Array,
  pick: (page: PageText) => TextReplacement[],
  pageIndex = 0,
) {
  const doc = await PDFDocument.load(bytes);
  const before = extractPageText(doc, pageIndex);
  const result = replacePageText(doc, pageIndex, pick(before));
  const saved = await doc.save();
  const reloaded = await PDFDocument.load(saved);
  const after = extractPageText(reloaded, pageIndex);
  return { before, after, result, saved, reloaded };
}

/** Microsoft Print to PDF 形式: 上下反転の cm・文字幅ぴったりのクリップ・1 行に複数セルの TJ。 */
const PRINT_TO_PDF_ROW = [
  "0.75 0 0 -0.75 0 595.32 cm",
  "q 331.68 738.72 m 353.76 738.72 l 353.76 750.08 l 331.68 750.08 l h W* n",
  "BT /F1 11.9995 Tf 1 0 0 -1 331.68 748.32 Tm",
  "[<3EDC>-10<3ED5>-6<46B7>-0.0625<3EDD>-2320<3ED6><46B7>10<3ED4>] TJ ET Q",
].join("\n");

describe("replacePageText（同一フォントでの本物の書き換え）", () => {
  describe("TJ 内の範囲（1 行に複数セル）", () => {
    it("右揃え: 右端を固定し、後続セルの位置を変えない。旧文字列は消える", async () => {
      const bytes = await buildPdf([PRINT_TO_PDF_ROW]);
      const { before, after, result } = await rewrite(bytes, (p) => [
        replacement(p.glyphs, "81.9", "123.4", "right"),
      ]);
      expect(result.ok).toBe(true);
      expect(textOf(after.glyphs)).toBe("123.42.0");
      expect(textOf(after.glyphs)).not.toContain("81.9");
      // 右端（「9」の送り終点）＝ 新しい「4」の送り終点
      expectSamePoint(endPoint(after.glyphs[4]!), endPoint(before.glyphs[3]!));
      // 後続セル「2.0」は不動
      expectSamePositions(before.glyphs.slice(4), after.glyphs.slice(5));
    });

    it("左揃え: 左端を固定し、後続セルの位置を変えない", async () => {
      const bytes = await buildPdf([PRINT_TO_PDF_ROW]);
      const { before, after } = await rewrite(bytes, (p) => [
        replacement(p.glyphs, "81.9", "1.2", "left"),
      ]);
      expect(textOf(after.glyphs)).toBe("1.22.0");
      expectSamePoint(
        [after.glyphs[0]!.x, after.glyphs[0]!.y],
        [before.glyphs[0]!.x, before.glyphs[0]!.y],
      );
      expectSamePositions(before.glyphs.slice(4), after.glyphs.slice(3));
    });

    it("中央揃え: 置換範囲の中点を固定し、後続セルの位置を変えない", async () => {
      const bytes = await buildPdf([PRINT_TO_PDF_ROW]);
      const { before, after } = await rewrite(bytes, (p) => [
        replacement(p.glyphs, "81.9", "123.4", "center"),
      ]);
      const mid = (a: PageGlyph, b: PageGlyph): [number, number] => {
        const e = endPoint(b);
        return [(a.x + e[0]) / 2, (a.y + e[1]) / 2];
      };
      expectSamePoint(
        mid(after.glyphs[0]!, after.glyphs[4]!),
        mid(before.glyphs[0]!, before.glyphs[3]!),
      );
      expectSamePositions(before.glyphs.slice(4), after.glyphs.slice(5));
    });

    it("同じ TJ 内の複数の範囲を一度に書き換える", async () => {
      const bytes = await buildPdf([PRINT_TO_PDF_ROW]);
      const { before, after, result } = await rewrite(bytes, (p) => [
        replacement(p.glyphs, "81.9", "3.4", "right"),
        replacement(p.glyphs, "2.0", "45.5", "right"),
      ]);
      expect(result.ok).toBe(true);
      expect(textOf(after.glyphs)).toBe("3.445.5");
      expectSamePoint(endPoint(after.glyphs[2]!), endPoint(before.glyphs[3]!));
      expectSamePoint(endPoint(after.glyphs[6]!), endPoint(before.glyphs[6]!));
    });

    it("pdf.js で読んでも新しい文字列が得られ、位置が自前の解析と一致する", async () => {
      const bytes = await buildPdf([PRINT_TO_PDF_ROW]);
      const { after, saved } = await rewrite(bytes, (p) => [
        replacement(p.glyphs, "81.9", "123.4", "right"),
      ]);
      const oracle = compareWithOracle(
        await pdfjsTextItems(saved, 1),
        after.glyphs,
      );
      expect(oracle.expectedText).toBe("123.42.0");
      expect(oracle.actualText).toBe(oracle.expectedText);
      expect(oracle.positionMismatches).toEqual([]);
    });
  });

  describe("Tj / ' / \" の書き換え（TJ へ変換）", () => {
    it("Tj の一部を置き換えても、前後の文字と次の行の位置を変えない", async () => {
      const bytes = await buildPdf(
        ["BT /F2 12 Tf 72 700 Td (Hello World) Tj 0 -14 Td (Next) Tj ET"],
        [612, 792],
      );
      const { before, after } = await rewrite(bytes, (p) => [
        replacement(p.glyphs, "World", "There!", "left"),
      ]);
      expect(textOf(after.glyphs)).toBe("Hello There!Next");
      expectSamePositions(before.glyphs.slice(0, 6), after.glyphs.slice(0, 6));
      expectSamePositions(before.glyphs.slice(11), after.glyphs.slice(12));
    });

    it("' と \" の行送り・Tw/Tc の設定を保ったまま置き換える", async () => {
      const bytes = await buildPdf(
        [
          "BT /F2 12 Tf 14 TL 72 700 Td (First) Tj (Second line) ' 2 1 (Third line) \" (Fourth word) Tj ET",
        ],
        [612, 792],
      );
      const { before, after, result } = await rewrite(bytes, (p) => [
        replacement(p.glyphs, "Second", "2nd", "left"),
        replacement(p.glyphs, "Third", "3rd", "left"),
      ]);
      expect(result.ok).toBe(true);
      expect(textOf(after.glyphs)).toBe("First2nd line3rd lineFourth word");
      const keep = (glyphs: PageGlyph[], from: string) =>
        glyphs.slice(findRange(glyphs, from)[0]);
      // 「Fourth word」は Tw=2 / Tc=1 の状態と行送りに依存する
      expectSamePositions(
        keep(before.glyphs, "Fourth"),
        keep(after.glyphs, "Fourth"),
      );
      expectSamePositions(
        [before.glyphs[findRange(before.glyphs, " line", 1)[0]]!],
        [after.glyphs[findRange(after.glyphs, " line", 1)[0]]!],
      );
    });

    it("空文字への置き換え（削除）では後続の文字が動かない", async () => {
      const bytes = await buildPdf(
        ["BT /F2 12 Tf 72 700 Td (Hello World) Tj ET"],
        [612, 792],
      );
      const { before, after } = await rewrite(bytes, (p) => [
        replacement(p.glyphs, "Hello ", "", "left"),
      ]);
      expect(textOf(after.glyphs)).toBe("World");
      expectSamePositions(before.glyphs.slice(6), after.glyphs);
    });
  });

  describe("クリップ", () => {
    function clipPathXs(page: PageText): number[] {
      const ops = page.content.operations;
      const w = ops.findIndex((o) => o.operator === "W*" || o.operator === "W");
      return ops
        .slice(0, w)
        .filter((o) => o.operator === "m" || o.operator === "l")
        .map((o) =>
          o.operands[0]!.kind === "number" ? o.operands[0]!.value : NaN,
        );
    }

    it("文字幅ぴったりの矩形クリップ（m l l l h）を、広がった文字の範囲まで広げる", async () => {
      const bytes = await buildPdf([PRINT_TO_PDF_ROW]);
      const { before, after, result } = await rewrite(bytes, (p) => [
        replacement(p.glyphs, "81.9", "123.4", "right"),
      ]);
      expect(result.ok && result.clipAdjustments).toBe(1);
      const xsBefore = clipPathXs(before);
      const xsAfter = clipPathXs(after);
      // クリップはテキストと同じ cm 空間（x は 1/0.75 倍）で定義されている
      const newLeft = after.glyphs[0]!.quad[0]! / 0.75;
      expect(Math.min(...xsAfter)).toBeLessThanOrEqual(newLeft + EPS);
      expect(Math.min(...xsAfter)).toBeLessThan(Math.min(...xsBefore));
      // 右端（固定側）と、ベースラインと直交する方向（y）は変えない
      expect(Math.max(...xsAfter)).toBeCloseTo(Math.max(...xsBefore), 6);
      const ysOf = (p: PageText) =>
        p.content.operations
          .filter((o) => o.operator === "m" || o.operator === "l")
          .map((o) =>
            o.operands[1]!.kind === "number" ? o.operands[1]!.value : NaN,
          );
      expect(ysOf(after)).toEqual(ysOf(before));
    });

    it("収まる場合はクリップを変えない", async () => {
      const bytes = await buildPdf([PRINT_TO_PDF_ROW]);
      const { before, after, result } = await rewrite(bytes, (p) => [
        replacement(p.glyphs, "81.9", "1.2", "right"),
      ]);
      expect(result.ok && result.clipAdjustments).toBe(0);
      expect(clipPathXs(after)).toEqual(clipPathXs(before));
    });

    it("re の矩形クリップ（Excel のセル）を広げる", async () => {
      const bytes = await buildPdf(
        [
          "q 100 100 20 14 re W n BT /F1 10 Tf 1 0 0 1 102 103 Tm <3ED53ED6> Tj ET Q",
        ],
        [612, 792],
      );
      const { after, result } = await rewrite(bytes, (p) => [
        replacement(p.glyphs, "12", "12345", "left"),
      ]);
      expect(result.ok && result.clipAdjustments).toBe(1);
      const re = after.content.operations.find((o) => o.operator === "re")!;
      const [x, y, w, h] = re.operands.map((o) =>
        o.kind === "number" ? o.value : NaN,
      );
      expect([x, y, h]).toEqual([100, 100, 14]);
      const last = after.glyphs[after.glyphs.length - 1]!;
      expect(x! + w!).toBeGreaterThanOrEqual(last.x + last.glyphWidth - EPS);
    });

    it("矩形でないクリップは変えずに警告を返す", async () => {
      const bytes = await buildPdf(
        [
          "q 100 100 m 125 100 l 112 120 l h W n BT /F1 10 Tf 1 0 0 1 102 103 Tm <3ED53ED6> Tj ET Q",
        ],
        [612, 792],
      );
      const doc = await PDFDocument.load(bytes);
      const page = extractPageText(doc, 0);
      const result = replacePageText(doc, 0, [
        replacement(page.glyphs, "12", "12345", "left"),
      ]);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.clipAdjustments).toBe(0);
      expect(result.warnings).toEqual([
        { kind: "clip-not-adjusted", replacement: 0 },
      ]);
    });

    it("Q で解除されたクリップは対象にしない", async () => {
      const bytes = await buildPdf(
        [
          "q 100 100 20 14 re W n Q BT /F1 10 Tf 1 0 0 1 102 103 Tm <3ED53ED6> Tj ET",
        ],
        [612, 792],
      );
      const { result } = await rewrite(bytes, (p) => [
        replacement(p.glyphs, "12", "12345", "left"),
      ]);
      expect(result.ok && result.clipAdjustments).toBe(0);
      expect(result.ok && result.warnings).toEqual([]);
    });
  });

  describe("ページのコンテンツ", () => {
    it("複数のコンテンツストリームを 1 つにまとめ、他の文字の位置を変えない", async () => {
      const bytes = await buildPdf(
        [
          "q BT /F2 12 Tf 72 700 Td (First) Tj ET",
          "BT /F1 12 Tf 72 680 Td <3ED53ED6> Tj ET Q",
          "BT /F2 12 Tf 72 660 Td (Third) Tj ET",
        ],
        [612, 792],
      );
      const { before, after, reloaded } = await rewrite(bytes, (p) => [
        replacement(p.glyphs, "12", "345", "left"),
      ]);
      expect(textOf(after.glyphs)).toBe("First345Third");
      expect(readPageContent(reloaded, 0).segments).toHaveLength(1);
      expectSamePositions(before.glyphs.slice(0, 5), after.glyphs.slice(0, 5));
      expectSamePositions(before.glyphs.slice(7), after.glyphs.slice(8));
    });

    it("同じコンテンツストリームを共有する別ページは変えない", async () => {
      const doc = await PDFDocument.create();
      const ctx = doc.context;
      const fonts = ctx.obj({ F1: addCidFont(ctx), F2: addSimpleFont(ctx) });
      const shared = ctx.register(
        ctx.flateStream(enc("BT /F1 12 Tf 72 700 Td <3ED53ED6> Tj ET")),
      );
      for (let i = 0; i < 2; i += 1) {
        const page = doc.addPage([612, 792]);
        page.node.set(PDFName.of("Resources"), ctx.obj({ Font: fonts }));
        page.node.set(PDFName.of("Contents"), shared);
      }
      const { after, reloaded } = await rewrite(await doc.save(), (p) => [
        replacement(p.glyphs, "12", "9", "left"),
      ]);
      expect(textOf(after.glyphs)).toBe("9");
      expect(textOf(extractPageText(reloaded, 1).glyphs)).toBe("12");
    });
  });

  describe("書き換えできない場合（文書は変更しない）", () => {
    async function expectUnchanged(
      bytes: Uint8Array,
      pick: (p: PageText) => TextReplacement[],
    ) {
      const doc = await PDFDocument.load(bytes);
      const before = readPageContent(doc, 0).bytes;
      const result = replacePageText(doc, 0, pick(extractPageText(doc, 0)));
      expect(readPageContent(doc, 0).bytes).toEqual(before);
      return result;
    }

    it("元のフォントに無い文字は、その文字を返して失敗する", async () => {
      const bytes = await buildPdf([PRINT_TO_PDF_ROW]);
      const result = await expectUnchanged(bytes, (p) => [
        replacement(p.glyphs, "81.9", "7.67", "right"),
      ]);
      expect(result).toEqual({
        ok: false,
        failures: [
          { kind: "missing-glyphs", replacement: 0, chars: ["7", "6"] },
        ],
      });
    });

    it("別の行の命令にまたがる範囲は失敗する（同じ行ならまとめて書き換える: rewrite-multi-op.test.ts）", async () => {
      const bytes = await buildPdf(
        ["BT /F2 12 Tf 72 700 Td (AB) Tj 0 -20 Td (CD) Tj ET"],
        [612, 792],
      );
      const result = await expectUnchanged(bytes, (p) => [
        replacement(p.glyphs, "BC", "X", "left"),
      ]);
      expect(result).toEqual({
        ok: false,
        failures: [{ kind: "spans-operations", replacement: 0 }],
      });
    });

    it("重なる範囲・不正な範囲は失敗する（すべての失敗を返す）", async () => {
      const bytes = await buildPdf([PRINT_TO_PDF_ROW]);
      const result = await expectUnchanged(bytes, () => [
        { start: 0, end: 3, text: "1", align: "left" },
        { start: 2, end: 4, text: "1", align: "left" },
        { start: 5, end: 5, text: "1", align: "left" },
        { start: 6, end: 99, text: "1", align: "left" },
      ]);
      expect(result).toEqual({
        ok: false,
        failures: [
          { kind: "overlap", replacement: 1 },
          { kind: "invalid-range", replacement: 2 },
          { kind: "invalid-range", replacement: 3 },
        ],
      });
    });

    it("位置計算に未対応のフォント（縦書き）は失敗する", async () => {
      const bytes = await buildPdf(
        ["BT /F3 12 Tf 72 700 Td <3ED53ED6> Tj ET"],
        [612, 792],
      );
      const result = await expectUnchanged(bytes, () => [
        { start: 0, end: 1, text: "2", align: "left" },
      ]);
      expect(result).toEqual({
        ok: false,
        failures: [
          { kind: "unsupported-font", replacement: 0, reason: "vertical" },
        ],
      });
    });
  });
});
