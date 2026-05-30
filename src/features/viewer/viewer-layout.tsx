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
import { checkLimits, recommendedLimitsLabel } from "@/lib/perf/limits";
import { EditToolbar } from "@/features/editor/edit-toolbar";
import { SearchBar } from "@/features/search/search-bar";
import { ProgressOverlay } from "@/features/progress/progress-overlay";
import { PdfSourcesProvider, usePdfSources } from "./pdf-sources-context";
import { LeftPane } from "./left-pane";
import { OrganizeView } from "./organize-view";
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
  const mergeFiles = useViewerStore((s) => s.mergeFiles);
  const organize = useViewerStore((s) => s.organize);
  const setNumPages = useViewerStore((s) => s.setNumPages);
  const setStatus = useViewerStore((s) => s.setStatus);
  const setError = useViewerStore((s) => s.setError);
  const clearFile = useViewerStore((s) => s.clearFile);
  const initDocument = useEditorStore((s) => s.initDocument);
  const initMergedDocument = useEditorStore((s) => s.initMergedDocument);
  const resetEditor = useEditorStore((s) => s.reset);
  const dirty = useEditorStore(editorSelectors.isDirty);
  const pageCount = useEditorStore((s) => s.pages.length);
  const { addSource } = usePdfSources();

  useUnsavedGuard(dirty);
  useEditorShortcuts();

  // 初回ロード: file（＋mergeFiles）→ ソース登録 → 編集ドキュメント初期化。
  // mergeFiles があれば全ソースを 1 つの結合ドキュメントとしてクリーンに開く。
  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    (async () => {
      try {
        const buffer = await file.arrayBuffer();
        const first = await addSource(new Uint8Array(buffer));
        if (cancelled) return;

        if (mergeFiles.length === 0) {
          initDocument(first.numPages, first.sourceId);
          setStatus("ready");
          if (checkLimits(first.numPages, file.size).exceeded) {
            toast.warning(
              `大きなファイルです（${first.numPages} ページ）。${recommendedLimitsLabel()} を超えており、動作が重くなる場合があります。`,
            );
          }
          return;
        }

        // 結合: 残りのソースも登録してから 1 つの初期ドキュメントとして開く
        const sources = [first];
        let totalBytes = file.size;
        for (const extra of mergeFiles) {
          const extraBuffer = await extra.arrayBuffer();
          const added = await addSource(new Uint8Array(extraBuffer));
          if (cancelled) return;
          sources.push(added);
          totalBytes += extra.size;
        }
        initMergedDocument(sources);
        const totalPages = sources.reduce((sum, s) => sum + s.numPages, 0);
        setStatus("ready");
        if (checkLimits(totalPages, totalBytes).exceeded) {
          toast.warning(
            `大きなファイルです（${totalPages} ページ）。${recommendedLimitsLabel()} を超えており、動作が重くなる場合があります。`,
          );
        }
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
    mergeFiles,
    addSource,
    initDocument,
    initMergedDocument,
    setStatus,
    setError,
    clearFile,
    resetEditor,
  ]);

  // 編集でページ数が変わったらステータス/ナビ境界に反映する
  useEffect(() => {
    if (pageCount > 0) setNumPages(pageCount);
  }, [pageCount, setNumPages]);

  const ready = pageCount > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TopBar />
      {ready && !organize && <EditToolbar />}
      {!ready ? (
        <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">
          PDF を読み込んでいます…
        </div>
      ) : organize ? (
        <OrganizeView />
      ) : (
        <div className="relative flex min-h-0 flex-1">
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
          <SearchBar />
          <ProgressOverlay />
        </div>
      )}
      <StatusBar />
    </div>
  );
}
