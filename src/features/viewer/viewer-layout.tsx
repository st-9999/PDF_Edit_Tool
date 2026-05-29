"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { loadPdfDocument } from "@/lib/pdf/pdfjs";
import { readPdfMeta } from "@/lib/pdf/document";
import { useViewerStore } from "@/store/viewer-store";
import { editorSelectors, useEditorStore } from "@/store/editor-store";
import { useUnsavedGuard } from "@/lib/hooks/use-unsaved-guard";
import { useEditorShortcuts } from "@/lib/hooks/use-editor-shortcuts";
import { PdfDocumentProvider } from "./pdf-document-context";
import { LeftPane } from "./left-pane";
import { PageViewer } from "./page-viewer";
import { StatusBar } from "./status-bar";
import { TopBar } from "./top-bar";

/** 読み込み済み状態の 3 ペインレイアウト。file から PDF をロードして提供する。 */
export function ViewerLayout() {
  const file = useViewerStore((s) => s.file);
  const setNumPages = useViewerStore((s) => s.setNumPages);
  const setStatus = useViewerStore((s) => s.setStatus);
  const setError = useViewerStore((s) => s.setError);
  const clearFile = useViewerStore((s) => s.clearFile);
  const initDocument = useEditorStore((s) => s.initDocument);
  const resetEditor = useEditorStore((s) => s.reset);
  const dirty = useEditorStore(editorSelectors.isDirty);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);

  useUnsavedGuard(dirty);
  useEditorShortcuts();

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    let loaded: PDFDocumentProxy | null = null;

    (async () => {
      try {
        const buffer = await file.arrayBuffer();
        const doc = await loadPdfDocument(buffer);
        if (cancelled) {
          void doc.destroy();
          return;
        }
        loaded = doc;
        const meta = await readPdfMeta(doc);
        if (cancelled) return;
        setPdf(doc);
        setNumPages(meta.numPages);
        initDocument(meta.numPages);
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
      setPdf(null);
      resetEditor();
      void loaded?.destroy();
    };
  }, [
    file,
    setNumPages,
    setStatus,
    setError,
    clearFile,
    initDocument,
    resetEditor,
  ]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TopBar />
      {pdf ? (
        <PdfDocumentProvider pdf={pdf}>
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
        </PdfDocumentProvider>
      ) : (
        <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">
          PDF を読み込んでいます…
        </div>
      )}
      <StatusBar />
    </div>
  );
}
