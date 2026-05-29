"use client";

import { ZoomInIcon, ZoomOutIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  THUMBNAIL_WIDTH_DEFAULT,
  THUMBNAIL_WIDTH_MAX,
  THUMBNAIL_WIDTH_MIN,
} from "@/lib/pdf/constants";
import { useViewerStore, type LeftTab } from "@/store/viewer-store";
import { BookmarkPanel } from "@/features/bookmark/bookmark-panel";
import { ThumbnailList } from "./thumbnail-list";

/** サムネイルの拡大縮小バー。ビュアー zoom / ブラウザ拡大率とは独立に幅だけを変える。 */
function ThumbnailZoomBar() {
  const thumbnailWidth = useViewerStore((s) => s.thumbnailWidth);
  const thumbnailZoomIn = useViewerStore((s) => s.thumbnailZoomIn);
  const thumbnailZoomOut = useViewerStore((s) => s.thumbnailZoomOut);
  const percent = Math.round((thumbnailWidth / THUMBNAIL_WIDTH_DEFAULT) * 100);

  return (
    <div className="flex shrink-0 items-center justify-end gap-1 border-b px-2 py-1">
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
  );
}

/** 左ペイン: サムネイル / しおり のタブ切替。 */
export function LeftPane() {
  const leftTab = useViewerStore((s) => s.leftTab);
  const setLeftTab = useViewerStore((s) => s.setLeftTab);

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
        <div className="min-h-0 flex-1 overflow-auto">
          <ThumbnailList />
        </div>
      </TabsContent>
      <TabsContent value="bookmarks" className="min-h-0 flex-1 overflow-auto">
        <BookmarkPanel />
      </TabsContent>
    </Tabs>
  );
}
