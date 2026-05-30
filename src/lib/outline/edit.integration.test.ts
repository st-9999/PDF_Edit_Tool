// @vitest-environment node
import { describe, it, expect } from "vitest";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRef } from "pdf-lib";
import { buildPdf, type SourceBytes } from "@/lib/editor/build";
import type { PageRef } from "@/lib/editor/operations";
import {
  addNode,
  createNode,
  indent,
  renameNode,
  toBuildNodes,
  type EditableOutlineNode,
} from "./edit";

/** 各ページ幅を一意にして出力側から元ページを同定できるソースを作る。 */
async function makeSource(widths: number[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  widths.forEach((w) => doc.addPage([w, 400]));
  return doc.save();
}

interface ReadNode {
  title: string;
  page: number | null;
  children: ReadNode[];
}

/** 出力 PDF の /Outlines を {title, page(0始まり|null), children} で読み出す。 */
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

describe("しおり編集 → 保存（編集ツリー → buildPdf）の統合", () => {
  it("追加・リネーム・インデントの結果が出力 /Outlines に反映される", async () => {
    const sources: SourceBytes = { A: await makeSource([210, 220, 230]) };
    const pages: PageRef[] = [
      { id: "p0", sourceId: "A", sourceIndex: 0, rotation: 0 },
      { id: "p1", sourceId: "A", sourceIndex: 1, rotation: 0 },
      { id: "p2", sourceId: "A", sourceIndex: 2, rotation: 0 },
    ];

    // baseline: 第1章(→0) のみ
    let tree: EditableOutlineNode[] = [
      createNode({ title: "第1章", sourceId: "A", sourceIndex: 0 }),
    ];
    const chapter1Id = tree[0]!.id;

    // 追加: 「第2章」(→2) を第1章の後ろへ
    const ch2 = createNode({
      title: "第2章(仮)",
      sourceId: "A",
      sourceIndex: 2,
    });
    tree = addNode(tree, chapter1Id, ch2);
    // リネーム: 「第2章(仮)」→「第2章」
    tree = renameNode(tree, ch2.id, "第2章");
    // 追加 + インデント: 「1.1 節」(→1) を第1章のサブ項目にする
    const sec = createNode({ title: "1.1 節", sourceId: "A", sourceIndex: 1 });
    tree = addNode(tree, chapter1Id, sec); // いったん第1章の弟として挿入
    tree = indent(tree, sec.id); // 第1章の子へ降格

    const out = await buildPdf(sources, pages, { outline: toBuildNodes(tree) });
    const result = await readOutline(out);

    expect(result.map((n) => n.title)).toEqual(["第1章", "第2章"]);
    expect(result[0]!.page).toBe(0);
    expect(result[0]!.children.map((c) => c.title)).toEqual(["1.1 節"]);
    expect(result[0]!.children[0]!.page).toBe(1);
    expect(result[1]!.page).toBe(2);
  });
});
