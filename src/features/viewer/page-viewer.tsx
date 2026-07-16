"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from "react";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  measured,
  fallback,
  onMeasured,
  query,
  currentLocalIndex,
  regex,
  caseSensitive,
  registerRef,
}: {
  proxy: PDFDocumentProxy | undefined;
  page: PageRef;
  position: number;
  scale: number;
  /** このページ自身の実寸（測定済みなら）。サイズ混在 PDF を各ページの実寸で中央寄せするため。 */
  measured: BaseDims | null;
  /** 未測定時のプレースホルダ寸法（先頭ページ基準）。 */
  fallback: BaseDims;
  onMeasured: (key: string, dims: BaseDims) => void;
  query: string;
  currentLocalIndex: number | null;
  regex: boolean;
  caseSensitive: boolean;
  registerRef: (position: number, el: HTMLElement | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const visible = useVisible(ref);

  // 各ページは自身の実寸で枠を作る（未測定は先頭ページ寸法で仮置き）。これにより
  // サイズの異なるページも canvas と枠が一致し、items-center / mx-auto で中央寄せされる。
  const box = boxFor(measured ?? fallback, scale, page.rotation);
  const dimsKey = `${page.sourceId}:${page.sourceIndex}`;

  // 可視になったら自身の実寸を測ってキャッシュへ報告する（遅延・1 回だけ）。
  useEffect(() => {
    if (!visible || !proxy || measured) return;
    let cancelled = false;
    (async () => {
      try {
        const pg = await proxy.getPage(page.sourceIndex + 1);
        if (cancelled) return;
        const vp = pg.getViewport({ scale: 1 });
        onMeasured(dimsKey, { width: vp.width, height: vp.height });
      } catch {
        // キャンセル等は無視
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, proxy, measured, dimsKey, page.sourceIndex, onMeasured]);

  // position が変わらない限り同一参照を保ち、再描画ごとの observe/unobserve churn を防ぐ
  const setRef = useCallback(
    (el: HTMLDivElement | null) => {
      ref.current = el;
      registerRef(position, el);
    },
    [registerRef, position],
  );

  return (
    <div
      ref={setRef}
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
          regex={regex}
          caseSensitive={caseSensitive}
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
  const regex = useSearchStore((s) => s.regex);
  const caseSensitive = useSearchStore((s) => s.caseSensitive);
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

  // ページごとの実寸（unrotated, scale=1）のキャッシュ。サイズ混在 PDF で各ページを
  // 自身の寸法で配置・中央寄せするために使う。キーは元ソース＋ページ番号（並べ替えに不変）。
  const [pageDims, setPageDims] = useState<Record<string, BaseDims>>({});
  const dimsKeyOf = (p: PageRef) => `${p.sourceId}:${p.sourceIndex}`;
  const reportDims = useCallback((key: string, dims: BaseDims) => {
    setPageDims((prev) => {
      const p = prev[key];
      if (p && p.width === dims.width && p.height === dims.height) return prev;
      return { ...prev, [key]: dims };
    });
  }, []);

  // Ctrl+ホイールズーム時、カーソル下のコンテンツ位置を保持するためのアンカー。
  // ホイール発火時（ズーム前）に記録し、再レイアウト後に scroll を補正する。
  const zoomAnchor = useRef<{
    offsetX: number;
    offsetY: number;
    ratioX: number;
    ratioY: number;
  } | null>(null);

  // ビュアー上の Ctrl+ホイールはページ表示ズーム（既存の ± と同じ刻み）に割り当てる。
  // React の onWheel は passive のため、preventDefault を効かせるには非 passive の
  // ネイティブリスナを直接張る必要がある。
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handler = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      // ズーム前のスクロール状態から、カーソル位置のコンテンツ内比率を記録する
      const rect = el.getBoundingClientRect();
      const offsetX = event.clientX - rect.left;
      const offsetY = event.clientY - rect.top;
      zoomAnchor.current = {
        offsetX,
        offsetY,
        ratioX:
          el.scrollWidth > 0 ? (el.scrollLeft + offsetX) / el.scrollWidth : 0,
        ratioY:
          el.scrollHeight > 0 ? (el.scrollTop + offsetY) / el.scrollHeight : 0,
      };
      if (event.deltaY < 0) zoomIn();
      else if (event.deltaY > 0) zoomOut();
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [zoomIn, zoomOut]);

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

  // 単ページ表示の対象ページの実寸を測ってキャッシュへ（中央寄せ用・サイズ混在対応）。
  useEffect(() => {
    const ap = pages[currentPage - 1];
    if (!ap) return;
    const proxy = getProxy(ap.sourceId);
    if (!proxy) return;
    const key = `${ap.sourceId}:${ap.sourceIndex}`;
    if (pageDims[key]) return;
    let cancelled = false;
    (async () => {
      try {
        const pg = await proxy.getPage(ap.sourceIndex + 1);
        if (cancelled) return;
        const vp = pg.getViewport({ scale: 1 });
        reportDims(key, { width: vp.width, height: vp.height });
      } catch {
        // 無視
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pages, currentPage, getProxy, reportDims, pageDims]);

  // 拡大率が変わって再レイアウトされた直後（描画前）に、記録した比率位置が
  // 同じカーソル座標へ来るよう scroll を補正する＝カーソル中心のズーム。
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const anchor = zoomAnchor.current;
    if (!el || !anchor) return;
    zoomAnchor.current = null;
    el.scrollLeft = anchor.ratioX * el.scrollWidth - anchor.offsetX;
    el.scrollTop = anchor.ratioY * el.scrollHeight - anchor.offsetY;
  }, [effectiveScale]);

  const pageEls = useRef(new Map<number, HTMLElement>());
  const observerRef = useRef<IntersectionObserver | null>(null);
  const visiblePages = useRef(new Set<number>());

  // ページ枠は baseDims 解決後（=この effect 実行後）にマウントされるため、
  // effect 内で ref を読むと観測対象が空になる。代わりに登録コールバックで
  // 都度 observe/unobserve し、後からマウントするページも確実に観測する。
  const registerRef = useCallback(
    (position: number, el: HTMLElement | null) => {
      const prev = pageEls.current.get(position);
      if (prev && prev !== el) {
        observerRef.current?.unobserve(prev);
        visiblePages.current.delete(position);
      }
      if (el) {
        pageEls.current.set(position, el);
        observerRef.current?.observe(el);
      } else {
        pageEls.current.delete(position);
        visiblePages.current.delete(position);
      }
    },
    [],
  );

  useEffect(() => {
    if (viewMode !== "continuous") return;
    const root = scrollRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;

    visiblePages.current.clear();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const pos = Number((entry.target as HTMLElement).dataset.page ?? "0");
          if (entry.isIntersecting) visiblePages.current.add(pos);
          else visiblePages.current.delete(pos);
        }
        if (visiblePages.current.size > 0) {
          setCurrentPage(Math.min(...visiblePages.current));
        }
      },
      { root, threshold: 0.1 },
    );
    observerRef.current = observer;
    // この effect 実行前に既にマウント済みの要素も観測する
    for (const el of pageEls.current.values()) observer.observe(el);
    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, [viewMode, setCurrentPage]);

  useEffect(() => {
    if (navSeq === 0 || viewMode !== "continuous") return;
    const root = scrollRef.current;
    const el = pageEls.current.get(navTarget);
    if (!root || !el) return;
    // scrollIntoView は祖先のスクロールコンテナを「すべて」動かす（ドキュメントを含む）ため使わない。
    // 対象ページの上端をビュアー可視領域の上端に合わせる差分だけを、このコンテナに閉じて適用する。
    const delta =
      el.getBoundingClientRect().top - root.getBoundingClientRect().top;
    root.scrollTo({ top: root.scrollTop + delta });
  }, [navSeq, navTarget, viewMode]);

  const displayPercent = Math.round(effectiveScale * 100);
  const activePage = pages[currentPage - 1];
  // 単ページ表示の枠は対象ページ自身の実寸（未測定は先頭ページ寸法）で計算する。
  const activeDims =
    activePage && baseDims
      ? (pageDims[dimsKeyOf(activePage)] ?? baseDims)
      : null;
  const activeBox =
    activeDims && activePage
      ? boxFor(activeDims, effectiveScale, activePage.rotation)
      : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        data-viewer-scroll
        aria-label="ページ表示領域"
        className="bg-muted/40 min-h-0 flex-1 overflow-auto"
      >
        {viewMode === "single" ? (
          <div className="flex min-h-full items-start justify-center p-6">
            {activePage && activeBox && (
              <PdfPageView
                pdf={getProxy(activePage.sourceId)!}
                pageNumber={activePage.sourceIndex + 1}
                scale={effectiveScale}
                rotation={activePage.rotation}
                width={activeBox.width}
                height={activeBox.height}
                query={query}
                currentLocalIndex={localCurrentFor(currentPage)}
                regex={regex}
                caseSensitive={caseSensitive}
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
                    measured={pageDims[dimsKeyOf(page)] ?? null}
                    fallback={baseDims}
                    onMeasured={reportDims}
                    query={query}
                    currentLocalIndex={localCurrentFor(position)}
                    regex={regex}
                    caseSensitive={caseSensitive}
                    registerRef={registerRef}
                  />
                );
              })}
          </div>
        )}
      </div>

      {/* フッター操作バー: ページ送り・ズーム・表示モード（アイコンは Tooltip で説明を表示） */}
      <TooltipProvider delay={300}>
        <div className="flex flex-wrap items-center gap-3 border-t px-4 py-2">
          <div className="flex items-center gap-1">
            <ControlTip label="前のページ">
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
            </ControlTip>
            <PageNumberInput
              currentPage={currentPage}
              numPages={numPages}
              onGoTo={requestPage}
            />
            <span className="text-muted-foreground text-sm">/ {numPages}</span>
            <ControlTip label="次のページ">
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
            </ControlTip>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <ControlTip label="縮小">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="縮小"
                onClick={zoomOut}
              >
                <ZoomOutIcon aria-hidden />
              </Button>
            </ControlTip>
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
            <ControlTip label="拡大">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="拡大"
                onClick={zoomIn}
              >
                <ZoomInIcon aria-hidden />
              </Button>
            </ControlTip>
            <ZoomPercentInput displayPercent={displayPercent} onSet={setZoom} />

            <ControlTip label="幅に合わせる">
              <Toggle
                size="sm"
                aria-label="幅に合わせる"
                pressed={fitMode === "width"}
                onPressedChange={() => setFitMode("width")}
              >
                <StretchHorizontalIcon aria-hidden />
              </Toggle>
            </ControlTip>
            <ControlTip label="全体表示">
              <Toggle
                size="sm"
                aria-label="全体表示"
                pressed={fitMode === "page"}
                onPressedChange={() => setFitMode("page")}
              >
                <Maximize2Icon aria-hidden />
              </Toggle>
            </ControlTip>

            <div className="bg-border mx-1 h-5 w-px" aria-hidden />

            <ControlTip label="単ページ表示">
              <Toggle
                size="sm"
                aria-label="単ページ表示"
                pressed={viewMode === "single"}
                onPressedChange={() => setViewMode("single")}
              >
                <SquareIcon aria-hidden />
              </Toggle>
            </ControlTip>
            <ControlTip label="連続スクロール表示">
              <Toggle
                size="sm"
                aria-label="連続スクロール表示"
                pressed={viewMode === "continuous"}
                onPressedChange={() => setViewMode("continuous")}
              >
                <Rows3Icon aria-hidden />
              </Toggle>
            </ControlTip>
          </div>
        </div>
      </TooltipProvider>
    </div>
  );
}

/**
 * アイコンのみのコントロールにフローティング説明を付ける薄いラッパ。
 * 子要素（Button / Toggle）を Tooltip のトリガとして合成する（余計な要素を増やさない）。
 */
function ControlTip({
  label,
  children,
}: {
  label: string;
  children: ReactElement;
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
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
