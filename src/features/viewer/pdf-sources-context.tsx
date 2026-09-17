"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { toast } from "sonner";
import { loadPdfDocument } from "@/lib/pdf/pdfjs";
import { EditedPageCache } from "@/lib/pdf/edited-page-cache";
import { loadFallbackFont } from "@/lib/pdf/fallback-font-source";
import type { PageRef } from "@/lib/editor/operations";
import { createId } from "@/lib/id";

/** ページを描画するための文書とページ番号（1 始まり）。 */
export interface PageSource {
  proxy: PDFDocumentProxy;
  pageNumber: number;
}

interface PdfSourcesValue {
  /** sourceId に対応する pdf.js プロキシ（描画用）。 */
  getProxy: (sourceId: string) => PDFDocumentProxy | undefined;
  /** ビルド（出力）用に全ソースのバイト列を返す。 */
  getAllBytes: () => Record<string, Uint8Array>;
  /** バイト列を新しいソースとして登録し、proxy をロードする。 */
  addSource: (bytes: Uint8Array) => Promise<{
    sourceId: string;
    numPages: number;
  }>;
  /**
   * ページの描画元を返す（副作用なし）。テキストの書き換えがあるページは、書き換え後の
   * 1 ページの PDF を使う。まだ作成中なら undefined（`requestPageSource` で作成を始める）。
   * 作成に失敗したページは元のページを返す。
   */
  resolvePageSource: (page: PageRef) => PageSource | undefined;
  /** ページの描画元を用意して返す。 */
  requestPageSource: (page: PageRef) => Promise<PageSource>;
}

const PdfSourcesContext = createContext<PdfSourcesValue | null>(null);

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

export function PdfSourcesProvider({ children }: { children: ReactNode }) {
  const [proxies, setProxies] = useState<Record<string, PDFDocumentProxy>>({});
  const bytesRef = useRef<Record<string, Uint8Array>>({});
  const proxiesRef = useRef<Record<string, PDFDocumentProxy>>({});
  const reportedRef = useRef(new Set<string>());

  // 書き換えたページのプレビュー用 PDF。pdf-lib を含む処理は、書き換えが現れたときに読み込む。
  const [editedPages] = useState(
    () =>
      new EditedPageCache<PDFDocumentProxy>({
        render: async (bytes, pageIndex, edits, options) => {
          const { renderEditedPage } = await import("@/lib/editor/text-edit");
          return renderEditedPage(bytes, pageIndex, edits, options);
        },
        load: (bytes) => loadPdfDocument(toArrayBuffer(bytes)),
        loadFallbackFont,
      }),
  );
  const [editedVersion, setEditedVersion] = useState(0);
  useEffect(
    () => editedPages.subscribe(() => setEditedVersion((v) => v + 1)),
    [editedPages],
  );

  const addSource = useCallback(async (bytes: Uint8Array) => {
    const sourceId = createId("src");
    const proxy = await loadPdfDocument(toArrayBuffer(bytes));
    bytesRef.current[sourceId] = bytes;
    proxiesRef.current[sourceId] = proxy;
    setProxies((prev) => ({ ...prev, [sourceId]: proxy }));
    return { sourceId, numPages: proxy.numPages };
  }, []);

  const getAllBytes = useCallback(() => ({ ...bytesRef.current }), []);

  // アンマウント時に全プロキシを破棄
  useEffect(() => {
    const proxiesForCleanup = proxiesRef.current;
    return () => {
      for (const proxy of Object.values(proxiesForCleanup)) {
        void proxy.destroy();
      }
      editedPages.clear();
    };
  }, [editedPages]);

  const value = useMemo<PdfSourcesValue>(() => {
    const original = (page: PageRef): PageSource | undefined => {
      const proxy = proxies[page.sourceId];
      return proxy ? { proxy, pageNumber: page.sourceIndex + 1 } : undefined;
    };
    const keyOf = (page: PageRef) =>
      EditedPageCache.keyOf(page.sourceId, page.sourceIndex, page.textEdits!);

    return {
      getProxy: (sourceId) => proxies[sourceId],
      getAllBytes,
      addSource,
      resolvePageSource: (page) => {
        if (!page.textEdits?.length) return original(page);
        const key = keyOf(page);
        const proxy = editedPages.get(key);
        if (proxy) return { proxy, pageNumber: 1 };
        return editedPages.failed(key) ? original(page) : undefined;
      },
      requestPageSource: async (page) => {
        const fallback = original(page);
        if (!page.textEdits?.length) {
          if (!fallback) throw new Error("ページを読み込めませんでした");
          return fallback;
        }
        const key = keyOf(page);
        const bytes = bytesRef.current[page.sourceId];
        try {
          if (!bytes) throw new Error("ページを読み込めませんでした");
          const proxy = await editedPages.ensure(
            key,
            bytes,
            page.sourceIndex,
            page.textEdits,
          );
          return { proxy, pageNumber: 1 };
        } catch (err) {
          if (!reportedRef.current.has(key)) {
            reportedRef.current.add(key);
            console.error("書き換えたページの表示に失敗しました", err);
            toast.error(
              "書き換えたページを表示できませんでした（元のページを表示しています）",
            );
          }
          if (!fallback) throw err;
          return fallback;
        }
      },
    };
    // editedVersion: 書き換えたページの作成完了で描画元を更新する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proxies, getAllBytes, addSource, editedPages, editedVersion]);

  return (
    <PdfSourcesContext.Provider value={value}>
      {children}
    </PdfSourcesContext.Provider>
  );
}

export function usePdfSources(): PdfSourcesValue {
  const value = useContext(PdfSourcesContext);
  if (!value) {
    throw new Error("PdfSourcesProvider の外で利用されています");
  }
  return value;
}

/**
 * ページの描画元（書き換えがあれば書き換え後のページ）。用意できるまでは undefined。
 * `page` に undefined を渡すと何もしない（画面外のページなど）。
 */
export function usePageSource(
  page: PageRef | undefined,
): PageSource | undefined {
  const { resolvePageSource, requestPageSource } = usePdfSources();
  const source = page ? resolvePageSource(page) : undefined;
  const missing = page !== undefined && source === undefined;
  useEffect(() => {
    if (missing && page) {
      requestPageSource(page).catch(() => {
        // 失敗は requestPageSource 内で通知済み
      });
    }
  }, [missing, page, requestPageSource]);
  return source;
}
