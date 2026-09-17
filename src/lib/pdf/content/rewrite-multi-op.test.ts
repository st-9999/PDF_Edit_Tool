// @vitest-environment node
import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { extractPageText, readPageContent } from "./page-text";
import { buildPdf } from "./pdf-fixtures.test-helper";
import { compareWithOracle, pdfjsTextItems } from "./pdfjs-oracle.test-helper";
import { replacePageText, type TextAlign } from "./rewrite";
import type { PageGlyph } from "./text-layout";

const textOf = (glyphs: PageGlyph[]) =>
  glyphs.map((g) => g.text ?? "?").join("");

/** 送り終点（原点からベースライン方向に advance 進めた点）の x。 */
const endX = (g: PageGlyph) => g.x + g.advance;

/**
 * 1 文字ずつ別の BT〜ET に分かれた「123」（数字の幅は 5.07pt）と、離れた位置の「4」。
 * 作成ソフトによっては 1 つの数値がこのように記録される。
 */
const CHAR_PER_BLOCK = [
  "BT /F1 10 Tf 1 0 0 1 100 700 Tm <3ED5> Tj ET",
  "BT /F1 10 Tf 1 0 0 1 105.07 700 Tm <3ED6> Tj ET",
  "BT /F1 10 Tf 1 0 0 1 110.14 700 Tm [<3ED7>] TJ ET",
  "BT /F1 10 Tf 1 0 0 1 200 700 Tm <3ED8> Tj ET",
].join("\n");

async function rewrite(
  content: string,
  range: [number, number],
  text: string,
  align: TextAlign,
) {
  const doc = await PDFDocument.load(await buildPdf([content], [612, 792]));
  const before = extractPageText(doc, 0);
  const result = replacePageText(doc, 0, [
    { start: range[0], end: range[1], text, align },
  ]);
  const saved = await doc.save();
  const after = extractPageText(await PDFDocument.load(saved), 0);
  return { before, after, result, saved, doc };
}

describe("replacePageText（複数の描画命令に分かれた範囲をまとめて書き換える）", () => {
  it("右揃え: 範囲全体の右端（最後の文字の送り終点）を保ち、範囲外の文字は動かない", async () => {
    const { before, after, result, saved } = await rewrite(
      CHAR_PER_BLOCK,
      [0, 3],
      "9.5",
      "right",
    );
    expect(result).toEqual({ ok: true, clipAdjustments: 0, warnings: [] });
    expect(textOf(after.glyphs)).toBe("9.54");
    expect(endX(after.glyphs[2]!)).toBeCloseTo(endX(before.glyphs[2]!), 6);
    expect([after.glyphs[3]!.x, after.glyphs[3]!.y]).toEqual([
      before.glyphs[3]!.x,
      before.glyphs[3]!.y,
    ]);
    // 新しい文字は先頭の命令に入り、同じ行に並ぶ
    expect(
      new Set(after.glyphs.slice(0, 3).map((g) => g.source.opIndex)).size,
    ).toBe(1);
    expect(
      after.glyphs.slice(0, 3).every((g) => g.y === before.glyphs[0]!.y),
    ).toBe(true);

    const oracle = compareWithOracle(
      await pdfjsTextItems(saved, 1),
      after.glyphs,
    );
    expect(oracle.expectedText).toBe("9.54");
    expect(oracle.actualText).toBe(oracle.expectedText);
    expect(oracle.positionMismatches).toEqual([]);
  });

  it("左揃え: 範囲の先頭の原点を保つ", async () => {
    const { before, after } = await rewrite(
      CHAR_PER_BLOCK,
      [0, 3],
      "25",
      "left",
    );
    expect(textOf(after.glyphs)).toBe("254");
    expect(after.glyphs[0]!.x).toBeCloseTo(before.glyphs[0]!.x, 6);
    expect(after.glyphs[2]!.x).toBe(before.glyphs[3]!.x);
  });

  it("中央揃え: 範囲全体の中点を保つ", async () => {
    const { before, after } = await rewrite(
      CHAR_PER_BLOCK,
      [0, 3],
      "5",
      "center",
    );
    const mid = (a: PageGlyph, b: PageGlyph) => (a.x + endX(b)) / 2;
    expect(mid(after.glyphs[0]!, after.glyphs[0]!)).toBeCloseTo(
      mid(before.glyphs[0]!, before.glyphs[2]!),
      6,
    );
  });

  it("2 つ目以降の命令の文字は PDF から消える（空の TJ になる）", async () => {
    const { doc, result } = await rewrite(CHAR_PER_BLOCK, [1, 3], "9", "left");
    expect(result.ok).toBe(true);
    const ops = readPageContent(doc, 0).operations.filter(
      (o) => o.operator === "TJ" || o.operator === "Tj",
    );
    const glyphCounts = ops.map((o) => {
      const arg = o.operands[0]!;
      const strings = arg.kind === "array" ? arg.items : [arg];
      return strings.reduce(
        (n, s) => n + (s.kind === "string" ? s.bytes.length / 2 : 0),
        0,
      );
    });
    expect(glyphCounts).toEqual([1, 1, 0, 1]);
  });

  it("同じ命令の中の後続の文字は、まとめて書き換えても動かない", async () => {
    const content = [
      "BT /F1 10 Tf 1 0 0 1 100 700 Tm <3ED5> Tj ET",
      "BT /F1 10 Tf 1 0 0 1 105.07 700 Tm [<3ED6> -2000 <3ED8>] TJ ET",
    ].join("\n");
    const { before, after } = await rewrite(content, [0, 2], "999", "right");
    expect(textOf(after.glyphs)).toBe("9994");
    expect(after.glyphs[3]!.x).toBeCloseTo(before.glyphs[2]!.x, 6);
  });

  describe("まとめられない場合は失敗する（文書は変更しない）", () => {
    async function expectSpansFailure(
      content: string,
      range: [number, number],
    ) {
      const doc = await PDFDocument.load(await buildPdf([content], [612, 792]));
      const bytes = readPageContent(doc, 0).bytes;
      const result = replacePageText(doc, 0, [
        { start: range[0], end: range[1], text: "9", align: "left" },
      ]);
      expect(result).toEqual({
        ok: false,
        failures: [{ kind: "spans-operations", replacement: 0 }],
      });
      expect(readPageContent(doc, 0).bytes).toEqual(bytes);
    }

    it("別の行（ベースラインが違う）", async () => {
      await expectSpansFailure(
        "BT /F1 10 Tf 1 0 0 1 100 700 Tm <3ED5> Tj ET BT /F1 10 Tf 1 0 0 1 105.07 680 Tm <3ED6> Tj ET",
        [0, 2],
      );
    });

    it("文字サイズが違う", async () => {
      await expectSpansFailure(
        "BT /F1 10 Tf 1 0 0 1 100 700 Tm <3ED5> Tj ET BT /F1 12 Tf 1 0 0 1 105.07 700 Tm <3ED6> Tj ET",
        [0, 2],
      );
    });

    it("フォントが違う", async () => {
      await expectSpansFailure(
        "BT /F1 10 Tf 1 0 0 1 100 700 Tm <3ED5> Tj ET BT /F2 10 Tf 1 0 0 1 105.07 700 Tm (2) Tj ET",
        [0, 2],
      );
    });

    it("後ろの文字が前へ戻っている（読み順と位置が逆）", async () => {
      await expectSpansFailure(
        "BT /F1 10 Tf 1 0 0 1 200 700 Tm <3ED5> Tj ET BT /F1 10 Tf 1 0 0 1 100 700 Tm <3ED6> Tj ET",
        [0, 2],
      );
    });
  });
});
