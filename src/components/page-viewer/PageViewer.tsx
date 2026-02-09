"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

const ZOOM_MIN = 30;
const ZOOM_MAX = 100;
const ZOOM_DEFAULT = 60;
const ZOOM_STEP = 10;
const RENDER_SCALE = 2.0;

interface PageViewerProps {
  /** 表示するページ番号（1始まり） */
  pageNumber: number;
  totalPages: number;
  pdfDoc?: PDFDocumentProxy | null;
  onPageChange?: (pageNumber: number) => void;
}

export function PageViewer({
  pageNumber,
  totalPages,
  pdfDoc,
  onPageChange,
}: PageViewerProps) {
  const [rendering, setRendering] = useState(false);
  const [zoom, setZoom] = useState(ZOOM_DEFAULT);
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);
  const textLayerInstanceRef = useRef<{ cancel: () => void } | null>(null);

  // Render page to canvas + TextLayer in a single effect
  useEffect(() => {
    if (!pdfDoc || totalPages === 0) return;
    if (pageNumber < 1 || pageNumber > pdfDoc.numPages) return;

    let cancelled = false;
    let ro: ResizeObserver | null = null;

    setRendering(true);

    (async () => {
      try {
        // Cancel previous tasks
        if (renderTaskRef.current) {
          renderTaskRef.current.cancel();
          renderTaskRef.current = null;
        }
        if (textLayerInstanceRef.current) {
          textLayerInstanceRef.current.cancel();
          textLayerInstanceRef.current = null;
        }

        const page = await pdfDoc.getPage(pageNumber);
        if (cancelled) return;

        const viewport = page.getViewport({ scale: RENDER_SCALE });
        const outputScale = window.devicePixelRatio || 1;

        const canvas = canvasRef.current;
        const textLayerDiv = textLayerRef.current;
        const wrapper = wrapperRef.current;
        if (!canvas || !textLayerDiv || !wrapper || cancelled) return;

        // Set canvas physical dimensions for HiDPI
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);

        const ctx = canvas.getContext("2d");
        if (!ctx || cancelled) return;

        // Render page to canvas
        const transform =
          outputScale !== 1
            ? [outputScale, 0, 0, outputScale, 0, 0]
            : undefined;

        const renderTask = page.render({
          canvas: null,
          canvasContext: ctx,
          viewport,
          transform,
        });
        renderTaskRef.current = renderTask;
        await renderTask.promise;
        if (cancelled) return;
        renderTaskRef.current = null;
        setRendering(false);

        // Build TextLayer on top of canvas
        textLayerDiv.innerHTML = "";
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
        if (cancelled) return;
        textLayerInstanceRef.current = null;

        // Sync --total-scale-factor so TextLayer font/dimension calcs match canvas.
        // TextLayer uses unscaled PDF page width (rawDims.pageWidth) internally,
        // so we must divide by the unscaled width, not viewport.width (which
        // includes RENDER_SCALE).
        const rawPageWidth = viewport.width / viewport.scale;
        const syncScale = () => {
          const displayW = wrapper.getBoundingClientRect().width;
          if (displayW > 0 && rawPageWidth > 0) {
            textLayerDiv.style.setProperty(
              "--total-scale-factor",
              `${displayW / rawPageWidth}`
            );
          }
        };
        syncScale();
        ro = new ResizeObserver(syncScale);
        ro.observe(wrapper);
      } catch {
        if (!cancelled) setRendering(false);
      }
    })();

    return () => {
      cancelled = true;
      if (ro) ro.disconnect();
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }
      if (textLayerInstanceRef.current) {
        textLayerInstanceRef.current.cancel();
        textLayerInstanceRef.current = null;
      }
    };
  }, [pdfDoc, pageNumber, totalPages]);

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
          ) : (
            <div
              ref={wrapperRef}
              className="relative min-h-[200px] shadow-lg"
              style={{ width: `${zoom}%` }}
            >
              <canvas
                ref={canvasRef}
                width={0}
                height={0}
                className="block w-full"
                style={{ height: "auto" }}
              />
              <div
                ref={textLayerRef}
                className="textLayer"
                style={
                  {
                    "--scale-round-x": "1px",
                    "--scale-round-y": "1px",
                  } as React.CSSProperties
                }
              />
              {rendering && (
                <div className="absolute inset-0 z-20 flex items-center justify-center">
                  <div className="flex flex-col items-center gap-2 text-zinc-400">
                    <svg
                      className="h-6 w-6 animate-spin"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    <span className="text-xs">
                      ページ {pageNumber} を読み込み中...
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
