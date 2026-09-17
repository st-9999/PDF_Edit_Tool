// @vitest-environment node
import { describe, it, expect } from "vitest";
import { PDFDict, PDFDocument, PDFName, PDFRef } from "pdf-lib";
import { loadFontModel } from "./font";
import type { FallbackFonts } from "./font-style";
import { extractPageText, readPageContent, type PageText } from "./page-text";
import { cidFontWithProgram, enc } from "./pdf-fixtures.test-helper";
import { getArray, getDict, getStream, streamBytes } from "./pdf-objects";
import { compareWithOracle, pdfjsTextItems } from "./pdfjs-oracle.test-helper";
import { replacePageText, type TextAlign } from "./rewrite";
import type { PageGlyph } from "./text-layout";
import { parseTrueType } from "./truetype";
import { buildTestTrueType } from "./truetype.test-helper";

const textOf = (glyphs: PageGlyph[]) =>
  glyphs.map((g) => g.text ?? "?").join("");

/** 同梱の明朝体相当（「鷗」GID 1・「7」GID 2 を持つ）。 */
const FALLBACK = buildTestTrueType({
  outlines: [true, true, true],
  unicodeBmp: { 0x9dd7: 1, 0x37: 2 },
  advanceWidths: [1000, 1000, 560],
  unitsPerEm: 1000,
  ascender: 1160,
  descender: -288,
  familyName: "Noto Serif JP",
});

/** 同梱のゴシック体相当（「鷗」GID 1 を持つ）。 */
const FALLBACK_SANS = buildTestTrueType({
  outlines: [true, true],
  unicodeBmp: { 0x9dd7: 1 },
  advanceWidths: [1000, 1000],
  unitsPerEm: 1000,
  familyName: "Noto Sans JP",
});

/**
 * 明朝相当の元フォント（A）: ToUnicode は「1」「2」のみ。
 * cmap には「7」（GID 3、輪郭あり、幅 600）もあるが ToUnicode に無い。「9」は無い。
 */
function fontA(ctx: PDFDocument["context"]) {
  return cidFontWithProgram(ctx, {
    toUnicode: { 1: "1", 2: "2" },
    outlines: [false, true, true, true, false, false],
    widths: { 1: 500, 2: 500 },
    baseFont: "AAAAAA+MS-Mincho",
    program: {
      unicodeBmp: { 0x31: 1, 0x32: 2, 0x37: 3 },
      advanceWidths: [0, 500, 500, 600, 500, 500],
      familyName: "MS Mincho",
    },
  });
}

/** A と同じ書体の別サブセット（B）: 「9」（CID 5）を持つ。 */
function fontB(ctx: PDFDocument["context"]) {
  return cidFontWithProgram(ctx, {
    toUnicode: { 5: "9" },
    outlines: [false, false, false, false, false, true],
    widths: { 5: 500 },
    baseFont: "CIDFont+F1",
    program: {
      unicodeBmp: { 0x39: 5 },
      advanceWidths: [0, 500, 500, 600, 500, 500],
      familyName: "MS Mincho",
    },
  });
}

/** 1 ページ目に A（F1）、2 ページ目に B（G1）を使う文書。 */
async function buildDoc(
  page0: string,
  opts: { shareBOnPage0As?: string } = {},
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const ctx = doc.context;
  const a = ctx.register(fontA(ctx));
  const b = ctx.register(fontB(ctx));
  const fonts0: Record<string, PDFRef> = { F1: a };
  if (opts.shareBOnPage0As) fonts0[opts.shareBOnPage0As] = b;
  const p0 = doc.addPage([612, 792]);
  p0.node.set(PDFName.of("Resources"), ctx.obj({ Font: ctx.obj(fonts0) }));
  p0.node.set(
    PDFName.of("Contents"),
    ctx.register(ctx.flateStream(enc(page0))),
  );
  const p1 = doc.addPage([612, 792]);
  p1.node.set(PDFName.of("Resources"), ctx.obj({ Font: ctx.obj({ G1: b }) }));
  p1.node.set(
    PDFName.of("Contents"),
    ctx.register(ctx.flateStream(enc("BT /G1 10 Tf 72 700 Td <0005> Tj ET"))),
  );
  return doc.save();
}

const LINE =
  "BT /F1 10 Tf 1 0 0 1 100 700 Tm <00010002> Tj ET BT /F1 10 Tf 1 0 0 1 100 680 Tm <0001> Tj ET";

