// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRef,
  degrees,
} from "pdf-lib";
import {
  buildPdf,
  extractPages,
  splitPdf,
  type BuildOutlineNode,
  type SourceBytes,
} from "./build";
import type { PageRef } from "./operations";

/** 各ページ幅を一意にして「元のどのページか」を出力側から識別できるソースを作る。 */
async function makeSource(
  widths: number[],
  rotations: number[] = [],
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  widths.forEach((w, i) => {
    const page = doc.addPage([w, 400]);
    if (rotations[i]) page.setRotation(degrees(rotations[i]!));
  });
  return doc.save();
}

const mk = (
  sourceId: string,
  sourceIndex: number,
  rotation = 0,
  id = `${sourceId}-${sourceIndex}`,
): PageRef => ({ id, sourceId, sourceIndex, rotation });

async function inspect(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  return {
    count: doc.getPageCount(),
    widths: doc.getPages().map((p) => Math.round(p.getSize().width)),
    rotations: doc.getPages().map((p) => p.getRotation().angle),
  };
}

describe("buildPdf", () => {
  it("PageRef の並び順どおりにページを構築する", async () => {
    const sources: SourceBytes = { A: await makeSource([210, 220, 230]) };
    const out = await buildPdf(sources, [mk("A", 2), mk("A", 0), mk("A", 1)]);
    const { count, widths } = await inspect(out);
    expect(count).toBe(3);
    expect(widths).toEqual([230, 210, 220]);
  });

  it("ユーザー回転を元の回転に加算してページ辞書へ反映する", async () => {
    // 元ページ[1] は既に 90 度回転。ユーザー +90 で 180 になる。
    const sources: SourceBytes = {
      A: await makeSource([210, 220], [0, 90]),
    };
    const out = await buildPdf(sources, [mk("A", 0, 90), mk("A", 1, 90)]);
    const { rotations } = await inspect(out);
    expect(rotations).toEqual([90, 180]);
  });

  it("削除（部分集合のビルド）で総ページ数が減る", async () => {
    const sources: SourceBytes = { A: await makeSource([210, 220, 230]) };
    const out = await buildPdf(sources, [mk("A", 0), mk("A", 2)]);
    const { count, widths } = await inspect(out);
    expect(count).toBe(2);
    expect(widths).toEqual([210, 230]);
  });

  it("空ページ列はエラー", async () => {
    await expect(buildPdf({}, [])).rejects.toThrow();
  });
});

describe("extractPages", () => {
  it("選択 ID のページのみを現在順で抽出する", async () => {
    const sources: SourceBytes = { A: await makeSource([210, 220, 230, 240]) };
    const pages = [mk("A", 0), mk("A", 1), mk("A", 2), mk("A", 3)];
    const out = await extractPages(sources, pages, ["A-1", "A-3"]);
    const { count, widths } = await inspect(out);
    expect(count).toBe(2);
    expect(widths).toEqual([220, 240]);
  });
});

describe("splitPdf", () => {
  it("境界の前で分割し、各セグメントを生成する", async () => {
    const sources: SourceBytes = {
      A: await makeSource([210, 220, 230, 240, 250]),
    };
    const pages = [0, 1, 2, 3, 4].map((i) => mk("A", i));
    const parts = await splitPdf(sources, pages, [3]); // 1-2 と 3-5
    expect(parts).toHaveLength(2);
    expect((await inspect(parts[0]!)).widths).toEqual([210, 220]);
    expect((await inspect(parts[1]!)).widths).toEqual([230, 240, 250]);
  });

  it("複数境界・範囲外は無視して分割", async () => {
    const sources: SourceBytes = {
      A: await makeSource([210, 220, 230, 240, 250]),
    };
    const pages = [0, 1, 2, 3, 4].map((i) => mk("A", i));
    const parts = await splitPdf(sources, pages, [2, 4, 99, 1]);
    expect(parts.map((p) => p)).toHaveLength(3); // 1 / 2-3 / 4-5
    expect((await inspect(parts[0]!)).widths).toEqual([210]);
    expect((await inspect(parts[1]!)).widths).toEqual([220, 230]);
    expect((await inspect(parts[2]!)).widths).toEqual([240, 250]);
  });
});

