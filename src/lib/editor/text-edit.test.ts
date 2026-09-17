// @vitest-environment node
import { describe, it, expect } from "vitest";
import { PDFDocument, PDFName, PDFRef, degrees } from "pdf-lib";
import { extractPageText, readPageContent } from "@/lib/pdf/content/page-text";
import {
  buildPdf as buildFixturePdf,
  cidFontWithProgram,
  enc,
} from "@/lib/pdf/content/pdf-fixtures.test-helper";
import { buildTestTrueType } from "@/lib/pdf/content/truetype.test-helper";
import {
  TextEditError,
  loadDocumentWithEdits,
  previewTextEdit,
  renderEditedPage,
  type TextEdit,
} from "./text-edit";

const textOf = (doc: PDFDocument, pageIndex = 0) =>
  extractPageText(doc, pageIndex)
    .glyphs.map((g) => g.text ?? "?")
    .join("");

const edit = (start: number, end: number, text: string): TextEdit => ({
  replacements: [{ start, end, text, align: "left" }],
});

/** 「鷗」だけを持つ同梱フォント相当。 */
const FALLBACK = buildTestTrueType({
  outlines: [true, true],
  unicodeBmp: { 0x9dd7: 1 },
  advanceWidths: [1000, 1000],
  familyName: "Noto Sans JP",
});

/** 1 ページ目のフォントには「9」が無く、同じ書体の 2 ページ目のフォントにはある文書。 */
async function twoPageDocument(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const ctx = doc.context;
  const program = {
    unicodeBmp: { 0x31: 1, 0x32: 2, 0x39: 5 },
    advanceWidths: [0, 500, 500, 500, 500, 500],
    familyName: "MS Mincho",
  };
  const a = ctx.register(
    cidFontWithProgram(ctx, {
      toUnicode: { 1: "1", 2: "2" },
      outlines: [false, true, true, false, false, false],
      widths: { 1: 500, 2: 500 },
      program,
    }),
  );
  const b = ctx.register(
    cidFontWithProgram(ctx, {
      toUnicode: { 5: "9" },
      outlines: [false, false, false, false, false, true],
      widths: { 5: 500 },
      baseFont: "CIDFont+F1",
      program,
    }),
  );
  const contents: [PDFRef, string][] = [
    [a, "BT /F1 10 Tf 72 700 Td <00010002> Tj ET"],
    [b, "BT /F1 10 Tf 72 700 Td <0005> Tj ET"],
  ];
  for (const [font, content] of contents) {
    const page = doc.addPage([612, 792]);
    page.node.set(
      PDFName.of("Resources"),
      ctx.obj({ Font: ctx.obj({ F1: font }) }),
    );
    page.node.set(
      PDFName.of("Contents"),
      ctx.register(ctx.flateStream(enc(content))),
    );
  }
  return doc.save();
}

describe("loadDocumentWithEdits（元の PDF に、指定ページの書き換えを順に適用する）", () => {
  it("2 回目以降の書き換えは、それまでの書き換え後のグリフ番号で範囲を指す", async () => {
    const source = await buildFixturePdf(
      ["BT /F1 10 Tf 72 700 Td <3ED53ED6> Tj ET"],
      [612, 792],
    );
    const doc = await loadDocumentWithEdits(source, 0, [
      edit(0, 2, "345"), // 12 → 345
      edit(1, 2, "9"), // 345 の「4」→ 9
    ]);
    expect(textOf(doc)).toBe("395");
  });

  it("書き換えが無ければ元の文書そのままの内容を返す", async () => {
    const source = await buildFixturePdf(
      ["BT /F1 10 Tf 72 700 Td <3ED53ED6> Tj ET"],
      [612, 792],
    );
    const doc = await loadDocumentWithEdits(source, 0, []);
    expect(textOf(doc)).toBe("12");
  });

  it("適用できない書き換えは、理由を日本語で示すエラーになる", async () => {
    const source = await buildFixturePdf(
      ["BT /F1 10 Tf 72 700 Td <3ED53ED6> Tj ET"],
      [612, 792],
    );
    await expect(
      loadDocumentWithEdits(source, 0, [edit(0, 1, "鷗")]),
    ).rejects.toThrow(TextEditError);
    await expect(
      loadDocumentWithEdits(source, 0, [edit(0, 1, "鷗")]),
    ).rejects.toThrow(/「鷗」/);
    await expect(
      loadDocumentWithEdits(source, 0, [edit(5, 9, "1")]),
    ).rejects.toThrow(/範囲/);
  });
});