async function rewrite(
  bytes: Uint8Array,
  needle: string,
  text: string,
  align: TextAlign,
  fallbackFonts?: FallbackFonts,
) {
  const doc = await PDFDocument.load(bytes);
  const before = extractPageText(doc, 0);
  const at = textOf(before.glyphs).indexOf(needle);
  expect(at).toBeGreaterThanOrEqual(0);
  const result = replacePageText(
    doc,
    0,
    [{ start: at, end: at + needle.length, text, align }],
    { fallbackFonts },
  );
  const saved = await doc.save();
  const reloaded = await PDFDocument.load(saved);
  return {
    before,
    after: extractPageText(reloaded, 0),
    result,
    saved,
    reloaded,
  };
}

function pageFonts(doc: PDFDocument, pageIndex: number): PDFDict {
  const ctx = doc.context;
  const resources = ctx.lookup(
    doc.getPage(pageIndex).node.Resources(),
    PDFDict,
  );
  return getDict(ctx, resources, "Font")!;
}

const tfOperands = (page: PageText) =>
  page.content.operations
    .filter((o) => o.operator === "Tf")
    .map((o) => (o.operands[0]!.kind === "name" ? o.operands[0]!.value : ""));

describe("replacePageText（元のフォントに無い文字の補完）", () => {
  it("同じフォントの cmap に字形があれば、ToUnicode と W に追記して同じフォントのまま描く", async () => {
    const { after, result, reloaded } = await rewrite(
      await buildDoc(LINE),
      "12",
      "17",
      "left",
    );
    expect(result).toEqual({ ok: true, clipAdjustments: 0, warnings: [] });
    expect(textOf(after.glyphs)).toBe("171");
    // フォントを切り替えていない
    expect(tfOperands(after)).toEqual(["F1", "F1"]);
    const ctx = reloaded.context;
    const model = loadFontModel(
      ctx,
      "F1",
      ctx.lookup(pageFonts(reloaded, 0).get(PDFName.of("F1")), PDFDict),
    );
    expect(model.unicode(3)).toBe("7");
    expect(model.unicode(1)).toBe("1"); // 既存の対応は残る
    expect(model.width(3)).toBe(600);
    expect(after.glyphs[1]!.width).toBe(600);
  });

  it("同じ書体の別フォント（他ページ）が持っていれば、リソースに加えて Tf を切り替えて描く", async () => {
    const { before, after, result, reloaded } = await rewrite(
      await buildDoc(LINE),
      "12",
      "19",
      "right",
    );
    expect(result).toEqual({ ok: true, clipAdjustments: 0, warnings: [] });
    expect(textOf(after.glyphs)).toBe("191");
    const fonts = pageFonts(reloaded, 0);
    const added = tfOperands(after).find((n) => n !== "F1")!;
    expect(added).toBeDefined();
    // 追加したリソースは 2 ページ目のフォント B そのもの
    const page1Font = pageFonts(reloaded, 1).get(PDFName.of("G1"));
    expect(fonts.get(PDFName.of(added))).toEqual(page1Font);
    // 切り替えた後は元のフォントに戻す
    expect(tfOperands(after)).toEqual(["F1", added, "F1", "F1"]);
    expect(after.glyphs[1]!.fontResource).toBe(added);
    // 右揃え: 右端と、次の行の文字は動かない
    const end = (g: PageGlyph) => g.x + g.advance;
    expect(end(after.glyphs[1]!)).toBeCloseTo(end(before.glyphs[1]!), 6);
    expect([after.glyphs[2]!.x, after.glyphs[2]!.y]).toEqual([
      before.glyphs[2]!.x,
      before.glyphs[2]!.y,
    ]);
  });

  it("同じ書体の別フォントがすでにこのページのリソースにあれば、その名前を使う", async () => {
    const { after } = await rewrite(
      await buildDoc(LINE, { shareBOnPage0As: "F9" }),
      "12",
      "19",
      "left",
    );
    expect(tfOperands(after)).toEqual(["F1", "F9", "F1", "F1"]);
  });

  it("文書内のどのフォントにも無い文字は、同梱フォントを組み込んで描き、警告を返す", async () => {
    const { after, result, reloaded } = await rewrite(
      await buildDoc(LINE),
      "2",
      "鷗",
      "left",
      { serif: FALLBACK },
    );
    expect(result).toEqual({
      ok: true,
      clipAdjustments: 0,
      warnings: [
        {
          kind: "fallback-font",
          replacement: 0,
          chars: ["鷗"],
          style: "serif",
        },
      ],
    });
    expect(textOf(after.glyphs)).toBe("1鷗1");
    const name = after.glyphs[1]!.fontResource;
    const ctx = reloaded.context;
    const dict = ctx.lookup(
      pageFonts(reloaded, 0).get(PDFName.of(name)),
      PDFDict,
    );
    const model = loadFontModel(ctx, name, dict);
    expect(model.typefaceKey?.startsWith("Noto Serif JP|")).toBe(true);
    // 埋め込まれた字形は使った GID（と .notdef）だけ
    const cid = ctx.lookup(
      getArray(ctx, dict, "DescendantFonts")!.get(0),
      PDFDict,
    );
    const program = parseTrueType(
      streamBytes(
        getStream(ctx, getDict(ctx, cid, "FontDescriptor")!, "FontFile2")!,
      ),
    )!;
    expect([0, 1, 2].map((g) => program.hasOutline(g))).toEqual([
      true,
      true,
      false,
    ]);
  });

  it("同梱フォントが指定されていなければ、描けない文字として失敗する（必要な書体を返す）", async () => {
    const { result } = await rewrite(await buildDoc(LINE), "2", "鷗", "left");
    expect(result).toEqual({
      ok: false,
      failures: [
        {
          kind: "missing-glyphs",
          replacement: 0,
          chars: ["鷗"],
          style: "serif",
        },
      ],
    });
  });

  it("元のフォントと違う書体の同梱フォントでは描かない（明朝体の文字にゴシック体だけを渡すと失敗する）", async () => {
    const { result } = await rewrite(await buildDoc(LINE), "2", "鷗", "left", {
      sans: FALLBACK_SANS,
    });
    expect(result).toEqual({
      ok: false,
      failures: [
        {
          kind: "missing-glyphs",
          replacement: 0,
          chars: ["鷗"],
          style: "serif",
        },
      ],
    });
  });

  it("同じページの明朝体とゴシック体の文字を、それぞれ同じ書体の同梱フォントで描く", async () => {
    const doc = await PDFDocument.create();
    const ctx = doc.context;
    const gothic = cidFontWithProgram(ctx, {
      toUnicode: { 1: "1", 2: "2" },
      outlines: [false, true, true],
      widths: { 1: 500, 2: 500 },
      baseFont: "AAAAAB+MS-Gothic",
      program: {
        unicodeBmp: { 0x31: 1, 0x32: 2 },
        advanceWidths: [0, 500, 500],
        familyName: "MS Gothic",
      },
    });
    const page = doc.addPage([612, 792]);
    page.node.set(
      PDFName.of("Resources"),
      ctx.obj({
        Font: ctx.obj({
          F1: ctx.register(fontA(ctx)),
          F2: ctx.register(gothic),
        }),
      }),
    );
    page.node.set(
      PDFName.of("Contents"),
      ctx.register(
        ctx.flateStream(
          enc(
            "BT /F1 10 Tf 1 0 0 1 100 700 Tm <0001> Tj ET BT /F2 10 Tf 1 0 0 1 100 680 Tm <0002> Tj ET",
          ),
        ),
      ),
    );
    const loaded = await PDFDocument.load(await doc.save());
    const result = replacePageText(
      loaded,
      0,
      [
        { start: 0, end: 1, text: "鷗", align: "left" },
        { start: 1, end: 2, text: "鷗", align: "left" },
      ],
      { fallbackFonts: { serif: FALLBACK, sans: FALLBACK_SANS } },
    );
    expect(result).toEqual({
      ok: true,
      clipAdjustments: 0,
      warnings: [
        {
          kind: "fallback-font",
          replacement: 0,
          chars: ["鷗"],
          style: "serif",
        },
        { kind: "fallback-font", replacement: 1, chars: ["鷗"], style: "sans" },
      ],
    });
    const reloaded = await PDFDocument.load(await loaded.save());
    const after = extractPageText(reloaded, 0);
    expect(textOf(after.glyphs)).toBe("鷗鷗");
    const familyOf = (resource: string) =>
      loadFontModel(
        reloaded.context,
        resource,
        reloaded.context.lookup(
          pageFonts(reloaded, 0).get(PDFName.of(resource)),
          PDFDict,
        ),
      ).typefaceKey?.split("|")[0];
    expect(after.glyphs.map((g) => familyOf(g.fontResource))).toEqual([
      "Noto Serif JP",
      "Noto Sans JP",
    ]);
  });

  it("元のフォントで描ける文字は同梱フォントより優先する（cmap 経由でも）", async () => {
    const { result, after } = await rewrite(
      await buildDoc(LINE),
      "2",
      "7",
      "left",
      { serif: FALLBACK },
    );
    expect(result.ok && result.warnings).toEqual([]);
    expect(tfOperands(after)).toEqual(["F1", "F1"]);
  });

  it("1 つの置換に複数の補完方法が混ざっても、文字列・後続の位置・pdf.js の抽出が正しい", async () => {
    const { before, after, saved, result } = await rewrite(
      await buildDoc(LINE),
      "12",
      "7鷗9",
      "left",
      { serif: FALLBACK },
    );
    expect(result.ok).toBe(true);
    expect(textOf(after.glyphs)).toBe("7鷗91");
    expect([after.glyphs[3]!.x, after.glyphs[3]!.y]).toEqual([
      before.glyphs[2]!.x,
      before.glyphs[2]!.y,
    ]);
    const oracle = compareWithOracle(
      await pdfjsTextItems(saved, 1),
      after.glyphs,
    );
    expect(oracle.expectedText).toBe("7鷗91");
    expect(oracle.actualText).toBe(oracle.expectedText);
    expect(oracle.positionMismatches).toEqual([]);
  });

  it("同じ文書で繰り返し書き換えても、同梱フォントは 1 つにまとめる", async () => {
    const doc = await PDFDocument.load(await buildDoc(LINE));
    const first = extractPageText(doc, 0);
    expect(
      replacePageText(
        doc,
        0,
        [{ start: 1, end: 2, text: "鷗", align: "left" }],
        {
          fallbackFonts: { serif: FALLBACK },
        },
      ).ok,
    ).toBe(true);
    const second = extractPageText(doc, 0);
    expect(textOf(first.glyphs)).toBe("121");
    expect(
      replacePageText(
        doc,
        0,
        [{ start: 2, end: 3, text: "鷗", align: "left" }],
        {
          fallbackFonts: { serif: FALLBACK },
        },
      ).ok,
    ).toBe(true);
    const third = extractPageText(await PDFDocument.load(await doc.save()), 0);
    expect(textOf(third.glyphs)).toBe("1鷗鷗");
    expect(new Set(third.glyphs.slice(1).map((g) => g.fontResource)).size).toBe(
      1,
    );
    expect(second.glyphs[1]!.fontResource).toBe(third.glyphs[2]!.fontResource);
  });

  it("1 件でも失敗すれば、フォント辞書・リソース・コンテンツのどれも変更しない", async () => {
    const doc = await PDFDocument.load(await buildDoc(LINE));
    const ctx = doc.context;
    const content = readPageContent(doc, 0).bytes;
    const fontKeys = pageFonts(doc, 0)
      .keys()
      .map((k) => k.toString());
    const objects = ctx.enumerateIndirectObjects().length;
    const a = ctx.lookup(pageFonts(doc, 0).get(PDFName.of("F1")), PDFDict);
    const toUnicodeBefore = streamBytes(getStream(ctx, a, "ToUnicode")!);

    const result = replacePageText(
      doc,
      0,
      [
        { start: 0, end: 1, text: "7", align: "left" }, // cmap 経由（ToUnicode 追記が必要）
        { start: 1, end: 2, text: "9鷗", align: "left" }, // 別フォント＋同梱フォント
        { start: 2, end: 3, text: "漢", align: "left" }, // どこにも無い
      ],
      { fallbackFonts: { serif: FALLBACK } },
    );
    expect(result).toEqual({
      ok: false,
      failures: [
        {
          kind: "missing-glyphs",
          replacement: 2,
          chars: ["漢"],
          style: "serif",
        },
      ],
    });
    expect(readPageContent(doc, 0).bytes).toEqual(content);
    expect(
      pageFonts(doc, 0)
        .keys()
        .map((k) => k.toString()),
    ).toEqual(fontKeys);
    expect(ctx.enumerateIndirectObjects().length).toBe(objects);
    expect(streamBytes(getStream(ctx, a, "ToUnicode")!)).toEqual(
      toUnicodeBefore,
    );
  });
});