/** 出力 PDF のしおり（/Outlines）を {title, page(0始まり|null), children} のツリーで読み出す。 */
interface ReadNode {
  title: string;
  page: number | null;
  children: ReadNode[];
}
async function readOutline(bytes: Uint8Array): Promise<ReadNode[]> {
  const doc = await PDFDocument.load(bytes);
  const outlinesRef = doc.catalog.get(PDFName.of("Outlines"));
  if (!(outlinesRef instanceof PDFRef)) return [];
  const pageTags = doc.getPages().map((p) => p.ref.tag);
  const asRef = (v: unknown): PDFRef | undefined =>
    v instanceof PDFRef ? v : undefined;

  const readSiblings = (firstRef: PDFRef): ReadNode[] => {
    const out: ReadNode[] = [];
    let ref: PDFRef | undefined = firstRef;
    while (ref) {
      const dict = doc.context.lookup(ref, PDFDict);
      const title = (
        dict.lookup(PDFName.of("Title")) as unknown as { decodeText(): string }
      ).decodeText();
      let page: number | null = null;
      const dest = dict.lookupMaybe(PDFName.of("Dest"), PDFArray);
      if (dest) {
        const target = dest.get(0) as { tag?: string } | undefined;
        const idx = target?.tag ? pageTags.indexOf(target.tag) : -1;
        page = idx >= 0 ? idx : null;
      }
      const first = asRef(dict.get(PDFName.of("First")));
      out.push({ title, page, children: first ? readSiblings(first) : [] });
      ref = asRef(dict.get(PDFName.of("Next")));
    }
    return out;
  };

  const outlines = doc.context.lookup(outlinesRef, PDFDict);
  const first = asRef(outlines.get(PDFName.of("First")));
  return first ? readSiblings(first) : [];
}

const OUTLINE: BuildOutlineNode[] = [
  {
    title: "第1章 はじめに",
    sourceId: "A",
    sourceIndex: 0,
    children: [
      { title: "Section 1.1", sourceId: "A", sourceIndex: 1, children: [] },
    ],
  },
  { title: "Chapter 2", sourceId: "A", sourceIndex: 2, children: [] },
];

describe("buildPdf: しおり（アウトライン）保存", () => {
  it("元の並びでしおりを出力に書き戻し、宛先ページが一致する", async () => {
    const sources: SourceBytes = { A: await makeSource([210, 220, 230]) };
    const out = await buildPdf(sources, [mk("A", 0), mk("A", 1), mk("A", 2)], {
      outline: OUTLINE,
    });
    const tree = await readOutline(out);
    expect(tree.map((n) => n.title)).toEqual(["第1章 はじめに", "Chapter 2"]);
    expect(tree[0]!.page).toBe(0); // 第1章 → 出力 0 ページ目
    expect(tree[0]!.children.map((c) => c.title)).toEqual(["Section 1.1"]);
    expect(tree[0]!.children[0]!.page).toBe(1); // Section 1.1 → 1 ページ目
    expect(tree[1]!.page).toBe(2); // Chapter 2 → 2 ページ目（日本語含めタイトル保持）
  });

  it("並べ替え後はしおりの宛先が新しいページ位置に追従する", async () => {
    const sources: SourceBytes = { A: await makeSource([210, 220, 230]) };
    // 出力順: 元ページ 2,0,1
    const out = await buildPdf(sources, [mk("A", 2), mk("A", 0), mk("A", 1)], {
      outline: OUTLINE,
    });
    const tree = await readOutline(out);
    expect(tree[0]!.page).toBe(1); // 元0ページ目 → 出力1番目
    expect(tree[0]!.children[0]!.page).toBe(2); // 元1ページ目 → 出力2番目
    expect(tree[1]!.page).toBe(0); // 元2ページ目 → 出力0番目
  });

  it("宛先ページが削除されたしおりは宛先なしの見出しとして残る", async () => {
    const sources: SourceBytes = { A: await makeSource([210, 220, 230]) };
    // 元ページ 1 を削除（Section 1.1 の宛先が消える）
    const out = await buildPdf(sources, [mk("A", 0), mk("A", 2)], {
      outline: OUTLINE,
    });
    const tree = await readOutline(out);
    expect(tree[0]!.page).toBe(0);
    expect(tree[0]!.children[0]!.title).toBe("Section 1.1");
    expect(tree[0]!.children[0]!.page).toBeNull(); // 宛先なし
    expect(tree[1]!.page).toBe(1); // Chapter 2 → 出力1番目
  });

  it("outline 未指定なら /Outlines を書き込まない（従来どおり）", async () => {
    const sources: SourceBytes = { A: await makeSource([210, 220]) };
    const out = await buildPdf(sources, [mk("A", 0), mk("A", 1)]);
    expect(await readOutline(out)).toEqual([]);
  });
});

describe("buildPdf: 複数ソース結合", () => {
  it("2 つのソースを交互に結合して総ページ数・順序が正しい", async () => {
    const sources: SourceBytes = {
      A: await makeSource([210, 220]),
      B: await makeSource([310, 320]),
    };
    const out = await buildPdf(sources, [
      mk("A", 0),
      mk("B", 0),
      mk("A", 1),
      mk("B", 1),
    ]);
    const { count, widths } = await inspect(out);
    expect(count).toBe(4);
    expect(widths).toEqual([210, 310, 220, 320]);
  });
});
