"use client";

import { useEffect, useRef } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useInView } from "@/lib/hooks/use-in-view";
import { renderPageToCanvas } from "@/lib/pdf/render";
import { THUMBNAIL_WIDTH } from "@/lib/pdf/constants";
import { cn } from "@/lib/utils";

interface ThumbnailProps {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  active: boolean;
  onSelect: (pageNumber: number) => void;
}

/** サムネイル 1 件。可視範囲に入ったら低解像度で描画する（遅延生成）。 */
export function Thumbnail({
  pdf,
  pageNumber,
  active,
  onSelect,
}: ThumbnailProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inView = useInView(buttonRef);

  useEffect(() => {
    if (!inView) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let cancelRender: (() => void) | null = null;

    (async () => {
      try {
        const page = await pdf.getPage(pageNumber);
        if (cancelled) return;
        const base = page.getViewport({ scale: 1 });
        const scale = THUMBNAIL_WIDTH / base.width;
        const handle = renderPageToCanvas(page, canvas, scale);
        cancelRender = handle.cancel;
        await handle.promise;
      } catch {
        // キャンセル等は無視（再マウント時に再描画）
      }
    })();

    return () => {
      cancelled = true;
      cancelRender?.();
    };
  }, [inView, pdf, pageNumber]);

  // 選択中サムネは一覧内に見えるようスクロール
  useEffect(() => {
    if (active) {
      buttonRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [active]);

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={() => onSelect(pageNumber)}
      aria-label={`ページ ${pageNumber}`}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex flex-col items-center gap-1 rounded-md p-1.5 transition-colors",
        active ? "bg-primary/10 ring-primary ring-2" : "hover:bg-muted",
      )}
    >
      <div
        className="bg-background overflow-hidden ring-1 ring-black/5"
        style={{
          width: THUMBNAIL_WIDTH,
          minHeight: Math.round(THUMBNAIL_WIDTH * 1.414),
        }}
      >
        <canvas ref={canvasRef} className="block w-full" />
      </div>
      <span className="text-muted-foreground text-xs">{pageNumber}</span>
    </button>
  );
}
