// @vitest-environment node
import { describe, it, expect } from "vitest";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRef } from "pdf-lib";
import { FallbackFontEmbedder } from "./fallback-font";
import { loadFontModel } from "./font";
import {
  getArray,
  getDict,
  getName,
  getStream,
  streamBytes,
} from "./pdf-objects";
import { parseTrueType, readTableDirectory } from "./truetype";
import { buildTestTrueType, testGlyphBytes } from "./truetype.test-helper";

const IDEOGRAPHIC_SPACE = String.fromCharCode(0x3000);

/** 同梱フォント相当のテスト用 TrueType（GID 1 = 鷗、2 = 7、3 = 全角空白（輪郭なし）、4 = 輪郭の削られた 9）。 */
const FONT = buildTestTrueType({
  outlines: [true, true, true, false, false],
  unicodeBmp: { 0x9dd7: 1, 0x37: 2, 0x3000: 3, 0x39: 4 },
  advanceWidths: [2048, 2048, 1136, 2048, 1136],
  unitsPerEm: 2048,
  ascender: 2376,
  descender: -590,
  bbox: [-1024, -800, 4096, 3000],
  familyName: "Noto Sans JP",
});

function objectCount(doc: PDFDocument) {
  return doc.context.enumerateIndirectObjects().length;
}

function fontDict(doc: PDFDocument, ref: PDFRef): PDFDict {
  return doc.context.lookup(ref, PDFDict);
}

