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
import { loadPdfDocument } from "@/lib/pdf/pdfjs";
import { createId } from "@/lib/id";

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
}

const PdfSourcesContext = createContext<PdfSourcesValue | null>(null);

export function PdfSourcesProvider({ children }: { children: ReactNode }) {
  const [proxies, setProxies] = useState<Record<string, PDFDocumentProxy>>({});
  const bytesRef = useRef<Record<string, Uint8Array>>({});
  const proxiesRef = useRef<Record<string, PDFDocumentProxy>>({});

  const addSource = useCallback(async (bytes: Uint8Array) => {
    const sourceId = createId("src");
    const buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    const proxy = await loadPdfDocument(buffer);
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
    };
  }, []);

  const value = useMemo<PdfSourcesValue>(
    () => ({
      getProxy: (sourceId) => proxies[sourceId],
      getAllBytes,
      addSource,
    }),
    [proxies, getAllBytes, addSource],
  );

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
