// @vitest-environment node
import { describe, it, expect } from "vitest";
import { PDFDocument, PDFName, PDFString } from "pdf-lib";
import { buildOutline, type OutlineSource } from "./outline";

describe("buildOutline（モックで変換ロジックを検証）", () => {
  it("ネストしたツリーと dest 解決（名前付き/明示）を正しく組み立てる", async () => {
    const pageIndexByNum: Record<number, number> = { 2: 0, 5: 3, 8: 7 };
    const source: OutlineSource = {
      getOutline: async () => [
        {
          title: "Chapter 1",
          dest: "chap1", // 名前付き
          items: [
            {
              title: "Section 1.1",
              dest: [{ num: 5, gen: 0 }, { name: "Fit" }], // 明示
              items: [],
            },
          ],
        },
        { title: "Chapter 2", dest: [{ num: 8, gen: 0 }], items: [] },
      ],
      getDestination: async (id) =>
        id === "chap1" ? [{ num: 2, gen: 0 }, { name: "XYZ" }] : null,
      getPageIndex: async (ref) =>
        pageIndexByNum[(ref as { num: number }).num] ?? -1,
    };

    const tree = await buildOutline(source);
    expect(tree).toHaveLength(2);
    expect(tree[0]!.title).toBe("Chapter 1");
    expect(tree[0]!.sourceIndex).toBe(0);
    expect(tree[0]!.children).toHaveLength(1);
    expect(tree[0]!.children[0]!.title).toBe("Section 1.1");
    expect(tree[0]!.children[0]!.sourceIndex).toBe(3);
    expect(tree[1]!.sourceIndex).toBe(7);
  });

  it("dest が無い項目は sourceIndex=null", async () => {
    const source: OutlineSource = {
      getOutline: async () => [{ title: "No dest", dest: null, items: [] }],
      getDestination: async () => null,
      getPageIndex: async () => 0,
    };
    expect((await buildOutline(source))[0]!.sourceIndex).toBeNull();
  });

  it("アウトライン無し（null）は空配列", async () => {
    const source: OutlineSource = {
      getOutline: async () => null,
      getDestination: async () => null,
      getPageIndex: async () => 0,
    };
    expect(await buildOutline(source)).toEqual([]);
  });
});

describe("buildOutline（実 PDF）", () => {
  it("アウトライン無しの実 PDF は空配列", async () => {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await PDFDocument.create();
    doc.addPage([200, 200]);
    const bytes = await doc.save();
    const pdf = await pdfjs.getDocument({ data: bytes, verbosity: 0 }).promise;
    try {
      expect(await buildOutline(pdf)).toEqual([]);
    } finally {
      await pdf.destroy();
    }
  });

  it("アウトライン有りの実 PDF をツリー化しページを解決する", async () => {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const bytes = await makeOutlinePdf();
    const pdf = await pdfjs.getDocument({ data: bytes, verbosity: 0 }).promise;
    try {
      const tree = await buildOutline(pdf);
      expect(tree.map((n) => n.title)).toEqual(["Chapter 1", "Chapter 2"]);
      expect(tree[0]!.sourceIndex).toBe(0);
      expect(tree[1]!.sourceIndex).toBe(2);
    } finally {
      await pdf.destroy();
    }
  });
});

/** pdf-lib 低レベル API で 2 項目のアウトラインを持つ 3 ページ PDF を作る。 */
async function makeOutlinePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const pages = [
    doc.addPage([200, 200]),
    doc.addPage([200, 200]),
    doc.addPage([200, 200]),
  ];
  const ctx = doc.context;
  const outlinesRef = ctx.nextRef();
  const item1Ref = ctx.nextRef();
  const item2Ref = ctx.nextRef();

  ctx.assign(
    item1Ref,
    ctx.obj({
      Title: PDFString.of("Chapter 1"),
      Parent: outlinesRef,
      Dest: ctx.obj([pages[0]!.ref, PDFName.of("Fit")]),
      Next: item2Ref,
    }),
  );
  ctx.assign(
    item2Ref,
    ctx.obj({
      Title: PDFString.of("Chapter 2"),
      Parent: outlinesRef,
      Dest: ctx.obj([pages[2]!.ref, PDFName.of("Fit")]),
      Prev: item1Ref,
    }),
  );
  ctx.assign(
    outlinesRef,
    ctx.obj({
      Type: PDFName.of("Outlines"),
      First: item1Ref,
      Last: item2Ref,
      Count: 2,
    }),
  );
  doc.catalog.set(PDFName.of("Outlines"), outlinesRef);
  return doc.save();
}