describe("FallbackFontEmbedder（同梱フォントを GID を保った部分埋め込みで文書に組み込む）", () => {
  describe("lookup", () => {
    it("cmap に輪郭のある字形があれば、GID をコードとして幅（1/1000 em）とともに返す", async () => {
      const doc = await PDFDocument.create();
      const embedder = FallbackFontEmbedder.for(doc, FONT);
      expect(embedder.lookup("鷗")).toEqual({ code: 1, width: 1000 });
      expect(embedder.lookup("7")).toEqual({
        code: 2,
        width: 1136 * (1000 / 2048),
      });
    });

    it("空白は輪郭が無くても使え、輪郭の無い文字・cmap に無い文字・1 文字でない入力は null", async () => {
      const doc = await PDFDocument.create();
      const embedder = FallbackFontEmbedder.for(doc, FONT);
      expect(embedder.lookup(IDEOGRAPHIC_SPACE)?.code).toBe(3);
      expect(embedder.lookup("9")).toBeNull();
      expect(embedder.lookup("8")).toBeNull();
      expect(embedder.lookup("鷗鷗")).toBeNull();
    });

    it("文書を変更しない（反映するまでオブジェクトを作らない）", async () => {
      const doc = await PDFDocument.create();
      const before = objectCount(doc);
      const embedder = FallbackFontEmbedder.for(doc, FONT);
      embedder.lookup("鷗");
      expect(objectCount(doc)).toBe(before);
    });

    it("アセント・ディセントを 1/1000 em で返す", async () => {
      const doc = await PDFDocument.create();
      const embedder = FallbackFontEmbedder.for(doc, FONT);
      expect(embedder.ascent).toBeCloseTo(2376 * (1000 / 2048), 6);
      expect(embedder.descent).toBeCloseTo(-590 * (1000 / 2048), 6);
    });
  });

  describe("commit", () => {
    it("Type0 / Identity-H のフォントを作り、使った字形だけを元のバイト列のまま埋め込む", async () => {
      const doc = await PDFDocument.create();
      const embedder = FallbackFontEmbedder.for(doc, FONT);
      const ref = embedder.commit(new Map([[1, "鷗"]]));
      const ctx = doc.context;
      const font = fontDict(doc, ref);

      expect(getName(ctx, font, "Subtype")).toBe("Type0");
      expect(getName(ctx, font, "Encoding")).toBe("Identity-H");
      const cid = ctx.lookup(
        getArray(ctx, font, "DescendantFonts")!.get(0),
        PDFDict,
      );
      expect(getName(ctx, cid, "Subtype")).toBe("CIDFontType2");
      expect(getName(ctx, cid, "CIDToGIDMap")).toBe("Identity");

      const program = streamBytes(
        getStream(ctx, getDict(ctx, cid, "FontDescriptor")!, "FontFile2")!,
      );
      const tt = parseTrueType(program)!;
      expect([0, 1, 2, 3, 4].map((g) => tt.hasOutline(g))).toEqual([
        true,
        true,
        false,
        false,
        false,
      ]);
      const tables = readTableDirectory(program)!;
      expect(tables.has("cmap")).toBe(false);
      // GID 1 の輪郭データが元フォントと一致する（loca は 32 ビット形式）
      const view = new DataView(
        program.buffer,
        program.byteOffset,
        program.byteLength,
      );
      const loca = tables.get("loca")!.offset;
      const glyf = tables.get("glyf")!.offset;
      const start = glyf + view.getUint32(loca + 4);
      expect(program.subarray(start, start + 12)).toEqual(testGlyphBytes(1));
    });

    it("書き込み後のフォントは、ToUnicode と W により元の文字と幅で読める", async () => {
      const doc = await PDFDocument.create();
      const embedder = FallbackFontEmbedder.for(doc, FONT);
      const ref = embedder.commit(
        new Map([
          [1, "鷗"],
          [2, "7"],
        ]),
      );
      const model = loadFontModel(doc.context, "FB", fontDict(doc, ref));
      expect(model.unsupportedReason).toBeNull();
      expect(model.unicode(1)).toBe("鷗");
      expect(model.unicode(2)).toBe("7");
      expect(model.width(1)).toBeCloseTo(1000, 6);
      expect(model.width(2)).toBeCloseTo(1136 * (1000 / 2048), 6);
      expect(model.encode("鷗")).toBe(1);
    });

    it("2 回目の反映では同じフォントに字形を追加し、オブジェクト数を増やさない", async () => {
      const doc = await PDFDocument.create();
      const embedder = FallbackFontEmbedder.for(doc, FONT);
      const first = embedder.commit(new Map([[1, "鷗"]]));
      const count = objectCount(doc);
      const second = embedder.commit(new Map([[2, "7"]]));
      expect(second).toBe(first);
      expect(objectCount(doc)).toBe(count);

      const model = loadFontModel(doc.context, "FB", fontDict(doc, second));
      expect(model.unicode(1)).toBe("鷗");
      expect(model.unicode(2)).toBe("7");
      expect(model.encode("7")).toBe(2);
    });

    it("同じ文書・同じフォントデータには同じ組み込み器を返す", async () => {
      const doc = await PDFDocument.create();
      const other = await PDFDocument.create();
      expect(FallbackFontEmbedder.for(doc, FONT)).toBe(
        FallbackFontEmbedder.for(doc, FONT),
      );
      expect(FallbackFontEmbedder.for(other, FONT)).not.toBe(
        FallbackFontEmbedder.for(doc, FONT),
      );
    });

    it("保存して読み込み直しても、FontFile2 の Length1 と FontBBox（1/1000 em）が正しい", async () => {
      const doc = await PDFDocument.create();
      const ref = FallbackFontEmbedder.for(doc, FONT).commit(
        new Map([[1, "鷗"]]),
      );
      const page = doc.addPage([100, 100]);
      page.node.set(
        PDFName.of("Resources"),
        doc.context.obj({ Font: doc.context.obj({ FB: ref }) }),
      );
      const loaded = await PDFDocument.load(await doc.save());
      const ctx = loaded.context;
      const fonts = ctx.lookup(
        ctx
          .lookup(loaded.getPage(0).node.get(PDFName.of("Resources")), PDFDict)
          .get(PDFName.of("Font")),
        PDFDict,
      );
      const font = ctx.lookup(fonts.get(PDFName.of("FB")), PDFDict);
      const cid = ctx.lookup(
        getArray(ctx, font, "DescendantFonts")!.get(0),
        PDFDict,
      );
      const descriptor = getDict(ctx, cid, "FontDescriptor")!;
      const stream = getStream(ctx, descriptor, "FontFile2")!;
      const length1 = stream.dict.get(PDFName.of("Length1"));
      expect(Number(length1?.toString())).toBe(streamBytes(stream).length);
      const bbox = getArray(ctx, descriptor, "FontBBox")!;
      expect(bbox).toBeInstanceOf(PDFArray);
      expect(bbox.asArray().map((n) => Number(n.toString()))).toEqual([
        -500, -390.625, 2000, 1464.84375,
      ]);
    });
  });
});
