"use client";

import { useEffect, useRef, type MouseEvent } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useVisible } from "@/lib/hooks/use-visible";
import { renderPageToCanvas } from "@/lib/pdf/render";
import { THUMBNAIL_WIDTH } from "@/lib/pdf/constants";
import { cn } from "@/lib/utils";

interface ThumbnailProps {
  pdf: PDFDocumentProxy;
  /** 描画する元ページ（1 始まり）。 */
  pageNumber: number;
  /** 一覧内の表示位置（1 始まり・ラベル/現在ページ判定用）。 */
  position: number;
  /** ユーザー適用の追加回転（時計回り度）。サムネに反映する。 */
  rotation?: number;
  selected: boolean;
  current: boolean;
  onClick: (event: MouseEvent) => void;
}

/** サムネイル 1 件。可視範囲に入ったら低解像度で描画する（遅延生成）。 */
export function Thumbnail({
  pdf,
  pageNumber,
  position,
  rotation = 0,
  selected,
  current,
  onClick,
}: ThumbnailProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const visible = useVisible(buttonRef);

  useEffect(() => {
    if (!visible) return;
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
        const handle = renderPageToCanvas(page, canvas, scale, rotation);
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
  }, [visible, pdf, pageNumber, rotation]);

  // 現在ページのサムネは一覧内に見えるようスクロール
  useEffect(() => {
    if (current) buttonRef.current?.scrollIntoView({ block: "nearest" });
  }, [current]);

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      aria-label={`ページ ${position}`}
      aria-pressed={selected}
      aria-current={current ? "page" : undefined}
      className={cn(
        "flex flex-col items-center gap-1 rounded-md p-1.5 transition-colors",
        selected
          ? "bg-primary/10 ring-primary ring-2"
          : current
            ? "ring-ring ring-1"
            : "hover:bg-muted",
      )}
    >
      <div
        className="bg-background overflow-hidden ring-1 ring-black/5"
        style={{
          width: THUMBNAIL_WIDTH,
          minHeight: Math.round(THUMBNAIL_WIDTH * 1.414),
        }}
      >
        {visible ? <canvas ref={canvasRef} className="block w-full" /> : null}
      </div>
      <span className="text-muted-foreground text-xs">{position}</span>
    </button>
  );
}
