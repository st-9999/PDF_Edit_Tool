// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { extractPageText } from "./page-text";
import { findTextRuns, hasNeighborRun } from "./text-runs";

// Reference/ はリポジトリ管理外のため、存在する環境でのみ実ファイルで検証する。
const DIR = "Reference/テキスト書き換えサンプルpdf";
const SPEC = `${DIR}/01_仕様書.pdf`;
const QUANTITY = `${DIR}/数量計算書.pdf`;

async function runsOf(path: string, pageIndex: number) {
  const doc = await PDFDocument.load(new Uint8Array(readFileSync(path)));
  return findTextRuns(extractPageText(doc, pageIndex).glyphs).map(
    (r) => r.text,
  );
}

describe.skipIf(![SPEC, QUANTITY].every((p) => existsSync(p)))(
  "findTextRuns（実サンプル PDF）",
  () => {
    it("数量計算書: 1 つの TJ に詰めた表の各セルの数値を別々のまとまりにする", async () => {
      const runs = await runsOf(QUANTITY, 0);
      for (const cell of ["81.9", "19.61", "35.1", "NO.0+4.0", "すりつけ工"]) {
        expect(runs).toContain(cell);
      }
      // セルをまたいでつながったまとまりが無い（数値の後ろに別の数値が続かない）
      expect(runs.some((r) => /^\d+\.\d+\d+\.\d+$/.test(r))).toBe(false);
    }, 60_000);

    it("仕様書: セル内の文言・コードを 1 つのまとまりにする", async () => {
      const runs = await runsOf(SPEC, 0);
      for (const cell of [
        "令和8年度",
        "508-010508200-0-0000-0-208",
        "土砂災害警戒区域緊急点検委託その８",
      ]) {
        expect(runs).toContain(cell);
      }
    }, 60_000);
  },
);

describe.skipIf(!existsSync(QUANTITY))(
  "hasNeighborRun（実サンプル PDF）",
  () => {
    it("数量計算書: 字間を空けた見出し「土 工 計 算 書」の 1 文字には隣がある", async () => {
      const doc = await PDFDocument.load(
        new Uint8Array(readFileSync(QUANTITY)),
      );
      const glyphs = extractPageText(doc, 0).glyphs;
      const runs = findTextRuns(glyphs);
      const text = glyphs.map((g) => g.text ?? "?").join("");
      const at = text.indexOf("土 工 計 算 書");
      expect(at).toBeGreaterThanOrEqual(0);
      const first = runs.find((r) => r.start === at)!;
      expect(first.text).toBe("土");
      expect(hasNeighborRun(glyphs, runs, first)).toBe(true);
      // 見出し全体を選べば隣は無い（前後の文字とは離れている）
      expect(hasNeighborRun(glyphs, runs, { start: at, end: at + 9 })).toBe(
        false,
      );
    }, 60_000);
  },
);