describe("renderEditedPage（書き換え後のページだけを 1 ページの PDF にする）", () => {
  it("書き換えを適用した 1 ページの PDF を返し、元のページの回転を保つ", async () => {
    const base = await PDFDocument.load(
      await buildFixturePdf(
        ["BT /F1 10 Tf 72 700 Td <3ED53ED6> Tj ET"],
        [612, 792],
      ),
    );
    base.getPage(0).setRotation(degrees(90));
    const bytes = await renderEditedPage(await base.save(), 0, [
      edit(0, 1, "9"),
    ]);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getPage(0).getRotation().angle).toBe(90);
    expect(textOf(doc)).toBe("92");
  });

  it("同じ書体の別フォントが他のページにあれば、それを使って描く（別ページのフォントも取り込む）", async () => {
    const bytes = await renderEditedPage(await twoPageDocument(), 0, [
      edit(1, 2, "9"),
    ]);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    const page = extractPageText(doc, 0);
    expect(page.glyphs.map((g) => g.text).join("")).toBe("19");
    expect(page.glyphs[1]!.fontResource).not.toBe("F1");
  });

  it("同梱フォントが必要な文字は、同梱フォントを渡した場合だけ描ける", async () => {
    const source = await buildFixturePdf(
      ["BT /F1 10 Tf 72 700 Td <3ED53ED6> Tj ET"],
      [612, 792],
    );
    const bytes = await renderEditedPage(source, 0, [edit(0, 1, "鷗")], {
      fallbackFonts: { sans: FALLBACK },
    });
    expect(textOf(await PDFDocument.load(bytes))).toBe("鷗2");
  });
});

describe("previewTextEdit（確定前の確認。文書は変更しない）", () => {
  it("同梱フォントを使う文字を警告として返す", async () => {
    const doc = await PDFDocument.load(
      await buildFixturePdf(
        ["BT /F1 10 Tf 72 700 Td <3ED53ED6> Tj ET"],
        [612, 792],
      ),
    );
    const content = readPageContent(doc, 0).bytes;
    const objects = doc.context.enumerateIndirectObjects().length;
    const result = previewTextEdit(doc, 0, edit(0, 2, "鷗1"), {
      fallbackFonts: { sans: FALLBACK },
    });
    expect(result).toEqual({
      ok: true,
      clipAdjustments: 0,
      warnings: [
        { kind: "fallback-font", replacement: 0, chars: ["鷗"], style: "sans" },
      ],
    });
    expect(readPageContent(doc, 0).bytes).toEqual(content);
    expect(doc.context.enumerateIndirectObjects().length).toBe(objects);
  });

  it("描けない文字は失敗として返す", async () => {
    const doc = await PDFDocument.load(
      await buildFixturePdf(
        ["BT /F1 10 Tf 72 700 Td <3ED53ED6> Tj ET"],
        [612, 792],
      ),
    );
    expect(
      previewTextEdit(doc, 0, edit(0, 1, "漢"), {
        fallbackFonts: { sans: FALLBACK },
      }),
    ).toEqual({
      ok: false,
      failures: [
        {
          kind: "missing-glyphs",
          replacement: 0,
          chars: ["漢"],
          style: "sans",
        },
      ],
    });
  });
});
