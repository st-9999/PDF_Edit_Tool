// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { extractPageText } from "./page-text";
import { compareWithOracle, pdfjsTextItems } from "./pdfjs-oracle.test-helper";

// Reference/ はリポジトリ管理外のため、存在する環境でのみ実ファイルで検証する。
const SAMPLE_DIR = "Reference/テキスト書き換えサンプルpdf";
const SAMPLES = ["01_仕様書.pdf", "数量計算書.pdf"].map(
  (name) => `${SAMPLE_DIR}/${name}`,
);

describe.skipIf(!SAMPLES.every((p) => existsSync(p)))(
  "extractPageText（実サンプル PDF の全ページを pdf.js と照合）",
  () => {
    for (const path of SAMPLES) {
      it(`${path.split("/").pop()}: 全ページの文字列・各項目の先頭と末尾の位置が一致する`, async () => {
        const bytes = new Uint8Array(readFileSync(path));
        const doc = await PDFDocument.load(bytes, { updateMetadata: false });

        const failures: string[] = [];
        let totalGlyphs = 0;
        let totalCompared = 0;
        for (let i = 0; i < doc.getPageCount(); i += 1) {
          const text = extractPageText(doc, i);
          totalGlyphs += text.glyphs.length;
          // サンプルは全フォントが位置計算に対応している（未対応のグリフが無い）
          const unsupported = text.glyphs.filter((g) => g.unsupported);
          if (unsupported.length > 0) {
            failures.push(`p${i + 1}: 未対応グリフ ${unsupported.length} 件`);
          }
          if (text.missingFonts.length > 0) {
            failures.push(
              `p${i + 1}: フォント不明 ${text.missingFonts.join(",")}`,
            );
          }
          const result = compareWithOracle(
            await pdfjsTextItems(bytes, i + 1),
            text.glyphs,
          );
          totalCompared += result.comparedItems;
          if (result.actualText !== result.expectedText) {
            failures.push(
              `p${i + 1}: 文字列不一致 expected=${result.expectedText.slice(0, 80)} actual=${result.actualText.slice(0, 80)}`,
            );
          }
          for (const m of result.positionMismatches.slice(0, 3)) {
            failures.push(
              `p${i + 1}: 位置不一致(${m.at}) "${m.str}" expected=${m.expected.map((n) => n.toFixed(2))} actual=${m.actual.map((n) => n.toFixed(2))}`,
            );
          }
          if (result.positionMismatches.length > 3) {
            failures.push(
              `p${i + 1}: 位置不一致 ほか ${result.positionMismatches.length - 3} 件`,
            );
          }
        }

        expect(failures).toEqual([]);
        expect(totalGlyphs).toBeGreaterThan(0);
        expect(totalCompared).toBeGreaterThan(0);
      }, 60_000);
    }
  },
);
