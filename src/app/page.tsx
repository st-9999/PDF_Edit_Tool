"use client";

import { useState, useCallback } from "react";
import { FileUploader } from "@/components/file-uploader/FileUploader";
import { PageSorter } from "@/components/page-sorter/PageSorter";
import { MergeFileList } from "@/components/file-uploader/MergeFileList";
import { PageSelector } from "@/components/page-selector/PageSelector";
import { usePdf } from "@/hooks/use-pdf";
import { mergePdfs, mergePdfsViaServer } from "@/lib/pdf/merge";
import { extractPages } from "@/lib/pdf/extract";
import { editPdfPages } from "@/lib/pdf/edit";
import { addBookmarks, readBookmarks } from "@/lib/pdf/bookmark";
import { BookmarkLayout } from "@/components/bookmark-editor/BookmarkLayout";
import {
  hasFileSystemAccess,
  openSaveDialog,
  writePdfToHandle,
  downloadPdfFallback,
  addFilenameSuffix,
} from "@/lib/utils/download";
import { useToast } from "@/components/ui/Toast";
import { ProcessingOverlay } from "@/components/ui/ProcessingOverlay";
import type { BookmarkNode } from "@/types/pdf";

const TABS = [
  { id: "reorder", label: "並び替え" },
  { id: "merge", label: "結合" },
  { id: "extract", label: "抽出" },
  { id: "bookmark", label: "しおり" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabId>("reorder");
  const [processing, setProcessing] = useState(false);
  const [bookmarks, setBookmarks] = useState<BookmarkNode[]>([]);
  const [activeBookmarkNodeId, setActiveBookmarkNodeId] = useState<string | null>(null);
  const [bookmarksLoaded, setBookmarksLoaded] = useState(false);
  const pdf = usePdf();
  const { showToast } = useToast();

  const handleFilesSelected = useCallback(
    (files: File[]) => {
      pdf.addFiles(files);
    },
    [pdf]
  );

  const isPageSelectTab = activeTab === "extract";

  // --- 2フェーズ保存ヘルパー ---
  // showSaveFilePicker はユーザージェスチャ直後にしか呼べないため、
  // (1) ダイアログを開く → (2) 重い処理 → (3) 結果を書き込む の順で実行する
  const performSave = useCallback(
    async (
      filename: string,
      process: () => Promise<Uint8Array>,
      errorLabel?: string
    ) => {
      // Phase 1: ダイアログを開く（ユーザージェスチャ中 = クリック直後）
      let handle: FileSystemFileHandle | null = null;
      if (hasFileSystemAccess()) {
        handle = await openSaveDialog(filename);
        if (!handle) return; // キャンセル
      }

      setProcessing(true);
      try {
        // Phase 2: PDF処理（大容量ファイルでは数秒〜十数秒かかる）
        const result = await process();

        // Phase 3: 結果を書き込み
        if (handle) {
          await writePdfToHandle(handle, result);
        } else {
          downloadPdfFallback(result, filename);
        }
        showToast(`${filename} を保存しました`, "success");
      } catch (err) {
        const label = errorLabel || "PDFの保存";
        const detail = err instanceof Error ? err.message : "";
        showToast(
          `${label}に失敗しました${detail ? `: ${detail}` : ""}`,
          "error"
        );
      } finally {
        setProcessing(false);
      }
    },
    [showToast]
  );

  // --- 保存ハンドラ（タブごと） ---

  const handleEditSave = useCallback(async () => {
    if (pdf.files.length === 0 || pdf.pages.length === 0) return;
    const file = pdf.files[0];
    const filePages = pdf.pages.filter((p) => p.fileId === file.id);
    if (filePages.length === 0) return;
    const filename = addFilenameSuffix(file.name, "_edited");
    await performSave(
      filename,
      async () => {
        const data = await file.sourceFile.arrayBuffer();
        return editPdfPages(data, filePages);
      },
      "PDFの編集"
    );
  }, [pdf.files, pdf.pages, performSave]);

  const handleMergeSave = useCallback(async () => {
    if (pdf.files.length < 2) return;

    const MERGE_SERVER_THRESHOLD = 100 * 1024 * 1024; // 100MB

    await performSave(
      "merged.pdf",
      async () => {
        const totalSize = pdf.files.reduce((sum, f) => sum + f.size, 0);

        if (totalSize >= MERGE_SERVER_THRESHOLD) {
          return mergePdfsViaServer(pdf.files.map((f) => f.sourceFile));
        } else {
          const sources = pdf.files.map((f) => ({
            getData: () => f.sourceFile.arrayBuffer(),
          }));
          return mergePdfs(sources);
        }
      },
      "PDFの結合"
    );
  }, [pdf.files, performSave]);

  const handleExtractSave = useCallback(async () => {
    const selected = pdf.pages.filter((p) => p.selected);
    if (selected.length === 0 || pdf.files.length === 0) return;
    const file = pdf.files[0];
    const filename = addFilenameSuffix(file.name, "_extracted");
    await performSave(
      filename,
      async () => {
        const data = await file.sourceFile.arrayBuffer();
        const extractPageNumbers = selected.map((p) => p.pageNumber);
        return extractPages(data, extractPageNumbers);
      },
      "ページの抽出"
    );
  }, [pdf.files, pdf.pages, performSave]);

  const handleLoadBookmarks = useCallback(async () => {
    if (pdf.files.length === 0 || bookmarksLoaded) return;
    try {
      const file = pdf.files[0];
      const data = await file.sourceFile.arrayBuffer();
      const existing = await readBookmarks(data);
      if (existing.length > 0) {
        setBookmarks(existing);
      }
    } catch {
      // 読み取り失敗は無視（空のエディタで開始）
    }
    setBookmarksLoaded(true);
  }, [pdf.files, bookmarksLoaded]);

  const handleBookmarkSave = useCallback(async () => {
    if (pdf.files.length === 0) return;
    const file = pdf.files[0];
    const filename = addFilenameSuffix(file.name, "_bookmarked");
    await performSave(
      filename,
      async () => {
        const data = await file.sourceFile.arrayBuffer();
        return addBookmarks(data, bookmarks);
      },
      "しおりの書き込み"
    );
  }, [pdf.files, bookmarks, performSave]);

  const handleDeletePage = useCallback(
    (pageId: string) => {
      if (pdf.pages.length <= 1) {
        showToast("最後の1ページは削除できません", "error");
        return;
      }
      pdf.deletePage(pageId);
    },
    [pdf, showToast]
  );

  // --- 統合保存ハンドラ ---

  const handleSave = useCallback(() => {
    switch (activeTab) {
      case "reorder":
        return handleEditSave();
      case "merge":
        return handleMergeSave();
      case "extract":
        return handleExtractSave();
      case "bookmark":
        return handleBookmarkSave();
    }
  }, [activeTab, handleEditSave, handleMergeSave, handleExtractSave, handleBookmarkSave]);

  const hasPages = pdf.pages.length > 0;
  const selectedCount = pdf.pages.filter((p) => p.selected).length;
  const deletedCount = pdf.files.length > 0
    ? pdf.files.reduce((sum, f) => sum + f.pageCount, 0) - pdf.pages.length
    : 0;
  const rotatedCount = pdf.pages.filter((p) => p.rotation !== 0).length;
  const isBookmarkFullscreen = activeTab === "bookmark" && hasPages;

  // 保存ボタンの無効化条件
  const isSaveDisabled =
    processing ||
    !hasPages ||
    (activeTab === "merge" && pdf.files.length < 2) ||
    (activeTab === "extract" && selectedCount === 0) ||
    (activeTab === "bookmark" && bookmarks.length === 0);

  return (
    <div className={`flex flex-col ${isBookmarkFullscreen ? "h-screen overflow-hidden" : "min-h-screen"}`}>
      <ProcessingOverlay visible={processing} message="PDFを処理中..." />

      {/* ヘッダー */}
      <header className={`border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950 ${isBookmarkFullscreen ? "px-4 py-2" : "px-6 py-4"}`}>
        <div className={`mx-auto flex items-center justify-between ${isBookmarkFullscreen ? "" : "max-w-6xl"}`}>
          <h1 className={`font-bold text-zinc-900 dark:text-zinc-100 ${isBookmarkFullscreen ? "text-base" : "text-xl"}`}>
            PDF Edit Tool
          </h1>
          {isBookmarkFullscreen && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {pdf.files[0]?.name} — {pdf.pages.length}ページ
              </span>
              {!bookmarksLoaded && (
                <button
                  onClick={handleLoadBookmarks}
                  className="rounded border border-zinc-300 px-3 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
                >
                  既存しおり読込
                </button>
              )}
              <button
                onClick={pdf.clearAll}
                className="rounded px-3 py-1 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
              >
                クリア
              </button>
            </div>
          )}
          {hasPages && (
            <button
              onClick={handleSave}
              disabled={isSaveDisabled}
              className={`flex items-center gap-2 rounded-lg bg-blue-600 font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50 ${isBookmarkFullscreen ? "px-4 py-1.5 text-xs" : "px-5 py-2 text-sm"}`}
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
              </svg>
              {processing ? "処理中..." : "保存"}
            </button>
          )}
        </div>
      </header>

      {/* タブナビゲーション */}
      <nav className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950" aria-label="機能メニュー">
        <div className="flex gap-0 overflow-x-auto px-6" role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`panel-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`
                px-4 py-3 text-sm font-medium transition-colors
                border-b-2
                ${
                  activeTab === tab.id
                    ? "border-blue-500 text-blue-600 dark:text-blue-400"
                    : "border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
                }
              `}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      {/* メインコンテンツ */}
      <main
        className={`flex-1 bg-zinc-50 dark:bg-zinc-900 ${isBookmarkFullscreen ? "min-h-0 overflow-hidden px-1" : "px-6 py-6"}`}
        role="tabpanel"
        id={`panel-${activeTab}`}
        aria-label={TABS.find((t) => t.id === activeTab)?.label}
      >
        {isBookmarkFullscreen ? (
          <BookmarkLayout
            bookmarks={bookmarks}
            onBookmarksChange={setBookmarks}
            pages={pdf.pages}
            files={pdf.files}
            activeBookmarkNodeId={activeBookmarkNodeId}
            onActiveNodeChange={setActiveBookmarkNodeId}
          />
        ) : (
          <div className="mx-auto max-w-6xl space-y-6">
            {/* ファイルアップロード */}
            <FileUploader
              onFilesSelected={handleFilesSelected}
              multiple={activeTab === "merge"}
              loading={pdf.loading}
              progress={pdf.progress}
            />

            {/* エラー表示 */}
            {pdf.error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
                {pdf.error}
              </div>
            )}

            {/* ファイル情報バー */}
            {hasPages && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">
                    {pdf.files.length} ファイル / {pdf.pages.length} ページ
                  </span>
                  {activeTab === "reorder" && (deletedCount > 0 || rotatedCount > 0) && (
                    <span className="text-sm text-zinc-500">
                      {deletedCount > 0 && `${deletedCount}ページ削除`}
                      {deletedCount > 0 && rotatedCount > 0 && " / "}
                      {rotatedCount > 0 && `${rotatedCount}ページ回転`}
                    </span>
                  )}
                  {isPageSelectTab && (
                    <span className="text-sm text-zinc-500">
                      {selectedCount} 件選択中
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  {isPageSelectTab && (
                    <>
                      <button
                        onClick={pdf.selectAllPages}
                        className="rounded px-3 py-1 text-xs text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/30"
                      >
                        全選択
                      </button>
                      <button
                        onClick={pdf.deselectAllPages}
                        className="rounded px-3 py-1 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      >
                        全解除
                      </button>
                    </>
                  )}
                  <button
                    onClick={pdf.clearAll}
                    className="rounded px-3 py-1 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                  >
                    クリア
                  </button>
                </div>
              </div>
            )}

            {/* 並び替え（+削除+回転）タブ */}
            {hasPages && activeTab === "reorder" && (
              <>
                <p className="text-xs text-zinc-400">
                  サムネイルをドラッグして並び替え / ×で削除 / 矢印で回転
                </p>
                <PageSorter
                  pages={pdf.pages}
                  onReorder={pdf.reorderPages}
                  onDeletePage={handleDeletePage}
                  onRotatePage={pdf.rotatePage}
                  canDelete={pdf.pages.length > 1}
                />
              </>
            )}

            {/* 結合タブ */}
            {hasPages && activeTab === "merge" && (
              <>
                <MergeFileList
                  files={pdf.files}
                  pages={pdf.pages}
                  onRemoveFile={pdf.removeFile}
                  onMoveFile={pdf.moveFile}
                />
                {pdf.files.length < 2 && (
                  <p className="text-center text-sm text-zinc-400">
                    結合するには2つ以上のPDFファイルをアップロードしてください
                  </p>
                )}
              </>
            )}

            {/* 抽出タブ */}
            {hasPages && activeTab === "extract" && (
              <PageSelector
                pages={pdf.pages}
                onToggleSelection={pdf.togglePageSelection}
                onSelectAll={pdf.selectAllPages}
                onDeselectAll={pdf.deselectAllPages}
                onSelectByRange={pdf.selectByPageNumbers}
              />
            )}
          </div>
        )}
      </main>
    </div>
  );
}
