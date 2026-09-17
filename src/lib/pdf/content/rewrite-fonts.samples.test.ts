// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { extractPageText, type PageText } from "./page-text";
import { compareWithOracle, pdfjsTextItems } from "./pdfjs-oracle.test-helper";
import { replacePageText, type TextAlign } from "./rewrite";
import type { PageGlyph } from "./text-layout";

// Reference/ はリポジトリ管理外のため、存在する環境でのみ実ファイルで検証する。
const DIR = "Reference/テキスト書き換えサンプルpdf";
const SPEC = `${DIR}/01_仕様書.pdf`;
const QUANTITY = `${DIR}/数量計算書.pdf`;
/** 同梱フォント（リポジトリに含まれる）。 */
const NOTO = "public/fonts/NotoSansJP-Regular.ttf";

const textOf = (glyphs: PageGlyph[]) =>
  glyphs.map((g) => g.text ?? "?").join("");

async function rewriteAt(
  path: string,
  needle: string,
  offsetInNeedle: number,
  oldLength: number,
  text: string,
  align: TextAlign,
) {
  const doc = await PDFDocument.load(new Uint8Array(readFileSync(path)), {
    updateMetadata: false,
  });
  const before = extractPageText(doc, 0);
  const at = textOf(before.glyphs).indexOf(needle);
  expect(at).toBeGreaterThanOrEqual(0);
  const start = at + offsetInNeedle;
  const result = replacePageText(
    doc,
    0,
    [{ start, end: start + oldLength, text, align }],
    { fallbackFont: new Uint8Array(readFileSync(NOTO)) },
  );
  const saved = await doc.save();
  const after = extractPageText(await PDFDocument.load(saved), 0);
  return { before, after, result, saved, start };
}

/** 範囲外のグリフが、文字・位置とも変わっていないこと。 */
function expectOthersUnchanged(
  before: PageText,
  after: PageText,
  start: number,
  oldLength: number,
  newLength: number,
) {
  const shift = newLength - oldLength;
  const moved = before.glyphs.flatMap((g, i) => {
    if (i >= start && i < start + oldLength) return [];
    const a = after.glyphs[i < start ? i : i + shift];
    return a &&
      a.text === g.text &&
      Math.abs(a.x - g.x) <= 1e-6 &&
      Math.abs(a.y - g.y) <= 1e-6
      ? []
      : [`${i}:${g.text}`];
  });
  expect(moved).toEqual([]);
}

async function expectPdfjsAgrees(saved: Uint8Array, after: PageText) {
  const oracle = compareWithOracle(
    await pdfjsTextItems(saved, 1),
    after.glyphs,
  );
  expect(oracle.actualText).toBe(oracle.expectedText);
  expect(oracle.positionMismatches).toEqual([]);
  return oracle;
}

describe.skipIf(![SPEC, QUANTITY, NOTO].every((p) => existsSync(p)))(
  "replacePageText（実サンプル PDF・元のフォントに無い文字の補完）",
  () => {
    it("仕様書: 「令和8年度」の 8 を 4 に（MS 明朝の cmap にある字形を ToUnicode に追記して同じフォントで描く）", async () => {
      const { before, after, result, saved, start } = await rewriteAt(
        SPEC,
        "令和8年度",
        2,
        1,
        "4",
        "left",
      );
      expect(result).toEqual({ ok: true, clipAdjustments: 0, warnings: [] });
      expect(textOf(after.glyphs)).toContain("令和4年度");
      expect(after.glyphs[start]!.fontResource).toBe(
        before.glyphs[start]!.fontResource,
      );
      expectOthersUnchanged(before, after, start, 1, 1);
      await expectPdfjsAgrees(saved, after);
    }, 60_000);

    it("仕様書: 「令和8年度」の 8 を 9 に（同じ MS 明朝の別サブセットのフォントに切り替えて描く）", async () => {
      const { before, after, result, saved, start } = await rewriteAt(
        SPEC,
        "令和8年度",
        2,
        1,
        "9",
        "left",
      );
      expect(result).toEqual({ ok: true, clipAdjustments: 0, warnings: [] });
      expect(textOf(after.glyphs)).toContain("令和9年度");
      const original = before.fonts.get(before.glyphs[start]!.fontResource)!;
      const used = after.fonts.get(after.glyphs[start]!.fontResource)!;
      expect(used.resourceName).not.toBe(original.resourceName);
      expect(used.typefaceKey).toBe(original.typefaceKey);
      expectOthersUnchanged(before, after, start, 1, 1);
      await expectPdfjsAgrees(saved, after);
    }, 60_000);

    it("仕様書: 単純 TrueType の「508」を「507」に（7 は同じ書体の別フォントで描く）", async () => {
      const { before, after, result, saved, start } = await rewriteAt(
        SPEC,
        "508-010",
        0,
        3,
        "507",
        "left",
      );
      expect(result).toEqual({ ok: true, clipAdjustments: 0, warnings: [] });
      expect(textOf(after.glyphs)).toContain("507-010");
      expectOthersUnchanged(before, after, start, 3, 3);
      await expectPdfjsAgrees(saved, after);
    }, 60_000);

    it("仕様書: 文書内に無い「鷗」は同梱フォントで描き、警告を返す", async () => {
      const { before, after, result, saved, start } = await rewriteAt(
        SPEC,
        "令和8年度",
        0,
        5,
        "令和鷗年度",
        "left",
      );
      expect(result).toEqual({
        ok: true,
        clipAdjustments: 0,
        warnings: [{ kind: "fallback-font", replacement: 0, chars: ["鷗"] }],
      });
      const used = after.fonts.get(after.glyphs[start + 2]!.fontResource)!;
      expect(used.typefaceKey?.startsWith("Noto Sans JP|")).toBe(true);
      expectOthersUnchanged(before, after, start, 5, 5);
      const oracle = await expectPdfjsAgrees(saved, after);
      expect(oracle.expectedText).toContain("令和鷗年度");
      // 同梱フォントは使った字形だけを埋め込む（元の PDF からの増加は 50KB 未満）
      expect(saved.length - readFileSync(SPEC).length).toBeLessThan(50_000);
    }, 60_000);

    it("数量計算書: 「81.9」を「1,234.5」に（「,」だけ同梱フォント、右揃え・クリップ拡張）", async () => {
      const { before, after, result, saved, start } = await rewriteAt(
        QUANTITY,
        "81.9",
        0,
        4,
        "1,234.5",
        "right",
      );
      expect(result).toEqual({
        ok: true,
        clipAdjustments: 1,
        warnings: [{ kind: "fallback-font", replacement: 0, chars: [","] }],
      });
      expect(textOf(after.glyphs.slice(start, start + 7))).toBe("1,234.5");
      expectOthersUnchanged(before, after, start, 4, 7);
      const oracle = await expectPdfjsAgrees(saved, after);
      expect(oracle.expectedText).toContain("1,234.5");
      expect(oracle.expectedText).not.toContain("81.9");
    }, 60_000);
  },
);
