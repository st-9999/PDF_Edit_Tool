"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  Maximize2Icon,
  Rows3Icon,
  SquareIcon,
  StretchHorizontalIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Toggle } from "@/components/ui/toggle";
import { useElementSize } from "@/lib/hooks/use-element-size";
import { useInView } from "@/lib/hooks/use-in-view";
import { computeFitScale } from "@/lib/pdf/render";
import { ZOOM_MAX, ZOOM_MIN } from "@/lib/pdf/constants";
import { useViewerStore } from "@/store/viewer-store";
import { cn } from "@/lib/utils";
import { usePdfDocument } from "./pdf-document-context";
import { PdfPageCanvas } from "./pdf-page-canvas";

const VIEWER_PADDING = 24;

interface BaseDims {
  width: number;
  height: number;
}

/** 連続表示の 1 ページ。可視範囲に入ったら canvas を描画する（遅延）。 */
function ContinuousPage({
  pdf,
  pageNumber,
  scale,
  boxWidth,
  boxHeight,
  registerRef,
}: {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  boxWidth: number;
  boxHeight: number;
  registerRef: (pageNumber: number, el: HTMLElement | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);

  return (
    <div
      ref={(el) => {
        ref.current = el;
        registerRef(pageNumber, el);
      }}
      data-page={pageNumber}
      className="bg-background relative mx-auto shadow-sm ring-1 ring-black/5"
      style={{ width: boxWidth, height: boxHeight }}
    >
      {inView ? (
        <PdfPageCanvas pdf={pdf} pageNumber={pageNumber} scale={scale} />
      ) : (
        <div className="text-muted-foreground flex h-full w-full items-center justify-center text-xs">
          {pageNumber}
        </div>
      )}
    </div>
  );
}

export function PageViewer() {
  const pdf = usePdfDocument();
  const numPages = useViewerStore((s) => s.numPages);
  const currentPage = useViewerStore((s) => s.currentPage);
  const zoom = useViewerStore((s) => s.zoom);
  const fitMode = useViewerStore((s) => s.fitMode);
  const viewMode = useViewerStore((s) => s.viewMode);
  const navSeq = useViewerStore((s) => s.navSeq);
  const navTarget = useViewerStore((s) => s.navTarget);
  const setCurrentPage = useViewerStore((s) => s.setCurrentPage);
  const requestPage = useViewerStore((s) => s.requestPage);
  const nextPage = useViewerStore((s) => s.nextPage);
  const prevPage = useViewerStore((s) => s.prevPage);
  const setZoom = useViewerStore((s) => s.setZoom);
  const zoomIn = useViewerStore((s) => s.zoomIn);
  const zoomOut = useViewerStore((s) => s.zoomOut);
  const setFitMode = useViewerStore((s) => s.setFitMode);
  const setViewMode = useViewerStore((s) => s.setViewMode);

  const scrollRef = useRef<HTMLDivElement>(null);
  const size = useElementSize(scrollRef);
  const [baseDims, setBaseDims] = useState<BaseDims | null>(null);

  // サイズ計算の基準として 1 ページ目の素のビューポートを使う（v1 は均一サイズ近似）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const page = await pdf.getPage(1);
      if (cancelled) return;
      const vp = page.getViewport({ scale: 1 });
      setBaseDims({ width: vp.width, height: vp.height });
    })();
    return () => {
      cancelled = true;
    };
  }, [pdf]);

  const effectiveScale = useMemo(() => {
    if (fitMode === "actual" || !baseDims || size.width === 0) return zoom;
    return computeFitScale(
      baseDims.width,
      baseDims.height,
      fitMode,
      size.width,
      size.height,
      VIEWER_PADDING,
    );
  }, [fitMode, baseDims, size.width, size.height, zoom]);

  const boxWidth = baseDims ? baseDims.width * effectiveScale : 0;
  const boxHeight = baseDims ? baseDims.height * effectiveScale : 0;

  // 連続表示: 各ページ要素の可視状態から現在ページを更新する（逆方向の自動スクロールはしない）
  const pageEls = useRef(new Map<number, HTMLElement>());
  const visible = useRef(new Set<number>());

  const registerRef = useCallback(
    (pageNumber: number, el: HTMLElement | null) => {
      if (el) pageEls.current.set(pageNumber, el);
      else pageEls.current.delete(pageNumber);
    },
    [],
  );

  useEffect(() => {
    if (viewMode !== "continuous") return;
    const root = scrollRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;

    visible.current.clear();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const page = Number(
            (entry.target as HTMLElement).dataset.page ?? "0",
          );
          if (entry.isIntersecting) visible.current.add(page);
          else visible.current.delete(page);
        }
        if (visible.current.size > 0) {
          setCurrentPage(Math.min(...visible.current));
        }
      },
      { root, threshold: 0.1 },
    );
    for (const el of pageEls.current.values()) observer.observe(el);
    return () => observer.disconnect();
  }, [viewMode, numPages, setCurrentPage]);

  // 明示ナビ（navSeq の更新）に応じて連続表示をスクロールする
  useEffect(() => {
    if (navSeq === 0 || viewMode !== "continuous") return;
    pageEls.current.get(navTarget)?.scrollIntoView({ block: "start" });
  }, [navSeq, navTarget, viewMode]);

  const displayPercent = Math.round(effectiveScale * 100);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} className="bg-muted/40 min-h-0 flex-1 overflow-auto">
        {viewMode === "single" ? (
          <div className="flex min-h-full items-start justify-center p-6">
            {baseDims && (
              <div
                className="bg-background shadow-sm ring-1 ring-black/5"
                style={{ width: boxWidth, height: boxHeight }}
              >
                <PdfPageCanvas
                  pdf={pdf}
                  pageNumber={currentPage}
                  scale={effectiveScale}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 p-6">
            {baseDims &&
              Array.from({ length: numPages }, (_, i) => i + 1).map((page) => (
                <ContinuousPage
                  key={page}
                  pdf={pdf}
                  pageNumber={page}
                  scale={effectiveScale}
                  boxWidth={boxWidth}
                  boxHeight={boxHeight}
                  registerRef={registerRef}
                />
              ))}
          </div>
        )}
      </div>

      {/* フッター操作バー: ページ送り・ズーム・表示モード */}
      <div className="flex flex-wrap items-center gap-3 border-t px-4 py-2">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="前のページ"
            disabled={currentPage <= 1}
            onClick={prevPage}
          >
            <ChevronLeftIcon aria-hidden />
          </Button>
          <PageNumberInput
            currentPage={currentPage}
            numPages={numPages}
            onGoTo={requestPage}
          />
          <span className="text-muted-foreground text-sm">/ {numPages}</span>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="次のページ"
            disabled={currentPage >= numPages}
            onClick={nextPage}
          >
            <ChevronRightIcon aria-hidden />
          </Button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="縮小"
            onClick={zoomOut}
          >
            <ZoomOutIcon aria-hidden />
          </Button>
          <Slider
            aria-label="ズーム"
            className="w-32"
            min={Math.round(ZOOM_MIN * 100)}
            max={Math.round(ZOOM_MAX * 100)}
            step={1}
            value={[
              Math.min(
                ZOOM_MAX * 100,
                Math.max(ZOOM_MIN * 100, displayPercent),
              ),
            ]}
            onValueChange={(value) => {
              const v = Array.isArray(value) ? value[0] : value;
              if (typeof v === "number") setZoom(v / 100);
            }}
          />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="拡大"
            onClick={zoomIn}
          >
            <ZoomInIcon aria-hidden />
          </Button>
          <ZoomPercentInput displayPercent={displayPercent} onSet={setZoom} />

          <Toggle
            size="sm"
            aria-label="幅に合わせる"
            pressed={fitMode === "width"}
            onPressedChange={() => setFitMode("width")}
          >
            <StretchHorizontalIcon aria-hidden />
          </Toggle>
          <Toggle
            size="sm"
            aria-label="全体表示"
            pressed={fitMode === "page"}
            onPressedChange={() => setFitMode("page")}
          >
            <Maximize2Icon aria-hidden />
          </Toggle>

          <div className="bg-border mx-1 h-5 w-px" aria-hidden />

          <Toggle
            size="sm"
            aria-label="単ページ表示"
            pressed={viewMode === "single"}
            onPressedChange={() => setViewMode("single")}
          >
            <SquareIcon aria-hidden />
          </Toggle>
          <Toggle
            size="sm"
            aria-label="連続スクロール表示"
            pressed={viewMode === "continuous"}
            onPressedChange={() => setViewMode("continuous")}
          >
            <Rows3Icon aria-hidden />
          </Toggle>
        </div>
      </div>
    </div>
  );
}

