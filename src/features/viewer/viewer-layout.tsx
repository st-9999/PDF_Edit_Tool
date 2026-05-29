"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { useViewerStore } from "@/store/viewer-store";
import { editorSelectors, useEditorStore } from "@/store/editor-store";
import { useUnsavedGuard } from "@/lib/hooks/use-unsaved-guard";
import { useEditorShortcuts } from "@/lib/hooks/use-editor-shortcuts";
import { EditToolbar } from "@/features/editor/edit-toolbar";
import { PdfSourcesProvider, usePdfSources } from "./pdf-sources-context";
import { LeftPane } from "./left-pane";
import { PageViewer } from "./page-viewer";
import { StatusBar } from "./status-bar";
import { TopBar } from "./top-bar";

/** 読み込み済み状態の 3 ペインレイアウト。複数ソース（結合）に対応。 */
export function ViewerLayout() {
  return (
    <PdfSourcesProvider>
      <ViewerShell />
    </PdfSourcesProvider>
  );
}

function ViewerShell() {
  const file = useViewerStore((s) => s.file);
  const setNumPages = useViewerStore((s) => s.setNumPages);
  const setStatus = useViewerStore((s) => s.setStatus);
  const setError = useViewerStore((s) => s.setError);
  const clearFile = useViewerStore((s) => s.clearFile);
  const initDocument = useEditorStore((s) => s.initDocument);
  const resetEditor = useEditorStore((s) => s.reset);
  const dirty = useEditorStore(editorSelectors.isDirty);
  const pageCount = useEditorStore((s) => s.pages.length);
  const { addSource } = usePdfSources();

  useUnsavedGuard(dirty);
  useEditorShortcuts();

  // 初回ロード: file → ソース登録 → 編集ドキュメント初期化
  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    (async () => {
      try {
        const buffer = await file.arrayBuffer();
        const { sourceId, numPages } = await addSource(new Uint8Array(buffer));
        if (cancelled) return;
        initDocument(numPages, sourceId);
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : "PDF を読み込めませんでした";
        toast.error(message);
        setError(message);
        clearFile();
      }
    })();
    return () => {
      cancelled = true;
      resetEditor();
    };
  }, [
    file,
    addSource,
    initDocument,
    setStatus,
    setError,
    clearFile,
    resetEditor,
  ]);

  // 編集でページ数が変わったらステータス/ナビ境界に反映する
  useEffect(() => {
    if (pageCount > 0) setNumPages(pageCount);
  }, [pageCount, setNumPages]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TopBar />
      {pageCount > 0 && <EditToolbar />}
      {pageCount > 0 ? (
        <ResizablePanelGroup
          orientation="horizontal"
          className="min-h-0 flex-1"
        >
          <ResizablePanel
            defaultSize="22%"
            minSize="12%"
            className="flex min-h-0 flex-col"
          >
            <LeftPane />
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize="78%" className="flex min-h-0 flex-col">
            <PageViewer />
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">
          PDF を読み込んでいます…
        </div>
      )}
      <StatusBar />
    </div>
  );
}
