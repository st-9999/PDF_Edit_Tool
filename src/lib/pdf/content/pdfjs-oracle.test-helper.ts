/**
 * テスト専用: pdf.js のテキスト抽出結果を「正解」として、自前の解析結果と突き合わせる。
 */
import type { PageGlyph } from "./text-layout";

export interface OracleItem {
  str: string;
  x: number;
  y: number;
  /** ベースライン方向の幅（ユーザー空間）。 */
  width: number;
  /** ベースライン方向の単位ベクトル。 */
  dir: [number, number];
}

export interface OracleComparison {
  /** 空白を除いた文字列（pdf.js）。 */
  expectedText: string;
  /** 空白を除いた文字列（自前の解析）。 */
  actualText: string;
  /** 位置を比較できた項目数。 */
  comparedItems: number;
  /** 先頭の原点、または末尾（原点＋幅）のずれが許容差を超えた項目。 */
  positionMismatches: {
    str: string;
    at: "start" | "end";
    expected: [number, number];
    actual: [number, number];
  }[];
}

const isSpace = (ch: string) => /\s/.test(ch);

/** pdf.js で指定ページのテキスト項目（ユーザー空間の原点つき）を取得する。 */
export async function pdfjsTextItems(
  bytes: Uint8Array,
  pageNumber: number,
): Promise<OracleItem[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await pdfjs.getDocument({
    data: Uint8Array.from(bytes),
    useSystemFonts: false,
    verbosity: 0,
  }).promise;
  try {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent({ disableNormalization: true });
    return content.items.flatMap((item) => {
      if (!("str" in item) || item.str.length === 0) return [];
      const [a, b] = item.transform as number[];
      const len = Math.hypot(a!, b!) || 1;
      return [
        {
          str: item.str,
          x: item.transform[4] as number,
          y: item.transform[5] as number,
          width: item.width,
          dir: [a! / len, b! / len] as [number, number],
        },
      ];
    });
  } finally {
    await pdf.destroy();
  }
}

/**
 * 文字列（空白除く）の一致と、各項目の先頭文字の原点の一致を調べる。
 * pdf.js は語間に空白を補うため、比較は空白を除いて行う。
 */
export function compareWithOracle(
  items: OracleItem[],
  glyphs: PageGlyph[],
  tolerance = 0.05,
): OracleComparison {
  // 自前: 空白以外の文字 → そのグリフ
  const actualChars: { ch: string; glyph: PageGlyph }[] = [];
  for (const g of glyphs) {
    for (const ch of g.text ?? "�") {
      if (!isSpace(ch)) actualChars.push({ ch, glyph: g });
    }
  }

  let expectedText = "";
  let comparedItems = 0;
  const positionMismatches: OracleComparison["positionMismatches"] = [];
  for (const item of items) {
    const startIndex = [...expectedText].length;
    const chars = [...item.str].filter((ch) => !isSpace(ch));
    expectedText += chars.join("");
    const all = [...item.str];
    // 前後が空白の項目は、空白グリフと補われた空白を区別できないため位置を比べない
    if (chars.length === 0 || isSpace(all[0]!) || isSpace(all[all.length - 1]!))
      continue;
    const first = actualChars[startIndex];
    const last = actualChars[startIndex + chars.length - 1];
    if (!first || !last) continue;
    comparedItems += 1;
    const check = (
      at: "start" | "end",
      expected: [number, number],
      actual: [number, number],
    ) => {
      if (
        Math.abs(actual[0] - expected[0]) > tolerance ||
        Math.abs(actual[1] - expected[1]) > tolerance
      ) {
        positionMismatches.push({ str: item.str, at, expected, actual });
      }
    };
    check("start", [item.x, item.y], [first.glyph.x, first.glyph.y]);
    // 末尾: 最後のグリフの原点から、グリフ本体の幅だけ進めた点を、項目の進行方向へ射影して比べる。
    // - pdf.js の項目幅は最後のグリフの文字間隔 Tc を含まない
    // - pdf.js は基準線がわずかにずれた文字（サイズ違いなど）も 1 項目にまとめるため、
    //   進行方向と直交する成分は比べない
    const g = last.glyph;
    const glen = Math.hypot(g.matrix[0], g.matrix[1]) || 1;
    const gdir: [number, number] = [g.matrix[0] / glen, g.matrix[1] / glen];
    const endX = g.x + g.glyphWidth * gdir[0];
    const endY = g.y + g.glyphWidth * gdir[1];
    const along = (endX - item.x) * item.dir[0] + (endY - item.y) * item.dir[1];
    check(
      "end",
      [item.x + item.width * item.dir[0], item.y + item.width * item.dir[1]],
      [item.x + along * item.dir[0], item.y + along * item.dir[1]],
    );
  }

  return {
    expectedText,
    actualText: actualChars.map((c) => c.ch).join(""),
    comparedItems,
    positionMismatches,
  };
}
