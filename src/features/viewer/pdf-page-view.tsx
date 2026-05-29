"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { renderPageToCanvas, renderTextLayer } from "@/lib/pdf/render";
import { applyHighlights } from "@/lib/search/highlight";
import { cn } from "@/lib/utils";

interface PdfPageViewProps {
  pdf: PDFDocumentProxy;
  /** 描画する元ページ（1 始まり）。 */
  pageNumber: number;
  scale: number;
  rotation?: number;
  width: number;
  height: number;
  /** 検索ハイライト語（空で無効）。 */
  query?: string;
  /** このページ内で強調する出現位置（0 始まり、無ければ null）。 */
  currentLocalIndex?: number | null;
}

/** メインビューア用ページ: canvas ＋ テキストレイヤ（選択・コピー・検索ハイライト）。 */
export function PdfPageView({
  pdf,
  pageNumber,
  scale,
  rotation = 0,
  width,
  height,
  query = "",
  currentLocalIndex = null,
}: PdfPageViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);

  // ハイライト適用に最新値を使うための参照（canvas 再描画を避けるため依存に含めない）
  const queryRef = useRef(query);
  const currentRef = useRef(currentLocalIndex);
  useEffect(() => {
    queryRef.current = query;
    currentRef.current = currentLocalIndex;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const textContainer = textRef.current;
    if (!canvas || !textContainer) return;
    let cancelled = false;
    let cancelRender: (() => void) | null = null;

    (async () => {
      try {
        const page = await pdf.getPage(pageNumber);
        if (cancelled) return;
        const handle = renderPageToCanvas(page, canvas, scale, rotation);
        cancelRender = handle.cancel;
        await handle.promise;
        if (cancelled) return;
        await renderTextLayer(page, textContainer, handle.viewport);
        if (cancelled) return;
        applyHighlights(textContainer, queryRef.current, currentRef.current);
      } catch {
        // RenderingCancelled 等は無視
      }
    })();

    return () => {
      cancelled = true;
      cancelRender?.();
      textContainer.replaceChildren();
    };
  }, [pdf, pageNumber, scale, rotation]);

  // 検索語・現在位置の変化でハイライトのみ再適用
  useEffect(() => {
    const textContainer = textRef.current;
    if (!textContainer) return;
    applyHighlights(textContainer, query, currentLocalIndex);
  }, [query, currentLocalIndex]);

  // 現在ヒットを表示範囲へスクロール
  useEffect(() => {
    if (currentLocalIndex === null) return;
    const current = textRef.current?.querySelector<HTMLElement>(
      'mark.search-hit[data-current="true"]',
    );
    current?.scrollIntoView({ block: "center" });
  }, [currentLocalIndex, query]);

  const style = {
    width,
    height,
    "--total-scale-factor": scale,
  } as CSSProperties;

  return (
    <div
      className="bg-background relative shadow-sm ring-1 ring-black/5"
      style={style}
    >
      <canvas ref={canvasRef} className={cn("absolute top-0 left-0 block")} />
      <div ref={textRef} className="textLayer" />
    </div>
  );
}
