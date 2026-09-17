// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { extractPageText } from "./page-text";
import { compareWithOracle, pdfjsTextItems } from "./pdfjs-oracle.test-helper";
import { replacePageText, type TextAlign } from "./rewrite";
import type { PageGlyph } from "./text-layout";

// Reference/ はリポジトリ管理外のため、存在する環境でのみ実ファイルで検証する。
const DIR = "Reference/テキスト書き換えサンプルpdf";
const SPEC = `${DIR}/01_仕様書.pdf`;
const QUANTITY = `${DIR}/数量計算書.pdf`;

const textOf = (glyphs: PageGlyph[]) =>
  glyphs.map((g) => g.text ?? "?").join("");

async function load(path: string) {
  return PDFDocument.load(new Uint8Array(readFileSync(path)), {
    updateMetadata: false,
  });
}

/** 範囲外のグリフが、書き換え前後で文字・位置とも変わっていないことを確かめる。 */
function expectOthersUnchanged(
  before: PageGlyph[],
  after: PageGlyph[],
  start: number,
  oldLength: number,
  newLength: number,
) {
  const shift = newLength - oldLength;
  expect(after).toHaveLength(before.length + shift);
  const moved: string[] = [];
  before.forEach((g, i) => {
    if (i >= start && i < start + oldLength) return;
    const a = after[i < start ? i : i + shift]!;
    if (
      a.text !== g.text ||
      Math.abs(a.x - g.x) > 1e-6 ||
      Math.abs(a.y - g.y) > 1e-6
    ) {
      moved.push(`${i}:${g.text}`);
    }
  });
  expect(moved).toEqual([]);
}

async function rewriteAt(
  path: string,
  pageIndex: number,
  needle: string,
  offsetInNeedle: number,
  oldLength: number,
  text: string,
  align: TextAlign,
) {
  const doc = await load(path);
  const before = extractPageText(doc, pageIndex);
  const at = textOf(before.glyphs).indexOf(needle);
  expect(at).toBeGreaterThanOrEqual(0);
  const start = at + offsetInNeedle;
  const result = replacePageText(doc, pageIndex, [
    { start, end: start + oldLength, text, align },
  ]);
  const saved = await doc.save();
  const after = extractPageText(await PDFDocument.load(saved), pageIndex);
  return { before, after, result, saved, start };
}

describe.skipIf(![SPEC, QUANTITY].every((p) => existsSync(p)))(
  "replacePageText（実サンプル PDF）",
  () => {
    it("数量計算書: 合計欄「81.9」を元フォントのまま右揃えで「123.4」にし、他の文字は動かない", async () => {
      const { before, after, result, saved, start } = await rewriteAt(
        QUANTITY,
        0,
        "81.9",
        0,
        4,
        "123.4",
        "right",
      );
      expect(result).toEqual({ ok: true, clipAdjustments: 1, warnings: [] });
      expect(textOf(after.glyphs.slice(start, start + 5))).toBe("123.4");
      expect(textOf(after.glyphs)).not.toContain("81.9");
      expectOthersUnchanged(before.glyphs, after.glyphs, start, 4, 5);

      // pdf.js でも同じ文字列・位置になる
      const oracle = compareWithOracle(
        await pdfjsTextItems(saved, 1),
        after.glyphs,
      );
      expect(oracle.actualText).toBe(oracle.expectedText);
      expect(oracle.expectedText).toContain("123.4");
      expect(oracle.expectedText).not.toContain("81.9");
      expect(oracle.positionMismatches).toEqual([]);
    }, 60_000);

    it("仕様書 1 ページ目: 各フォントで描ける数字が T0 調査（Python で独立に解析）の結果と一致する", async () => {
      const page = extractPageText(await load(SPEC), 0);
      const available = (resource: string) =>
        [..."0123456789,."]
          .filter((ch) => page.fonts.get(resource)!.encode(ch) !== null)
          .join("");
      // F1: Type0 MS 明朝（ToUnicode に 4・5 が無く、7・9 は字形なし）
      expect(available("F1")).toBe("012368");
      // F2: 単純 TrueType MS 明朝（cmap 経由。7・9 は字形なし）
      expect(available("F2")).toBe("01234568");
    }, 60_000);

    it("仕様書 1 ページ目: Type0 の「令和8年度」の 8 を元フォントのまま 6 に書き換える", async () => {
      const ok = await rewriteAt(SPEC, 0, "令和8年度", 2, 1, "6", "left");
      expect(ok.result.ok).toBe(true);
      expect(textOf(ok.after.glyphs)).toContain("令和6年度");
      expect(textOf(ok.after.glyphs)).not.toContain("令和8年度");
      expectOthersUnchanged(ok.before.glyphs, ok.after.glyphs, ok.start, 1, 1);
    }, 60_000);

    it("仕様書 1 ページ目: 単純 TrueType の「508-010」の 508 を元フォントのまま 123 に書き換える", async () => {
      const ok = await rewriteAt(SPEC, 0, "508-010", 0, 3, "123", "left");
      expect(ok.result.ok).toBe(true);
      expect(textOf(ok.after.glyphs)).toContain("123-010");
      expectOthersUnchanged(ok.before.glyphs, ok.after.glyphs, ok.start, 3, 3);

      const oracle = compareWithOracle(
        await pdfjsTextItems(ok.saved, 1),
        ok.after.glyphs,
      );
      expect(oracle.actualText).toBe(oracle.expectedText);
      expect(oracle.positionMismatches).toEqual([]);
    }, 60_000);
  },
);
