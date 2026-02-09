"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

const ZOOM_MIN = 30;
const ZOOM_MAX = 100;
const ZOOM_DEFAULT = 60;
const ZOOM_STEP = 10;

// Viewport scale used by renderPageThumbnail in use-page-viewer
const RENDER_SCALE = 2.0;

interface PageViewerProps {
  /** 表示するページ番号（1始まり） */
  pageNumber: number;
  totalPages: number;
  renderPage: (pageNumber: number) => Promise<string | null>;
  pdfDoc?: PDFDocumentProxy | null;
  loading: boolean;
  onPageChange?: (pageNumber: number) => void;
}

export function PageViewer({
  pageNumber,
  totalPages,
  renderPage,
  pdfDoc,
  loading,
  onPageChange,
}: PageViewerProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [zoom, setZoom] = useState(ZOOM_DEFAULT);
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const textLayerInstanceRef = useRef<{ cancel: () => void } | null>(null);
  // Native pixel width of the TextLayer (before CSS scaling)
  const textLayerNativeWidthRef = useRef(0);

  // Render the current page image when pageNumber changes
  useEffect(() => {
    if (totalPages === 0) return;
    let cancelled = false;

    setRendering(true);
    renderPage(pageNumber).then((url) => {
      if (!cancelled) {
        setImageUrl(url);
        setRendering(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [pageNumber, totalPages, renderPage]);

  // Render text layer overlay after image is loaded
  useEffect(() => {
    if (!pdfDoc || !imageUrl || totalPages === 0) return;
    if (pageNumber < 1 || pageNumber > pdfDoc.numPages) return;

    let cancelled = false;

    (async () => {
      try {
        // Cancel previous text layer
        if (textLayerInstanceRef.current) {
          textLayerInstanceRef.current.cancel();
          textLayerInstanceRef.current = null;
        }

        const page = await pdfDoc.getPage(pageNumber);
        if (cancelled) return;

        const viewport = page.getViewport({ scale: RENDER_SCALE });

        const textLayerDiv = textLayerRef.current;
        if (!textLayerDiv || cancelled) return;

        // Clear previous content
        textLayerDiv.innerHTML = "";
        const nativeW = Math.floor(viewport.width);
        const nativeH = Math.floor(viewport.height);
        textLayerDiv.style.width = `${nativeW}px`;
        textLayerDiv.style.height = `${nativeH}px`;
        textLayerNativeWidthRef.current = nativeW;

        const textContent = await page.getTextContent();
        if (cancelled) return;

        const { TextLayer } = await import("pdfjs-dist");
        if (cancelled) return;

        const tl = new TextLayer({
          textContentSource: textContent,
          container: textLayerDiv,
          viewport,
        });
        textLayerInstanceRef.current = tl;
        await tl.render();
      } catch {
        // ignore text layer errors — image still works
      }
    })();

    return () => {
      cancelled = true;
      if (textLayerInstanceRef.current) {
        textLayerInstanceRef.current.cancel();
        textLayerInstanceRef.current = null;
      }
    };
  }, [pdfDoc, pageNumber, imageUrl, totalPages]);

  // Scale TextLayer to match displayed image size
  useEffect(() => {
    const wrapper = wrapperRef.current;
    const textLayerDiv = textLayerRef.current;
    if (!wrapper || !textLayerDiv) return;

    const syncScale = () => {
      const nativeW = textLayerNativeWidthRef.current;
      if (nativeW <= 0) return;
      const displayW = wrapper.getBoundingClientRect().width;
      const scale = displayW / nativeW;
      textLayerDiv.style.transform = `scale(${scale})`;
    };

    syncScale();
    const ro = new ResizeObserver(syncScale);
    ro.observe(wrapper);
    return () => ro.disconnect();
  }, [imageUrl]);

  // --- Page navigation ---
  const goToPrev = useCallback(() => {
    if (pageNumber > 1) onPageChange?.(pageNumber - 1);
  }, [pageNumber, onPageChange]);

  const goToNext = useCallback(() => {
    if (pageNumber < totalPages) onPageChange?.(pageNumber + 1);
  }, [pageNumber, totalPages, onPageChange]);

  // --- Zoom handlers ---
  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(ZOOM_MAX, prev + ZOOM_STEP));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(ZOOM_MIN, prev - ZOOM_STEP));
  }, []);

  const handleZoomReset = useCallback(() => {
    setZoom(ZOOM_DEFAULT);
  }, []);

  // Ctrl + wheel zoom
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom((prev) => {
        const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
        return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, prev + delta));
      });
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const hasPages = totalPages > 0;

  return (
    <div className="flex h-full flex-col">
      {/* ツールバー */}
      <div className="flex items-center justify-center gap-2 border-b border-zinc-700 bg-zinc-800 px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-800">
        {/* ページナビ */}
        <button
          onClick={goToPrev}
          disabled={!hasPages || pageNumber <= 1}
          className="rounded p-1 text-zinc-400 hover:bg-zinc-700 disabled:opacity-30"
          aria-label="前のページ"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="min-w-[4rem] text-center text-xs text-zinc-400">
          {hasPages ? `${pageNumber} / ${totalPages}` : "- / -"}
        </span>
        <button
          onClick={goToNext}
          disabled={!hasPages || pageNumber >= totalPages}
          className="rounded p-1 text-zinc-400 hover:bg-zinc-700 disabled:opacity-30"
          aria-label="次のページ"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>

        <div className="mx-1 h-4 w-px bg-zinc-600" />

        {/* ズームコントロール */}
        <button
          onClick={handleZoomOut}
          disabled={zoom <= ZOOM_MIN}
          className="rounded p-1 text-zinc-400 hover:bg-zinc-700 disabled:opacity-30"
          aria-label="ズームアウト"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
          </svg>
        </button>
        <button
          onClick={handleZoomReset}
          className={`rounded px-1.5 py-0.5 text-[11px] transition-colors ${
            zoom === ZOOM_DEFAULT
              ? "bg-blue-900/40 text-blue-400"
              : "text-zinc-400 hover:bg-zinc-700"
          }`}
          title={`${ZOOM_DEFAULT}% にリセット`}
        >
          {zoom}%
        </button>
        <button
          onClick={handleZoomIn}
          disabled={zoom >= ZOOM_MAX}
          className="rounded p-1 text-zinc-400 hover:bg-zinc-700 disabled:opacity-30"
          aria-label="ズームイン"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {/* ページ表示エリア */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto bg-zinc-600 dark:bg-zinc-900"
      >
        <div className="flex min-h-full items-center justify-center p-4">
          {!hasPages ? (
            <span className="text-sm text-zinc-400">PDFを読み込んでください</span>
          ) : rendering && !imageUrl ? (
            <div className="flex flex-col items-center gap-2 text-zinc-400">
              <svg className="h-6 w-6 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-xs">ページ {pageNumber} を読み込み中...</span>
            </div>
          ) : imageUrl ? (
            <div
              ref={wrapperRef}
              className="relative shadow-lg"
              style={{ width: `${zoom}%` }}
            >
              <img
                ref={imgRef}
                src={imageUrl}
                alt={`Page ${pageNumber}`}
                className="block w-full"
                draggable={false}
              />
              {/* TextLayer overlay — scaled to match img display size */}
              <div
                ref={textLayerRef}
                className="textLayer absolute left-0 top-0 origin-top-left"
              />
            </div>
          ) : (
            <span className="text-xs text-zinc-400">ページを表示できません</span>
          )}
        </div>
      </div>
    </div>
  );
}
