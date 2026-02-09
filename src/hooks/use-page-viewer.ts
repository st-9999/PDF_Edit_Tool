"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { loadPdfDocument, renderPageThumbnail } from "@/lib/pdf/thumbnail";

const CACHE_MAX = 10;

interface UsePageViewerOptions {
  sourceFile: File | null;
  active: boolean;
}

export interface UsePageViewerReturn {
  renderPage: (pageNumber: number) => Promise<string | null>;
  pdfDoc: PDFDocumentProxy | null;
  loading: boolean;
  totalPages: number;
}

export function usePageViewer({
  sourceFile,
  active,
}: UsePageViewerOptions): UsePageViewerReturn {
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  const cacheRef = useRef<Map<number, string>>(new Map());
  const [loading, setLoading] = useState(false);
  const [totalPages, setTotalPages] = useState(0);

  // Load / destroy PDF document based on active flag
  useEffect(() => {
    if (!active || !sourceFile) {
      if (pdfDocRef.current) {
        pdfDocRef.current.destroy();
        pdfDocRef.current = null;
      }
      cacheRef.current.clear();
      setTotalPages(0);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const arrayBuffer = await sourceFile.arrayBuffer();
        if (cancelled) return;
        const doc = await loadPdfDocument(arrayBuffer);
        if (cancelled) {
          doc.destroy();
          return;
        }
        pdfDocRef.current = doc;
        setTotalPages(doc.numPages);
      } catch {
        // ignore load errors
      }
    })();

    return () => {
      cancelled = true;
      if (pdfDocRef.current) {
        pdfDocRef.current.destroy();
        pdfDocRef.current = null;
      }
      cacheRef.current.clear();
      setTotalPages(0);
    };
  }, [sourceFile, active]);

  const renderPage = useCallback(
    async (pageNumber: number): Promise<string | null> => {
      const cache = cacheRef.current;

      if (cache.has(pageNumber)) {
        return cache.get(pageNumber)!;
      }

      const doc = pdfDocRef.current;
      if (!doc || pageNumber < 1 || pageNumber > doc.numPages) return null;

      setLoading(true);
      try {
        const dataUrl = await renderPageThumbnail(doc, pageNumber, 2.0);

        // LRU eviction
        if (cache.size >= CACHE_MAX) {
          const oldest = cache.keys().next().value;
          if (oldest !== undefined) {
            cache.delete(oldest);
          }
        }
        cache.set(pageNumber, dataUrl);

        return dataUrl;
      } catch {
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { renderPage, pdfDoc: pdfDocRef.current, loading, totalPages };
}
