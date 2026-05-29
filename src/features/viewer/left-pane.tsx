"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useViewerStore, type LeftTab } from "@/store/viewer-store";
import { ThumbnailList } from "./thumbnail-list";

/** 左ペイン: サムネイル / しおり のタブ切替。しおりは P6 で実装予定。 */
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
      <TabsContent value="thumbnails" className="min-h-0 flex-1 overflow-auto">
        <ThumbnailList />
      </TabsContent>
      <TabsContent
        value="bookmarks"
        className="text-muted-foreground min-h-0 flex-1 overflow-auto p-4 text-sm"
      >
        この PDF のしおり表示は今後のバージョンで対応予定です。
      </TabsContent>
    </Tabs>
  );
}