function PageNumberInput({
  currentPage,
  numPages,
  onGoTo,
}: {
  currentPage: number;
  numPages: number;
  onGoTo: (page: number) => void;
}) {
  const [draft, setDraft] = useState(String(currentPage));
  // 外部要因（スクロール等）でページが変わったら表示を同期する
  // （effect ではなくレンダー中の前回値比較で更新）
  const [shownPage, setShownPage] = useState(currentPage);
  if (shownPage !== currentPage) {
    setShownPage(currentPage);
    setDraft(String(currentPage));
  }

  const commit = () => {
    const parsed = Number.parseInt(draft, 10);
    if (Number.isFinite(parsed)) onGoTo(parsed);
    else setDraft(String(currentPage));
  };

  return (
    <Input
      aria-label="ページ番号"
      inputMode="numeric"
      className="h-8 w-14 text-center"
      value={draft}
      max={numPages}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        }
      }}
    />
  );
}

function ZoomPercentInput({
  displayPercent,
  onSet,
}: {
  displayPercent: number;
  onSet: (zoom: number) => void;
}) {
  const [draft, setDraft] = useState(String(displayPercent));
  // ズーム率の外部変化（幅合わせ等）をレンダー中の前回値比較で同期する
  const [shown, setShown] = useState(displayPercent);
  if (shown !== displayPercent) {
    setShown(displayPercent);
    setDraft(String(displayPercent));
  }

  const commit = () => {
    const parsed = Number.parseInt(draft, 10);
    if (Number.isFinite(parsed)) onSet(parsed / 100);
    else setDraft(String(displayPercent));
  };

  return (
    <div className={cn("flex items-center")}>
      <Input
        aria-label="ズーム率(%)"
        inputMode="numeric"
        className="h-8 w-14 text-right"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
        }}
      />
      <span className="text-muted-foreground ml-1 text-sm">%</span>
    </div>
  );
}
