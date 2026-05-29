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
import { useVisible } from "@/lib/hooks/use-visible";
import { computeFitScale } from "@/lib/pdf/render";
import { ZOOM_MAX, ZOOM_MIN } from "@/lib/pdf/constants";
import { useViewerStore } from "@/store/viewer-store";
import { useEditorStore } from "@/store/editor-store";
import { useSearchStore } from "@/store/search-store";
import type { PageRef } from "@/lib/editor/operations";
import { cn } from "@/lib/utils";
import { usePdfSources } from "./pdf-sources-context";
import { PdfPageView } from "./pdf-page-view";

const VIEWER_PADDING = 24;

interface BaseDims {
  width: number;
  height: number;
}

function boxFor(base: BaseDims, scale: number, rotation: number): BaseDims {
  const swap = rotation % 180 === 90;
  return {
    width: (swap ? base.height : base.width) * scale,
    height: (swap ? base.width : base.height) * scale,
  };
}

/** 連続表示の 1 ページ。可視範囲に入ったら描画する（遅延）。 */
function ContinuousPage({
  proxy,
  page,
  position,
  scale,
  box,
  query,
  currentLocalIndex,
  registerRef,
}: {
  proxy: PDFDocumentProxy | undefined;
  page: PageRef;
  position: number;
  scale: number;
  box: BaseDims;
  query: string;
  currentLocalIndex: number | null;
  registerRef: (position: number, el: HTMLElement | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const visible = useVisible(ref);

  return (
    <div
      ref={(el) => {
        ref.current = el;
        registerRef(position, el);
      }}
      data-page={position}
      className="relative mx-auto"
      style={{ width: box.width, height: box.height }}
    >
      {visible && proxy ? (
        <PdfPageView
          pdf={proxy}
          pageNumber={page.sourceIndex + 1}
          scale={scale}
          rotation={page.rotation}
          width={box.width}
          height={box.height}
          query={query}
          currentLocalIndex={currentLocalIndex}
        />
      ) : (
        <div className="text-muted-foreground bg-background flex h-full w-full items-center justify-center text-xs shadow-sm ring-1 ring-black/5">
          {position}
        </div>
      )}
    </div>
  );
}

export function PageViewer() {
  const { getProxy } = usePdfSources();
  const pages = useEditorStore((s) => s.pages);
  const numPages = pages.length;
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

  const searchOpen = useSearchStore((s) => s.open);
  const searchQuery = useSearchStore((s) => s.query);
  const matches = useSearchStore((s) => s.matches);
  const activeIndex = useSearchStore((s) => s.activeIndex);
  const query = searchOpen ? searchQuery : "";
  const activeMatch = activeIndex >= 0 ? matches[activeIndex] : undefined;

  // 指定ページ内で強調する出現位置（active マッチがそのページにある場合）
  const localCurrentFor = (position: number): number | null => {
    if (!activeMatch || activeMatch.page !== position) return null;
    let occ = 0;
    for (let i = 0; i < activeIndex; i += 1) {
      if (matches[i]!.page === position) occ += 1;
    }
    return occ;
  };

  const scrollRef = useRef<HTMLDivElement>(null);
  const size = useElementSize(scrollRef);
  const [baseDims, setBaseDims] = useState<BaseDims | null>(null);

  const firstPage = pages[0];
  const firstProxy = firstPage ? getProxy(firstPage.sourceId) : undefined;

  useEffect(() => {
    if (!firstPage || !firstProxy) return;
    let cancelled = false;
    (async () => {
      const page = await firstProxy.getPage(firstPage.sourceIndex + 1);
      if (cancelled) return;
      const vp = page.getViewport({ scale: 1 });
      setBaseDims({ width: vp.width, height: vp.height });
    })();
    return () => {
      cancelled = true;
    };
  }, [firstProxy, firstPage]);

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

  const pageEls = useRef(new Map<number, HTMLElement>());

  const registerRef = useCallback(
    (position: number, el: HTMLElement | null) => {
      if (el) pageEls.current.set(position, el);
      else pageEls.current.delete(position);
    },
    [],
  );

  useEffect(() => {
    if (viewMode !== "continuous") return;
    const root = scrollRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;

    const visible = new Set<number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const pos = Number((entry.target as HTMLElement).dataset.page ?? "0");
          if (entry.isIntersecting) visible.add(pos);
          else visible.delete(pos);
        }
        if (visible.size > 0) setCurrentPage(Math.min(...visible));
      },
      { root, threshold: 0.1 },
    );
    for (const el of pageEls.current.values()) observer.observe(el);
    return () => observer.disconnect();
  }, [viewMode, numPages, setCurrentPage]);

  useEffect(() => {
    if (navSeq === 0 || viewMode !== "continuous") return;
    pageEls.current.get(navTarget)?.scrollIntoView({ block: "start" });
  }, [navSeq, navTarget, viewMode]);

  const displayPercent = Math.round(effectiveScale * 100);
  const activePage = pages[currentPage - 1];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        data-viewer-scroll
        className="bg-muted/40 min-h-0 flex-1 overflow-auto"
      >
        {viewMode === "single" ? (
          <div className="flex min-h-full items-start justify-center p-6">
            {baseDims && activePage && (
              <PdfPageView
                pdf={getProxy(activePage.sourceId)!}
                pageNumber={activePage.sourceIndex + 1}
                scale={effectiveScale}
                rotation={activePage.rotation}
                width={
                  boxFor(baseDims, effectiveScale, activePage.rotation).width
                }
                height={
                  boxFor(baseDims, effectiveScale, activePage.rotation).height
                }
                query={query}
                currentLocalIndex={localCurrentFor(currentPage)}
              />
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 p-6">
            {baseDims &&
              pages.map((page, index) => {
                const position = index + 1;
                return (
                  <ContinuousPage
                    key={page.id}
                    proxy={getProxy(page.sourceId)}
                    page={page}
                    position={position}
                    scale={effectiveScale}
                    box={boxFor(baseDims, effectiveScale, page.rotation)}
                    query={query}
                    currentLocalIndex={localCurrentFor(position)}
                    registerRef={registerRef}
                  />
                );
              })}
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
