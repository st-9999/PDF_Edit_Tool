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

    // Destination配列からページ番号を解決するヘルパー
    function resolvePageNumber(destArray: PDFArray): number {
      if (destArray.size() === 0) return 1;
      let pageRef = destArray.get(0);
      // 間接参照の場合はlookupで解決
      if (pageRef instanceof PDFRef) {
        const resolved = context.lookup(pageRef);
        // lookupしてもPDFRefのまま → toString()でマップ検索
        // lookupした結果がPDFDictならそのrefで検索
        const key = pageRef.toString();
        const pn = pageRefMap.get(key);
        if (pn !== undefined) return pn;
        // resolvedがページオブジェクトの場合、ref文字列が異なることがある
        if (resolved) {
          const resolvedKey = resolved.toString();
          const pn2 = pageRefMap.get(resolvedKey);
          if (pn2 !== undefined) return pn2;
        }
      }
      if (pageRef) {
        const pn = pageRefMap.get(pageRef.toString());
        if (pn !== undefined) return pn;
      }
      return 1;
    }

    // Outline itemからDestination配列を取得するヘルパー
    function getDestArray(dict: PDFDict): PDFArray | null {
      // パターン1: /Dest に直接配列
      const destObj = dict.get(PDFName.of("Dest"));
      if (destObj) {
        // 直接PDFArrayの場合
        if (destObj instanceof PDFArray) return destObj;
        // 間接参照の場合 → lookupして配列を得る
        if (destObj instanceof PDFRef) {
          const resolved = context.lookup(destObj);
          if (resolved instanceof PDFArray) return resolved;
        }
      }

      // パターン2: /A (Action辞書) → /S が /GoTo → /D にDestination
      const actionObj = dict.get(PDFName.of("A"));
      if (actionObj) {
        const actionDict = (actionObj instanceof PDFRef
          ? context.lookup(actionObj)
          : actionObj) as PDFDict;
        if (actionDict && typeof actionDict.get === "function") {
          const sObj = actionDict.get(PDFName.of("S"));
          if (sObj instanceof PDFName && sObj.decodeText() === "GoTo") {
            const dObj = actionDict.get(PDFName.of("D"));
            if (dObj instanceof PDFArray) return dObj;
            if (dObj instanceof PDFRef) {
              const resolved = context.lookup(dObj);
              if (resolved instanceof PDFArray) return resolved;
            }
          }
        }
      }

      return null;
    }

    let nodeCounter = 0;

    function readItems(ref: PDFRef | undefined): BookmarkNode[] {
      const result: BookmarkNode[] = [];
      let currentRef = ref;

      while (currentRef) {
        const dict = context.lookup(currentRef) as PDFDict;
        if (!dict || typeof dict.get !== "function") break;

        // タイトル読み取り
        let titleRaw = dict.get(PDFName.of("Title"));
        if (titleRaw instanceof PDFRef) {
          titleRaw = context.lookup(titleRaw);
        }
        let title = "無題";
        if (titleRaw instanceof PDFHexString) {
          title = titleRaw.decodeText();
        } else if (titleRaw instanceof PDFString) {
          title = titleRaw.decodeText();
        }

        // ページ番号読み取り
        let pageNumber = 1;
        const destArray = getDestArray(dict);
        if (destArray) {
          pageNumber = resolvePageNumber(destArray);
        }

        // 子ノード読み取り
        const childFirstRef = dict.get(PDFName.of("First"));
        const children = childFirstRef
          ? readItems(childFirstRef as PDFRef)
          : [];

        nodeCounter++;
        result.push({
          id: `bm-${nodeCounter}-${Date.now()}`,
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
