"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { renderPageToCanvas } from "@/lib/pdf/render";
import { cn } from "@/lib/utils";

interface PdfPageCanvasProps {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  className?: string;
}

/**
 * 単一ページを canvas に描画する。scale 変更で再描画し、進行中の描画は
 * 次の描画前にキャンセルする。RenderingCancelledException は無視する。
 */
export function PdfPageCanvas({
  pdf,
  pageNumber,
  scale,
  className,
}: PdfPageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let cancelRender: (() => void) | null = null;
    setFailed(false);

    (async () => {
      try {
        const page = await pdf.getPage(pageNumber);
        if (cancelled) return;
        const handle = renderPageToCanvas(page, canvas, scale);
        cancelRender = handle.cancel;
        await handle.promise;
      } catch (err) {
        if (
          !cancelled &&
          err instanceof Error &&
          err.name !== "RenderingCancelledException"
        ) {
          setFailed(true);
        }
      }
    })();

    return () => {
      cancelled = true;
      cancelRender?.();
    };
  }, [pdf, pageNumber, scale]);

  if (failed) {
    return (
      <div
        className={cn(
          "text-muted-foreground bg-muted flex items-center justify-center text-xs",
          className,
        )}
      >
        ページ {pageNumber} を描画できません
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className={cn("block", className)}
      aria-label={`ページ ${pageNumber}`}
    />
  );
}
