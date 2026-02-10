"use client";

import { useState } from "react";
import { Panel, Group, Separator } from "react-resizable-panels";
import type { BookmarkNode, PageInfo, PdfFileInfo } from "@/types/pdf";
import { BookmarkEditor } from "./BookmarkEditor";
import { PageViewer } from "@/components/page-viewer/PageViewer";
import { ThumbnailStrip } from "@/components/thumbnail-strip/ThumbnailStrip";
import { usePageViewer } from "@/hooks/use-page-viewer";

interface BookmarkLayoutProps {
  bookmarks: BookmarkNode[];
  onBookmarksChange: (bookmarks: BookmarkNode[]) => void;
  pages: PageInfo[];
  files: PdfFileInfo[];
}

export function BookmarkLayout({
  bookmarks,
  onBookmarksChange,
  pages,
  files,
}: BookmarkLayoutProps) {
  const [selectedPageNumber, setSelectedPageNumber] = useState(1);
  const [selectedBookmarkId, setSelectedBookmarkId] = useState<string | null>(null);

  const sourceFile = files.length > 0 ? files[0].sourceFile : null;
  const { pdfDoc, totalPages } = usePageViewer({
    sourceFile,
    active: true,
  });

  return (
    <div className="h-full">
      <Group orientation="horizontal" id="bookmark-layout">
        {/* 左カラム: しおりツリー */}
        <Panel id="bookmark-tree" defaultSize={27} minSize={15}>
          <div className="relative h-full">
            <div className="absolute inset-0 overflow-y-auto rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-800">
              <BookmarkEditor
                bookmarks={bookmarks}
                onBookmarksChange={onBookmarksChange}
                totalPages={pages.length}
                currentPage={selectedPageNumber}
                onPageNavigate={setSelectedPageNumber}
                selectedNodeId={selectedBookmarkId}
                onNodeSelect={setSelectedBookmarkId}
              />
            </div>
          </div>
        </Panel>

        <Separator className="group mx-0.5 flex w-2 items-center justify-center">
          <div className="h-8 w-1 rounded-full bg-zinc-300 transition-colors group-hover:bg-blue-400 group-active:bg-blue-500 dark:bg-zinc-600 dark:group-hover:bg-blue-500" />
        </Separator>

        {/* 中央カラム: ページビュアー（縦いっぱい） */}
        <Panel id="page-viewer" defaultSize={60} minSize={20}>
          <div className="relative h-full">
            <div className="absolute inset-0 overflow-hidden bg-zinc-600 dark:bg-zinc-900">
              <PageViewer
                pageNumber={selectedPageNumber}
                totalPages={totalPages}
                pdfDoc={pdfDoc}
                onPageChange={setSelectedPageNumber}
              />
            </div>
          </div>
        </Panel>

        <Separator className="group mx-0.5 flex w-2 items-center justify-center">
          <div className="h-8 w-1 rounded-full bg-zinc-300 transition-colors group-hover:bg-blue-400 group-active:bg-blue-500 dark:bg-zinc-600 dark:group-hover:bg-blue-500" />
        </Separator>

        {/* 右カラム: サムネイル一覧 */}
        <Panel id="thumbnail-strip" defaultSize={13} minSize={8}>
          <div className="relative h-full">
            <div className="absolute inset-0 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800">
              <ThumbnailStrip
                pages={pages}
                selectedPageNumber={selectedPageNumber}
                onPageSelect={setSelectedPageNumber}
              />
            </div>
          </div>
        </Panel>
      </Group>
    </div>
  );
}
