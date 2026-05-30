"use client";

import {
  CheckCheckIcon,
  ListChecksIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toggle } from "@/components/ui/toggle";
import {
  THUMBNAIL_WIDTH_DEFAULT,
  THUMBNAIL_WIDTH_MAX,
  THUMBNAIL_WIDTH_MIN,
} from "@/lib/pdf/constants";
import { useCtrlWheelZoom } from "@/lib/hooks/use-ctrl-wheel-zoom";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/store/editor-store";
import { useViewerStore, type LeftTab } from "@/store/viewer-store";
import { BookmarkPanel } from "@/features/bookmark/bookmark-panel";
import { ThumbnailList } from "./thumbnail-list";

/** 複数選択モードの切替トグル。OFF 時はクリックで単一選択のみに制限する。 */
function MultiSelectToggle() {
  const multiSelect = useEditorStore((s) => s.multiSelect);
  const setMultiSelect = useEditorStore((s) => s.setMultiSelect);
  const hasPages = useEditorStore((s) => s.pages.length > 0);

  return (
    <Toggle
      size="sm"
      variant="outline"
      pressed={multiSelect}
      disabled={!hasPages}
      aria-label="ページを複数選択"
      title={
        multiSelect
          ? "複数選択モード: ON（クリックで加除 / Shift で範囲）"
          : "複数選択モード: OFF（クリックで単一選択）"
      }
      className={cn(
        "gap-1.5 font-medium transition-colors",
        // ON 時は primary で塗りつぶし、文字色・枠も反転させて一目で判別できるようにする
        "aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground",
        "aria-pressed:hover:bg-primary/90 aria-pressed:hover:text-primary-foreground",
      )}
      onPressedChange={(pressed) => {
        if (pressed) {
          setMultiSelect(true);
          return;
        }
        // 解除時は現在の閲覧ページを優先して選択を 1 件に畳む
        const { pages } = useEditorStore.getState();
        const { currentPage } = useViewerStore.getState();
        setMultiSelect(false, pages[currentPage - 1]?.id);
      }}
    >
      {multiSelect ? (
        <CheckCheckIcon aria-hidden />
      ) : (
        <ListChecksIcon aria-hidden />
      )}
      {multiSelect ? "複数選択中" : "複数選択"}
    </Toggle>
  );
}

/** サムネイルの拡大縮小バー。ビュアー zoom / ブラウザ拡大率とは独立に幅だけを変える。 */
function ThumbnailZoomBar() {
  const thumbnailWidth = useViewerStore((s) => s.thumbnailWidth);
  const thumbnailZoomIn = useViewerStore((s) => s.thumbnailZoomIn);
  const thumbnailZoomOut = useViewerStore((s) => s.thumbnailZoomOut);
  const percent = Math.round((thumbnailWidth / THUMBNAIL_WIDTH_DEFAULT) * 100);

  return (
    <div className="flex shrink-0 items-center justify-between gap-1 border-b px-2 py-1">
      <MultiSelectToggle />
      <div className="flex items-center gap-1">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-7"
          aria-label="サムネイルを縮小"
          disabled={thumbnailWidth <= THUMBNAIL_WIDTH_MIN}
          onClick={thumbnailZoomOut}
        >
          <ZoomOutIcon aria-hidden />
        </Button>
        <span
          className="text-muted-foreground w-10 text-center text-xs tabular-nums"
          aria-label="サムネイル拡大率"
        >
          {percent}%
        </span>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-7"
          aria-label="サムネイルを拡大"
          disabled={thumbnailWidth >= THUMBNAIL_WIDTH_MAX}
          onClick={thumbnailZoomIn}
        >
          <ZoomInIcon aria-hidden />
        </Button>
      </div>
    </div>
  );
}

/** 左ペイン: サムネイル / しおり のタブ切替。 */
export function LeftPane() {
  const leftTab = useViewerStore((s) => s.leftTab);
  const setLeftTab = useViewerStore((s) => s.setLeftTab);
  const thumbnailZoomIn = useViewerStore((s) => s.thumbnailZoomIn);
  const thumbnailZoomOut = useViewerStore((s) => s.thumbnailZoomOut);

  // サムネ一覧上の Ctrl+ホイールはサムネ幅のズームに割り当てる（ビュアーとは独立）
  const thumbZoomRef = useCtrlWheelZoom({
    onZoomIn: thumbnailZoomIn,
    onZoomOut: thumbnailZoomOut,
  });

  return (
    <Tabs
      value={leftTab}
      onValueChange={(value) => setLeftTab(value as LeftTab)}
      className="flex min-h-0 flex-1 flex-col"
    >
      <TabsList className="m-2 self-stretch">
        <TabsTrigger value="thumbnails">サムネイル</TabsTrigger>
        <TabsTrigger value="bookmarks">しおり</TabsTrigger>
      </TabsList>
      <TabsContent value="thumbnails" className="flex min-h-0 flex-1 flex-col">
        <ThumbnailZoomBar />
        <div
          ref={thumbZoomRef}
          data-thumb-scroll
          className="min-h-0 flex-1 overflow-auto"
        >
          <ThumbnailList />
        </div>
      </TabsContent>
      <TabsContent value="bookmarks" className="min-h-0 flex-1 overflow-auto">
        <BookmarkPanel />
      </TabsContent>
    </Tabs>
  );
}
