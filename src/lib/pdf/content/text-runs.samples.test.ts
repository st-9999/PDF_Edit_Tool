// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { extractPageText } from "./page-text";
import { findTextRuns } from "./text-runs";

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
