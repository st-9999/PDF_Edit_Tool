import { PDFDocument, PDFDict, PDFName, PDFString, PDFArray, PDFNumber, PDFHexString, PDFRef } from "pdf-lib";
import type { BookmarkNode } from "@/types/pdf";

/**
 * PDFにしおり（Outline）を埋め込む
 * @param pdfData - 元のPDFデータ
 * @param bookmarks - しおりツリー
 * @returns しおり付きのPDFデータ
 */
export async function addBookmarks(
  pdfData: ArrayBuffer,
  bookmarks: BookmarkNode[]
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfData, { ignoreEncryption: true });
  const context = pdfDoc.context;

  if (bookmarks.length === 0) {
    return pdfDoc.save({ updateFieldAppearances: false });
  }

  const pages = pdfDoc.getPages();

  // Outlines辞書（ルート）を作成
  const outlinesDict = context.obj({
    Type: "Outlines",
  });
  const outlinesRef = context.register(outlinesDict);

  // 再帰的にOutline Itemを作成
  function createOutlineItems(
    nodes: BookmarkNode[],
    parentRef: PDFRef
  ): { firstRef: PDFRef; lastRef: PDFRef; count: number } {
    const refs: PDFRef[] = [];
    let totalCount = 0;

    for (const node of nodes) {
      const itemDict = context.obj({});
      const itemRef = context.register(itemDict);
      refs.push(itemRef);

      // タイトル設定
      itemDict.set(PDFName.of("Title"), PDFHexString.fromText(node.title));

      // Parent設定
      itemDict.set(PDFName.of("Parent"), parentRef);

      // 宛先ページ設定（Dest: [pageRef /Fit]）
      const pageIndex = Math.max(0, Math.min(node.pageNumber - 1, pages.length - 1));
      const pageRef = pages[pageIndex].ref;
      const destArray = PDFArray.withContext(context);
      destArray.push(pageRef);
      destArray.push(PDFName.of("Fit"));
      itemDict.set(PDFName.of("Dest"), destArray);

      // 子ノードがある場合
      if (node.children.length > 0) {
        const childResult = createOutlineItems(node.children, itemRef);
        itemDict.set(PDFName.of("First"), childResult.firstRef);
        itemDict.set(PDFName.of("Last"), childResult.lastRef);
        // 正の値 = 展開状態で表示
        itemDict.set(PDFName.of("Count"), PDFNumber.of(childResult.count));
        totalCount += childResult.count;
      }

      totalCount += 1;
    }

    // Prev/Next リンクの設定
    for (let i = 0; i < refs.length; i++) {
      const dict = context.lookup(refs[i]) as PDFDict;
      if (i > 0) {
        dict.set(PDFName.of("Prev"), refs[i - 1]);
      }
      if (i < refs.length - 1) {
        dict.set(PDFName.of("Next"), refs[i + 1]);
      }
    }

    return {
      firstRef: refs[0],
      lastRef: refs[refs.length - 1],
      count: totalCount,
    };
  }

  const result = createOutlineItems(bookmarks, outlinesRef);
  outlinesDict.set(PDFName.of("First"), result.firstRef);
  outlinesDict.set(PDFName.of("Last"), result.lastRef);
  outlinesDict.set(PDFName.of("Count"), PDFNumber.of(result.count));

  // CatalogにOutlinesを設定
  pdfDoc.catalog.set(PDFName.of("Outlines"), outlinesRef);

  return pdfDoc.save({ updateFieldAppearances: false });
}

/**
 * PDFから既存のしおりを読み取る
 * @param pdfData - PDFデータ
 * @returns しおりツリー（読み取れない場合は空配列）
 */
export async function readBookmarks(
  pdfData: ArrayBuffer
): Promise<BookmarkNode[]> {
  try {
    const pdfDoc = await PDFDocument.load(pdfData, { ignoreEncryption: true });
    const context = pdfDoc.context;
    const pages = pdfDoc.getPages();

    // ページRefからページ番号へのマップを作成
    const pageRefMap = new Map<string, number>();
    pages.forEach((page, index) => {
      pageRefMap.set(page.ref.toString(), index + 1);
    });

    const outlinesRef = pdfDoc.catalog.get(PDFName.of("Outlines"));
    if (!outlinesRef) return [];

    const outlinesDict = context.lookup(outlinesRef) as PDFDict;
    if (!outlinesDict) return [];

    const firstRef = outlinesDict.get(PDFName.of("First"));
    if (!firstRef) return [];

    function readItems(ref: PDFRef | undefined): BookmarkNode[] {
      const result: BookmarkNode[] = [];
      let currentRef = ref;

      while (currentRef) {
        const dict = context.lookup(currentRef) as PDFDict;
        if (!dict) break;

        // タイトル読み取り
        const titleObj = dict.get(PDFName.of("Title"));
        let title = "無題";
        if (titleObj instanceof PDFHexString) {
          title = titleObj.decodeText();
        } else if (titleObj instanceof PDFString) {
          title = titleObj.decodeText();
        }

        // ページ番号読み取り
        let pageNumber = 1;
        const destObj = dict.get(PDFName.of("Dest"));
        if (destObj instanceof PDFArray && destObj.size() > 0) {
          const pageRef = destObj.get(0);
          if (pageRef) {
            const pn = pageRefMap.get(pageRef.toString());
            if (pn !== undefined) pageNumber = pn;
          }
        }

        // 子ノード読み取り
        const childFirstRef = dict.get(PDFName.of("First"));
        const children = childFirstRef
          ? readItems(childFirstRef as PDFRef)
          : [];

        result.push({
          id: `bm-${result.length}-${Date.now()}`,
          title,
          pageNumber,
          children,
        });

        // 次の兄弟へ
        const nextRef = dict.get(PDFName.of("Next"));
        currentRef = nextRef as PDFRef | undefined;
      }

      return result;
    }

    return readItems(firstRef as PDFRef);
  } catch {
    return [];
  }
}
