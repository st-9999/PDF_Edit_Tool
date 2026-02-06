"use client";

import { useState, useCallback } from "react";
import { FileUploader } from "@/components/file-uploader/FileUploader";
import { PageGrid } from "@/components/pdf-viewer/PageGrid";
import { PageSorter } from "@/components/page-sorter/PageSorter";
import { MergeFileList } from "@/components/file-uploader/MergeFileList";
import { PageSelector } from "@/components/page-selector/PageSelector";
import { usePdf } from "@/hooks/use-pdf";
import { reorderPdfPages } from "@/lib/pdf/reorder";
import { mergePdfs } from "@/lib/pdf/merge";
import { deletePages } from "@/lib/pdf/delete";
import { extractPages } from "@/lib/pdf/extract";
import { rotatePages } from "@/lib/pdf/rotate";
import { downloadPdf, addFilenameSuffix } from "@/lib/utils/download";
import type { PageRotation } from "@/types/pdf";

const TABS = [
  { id: "reorder", label: "並び替え" },
  { id: "merge", label: "結合" },
  { id: "delete", label: "削除" },
  { id: "extract", label: "抽出" },
  { id: "rotate", label: "回転" },
  { id: "bookmark", label: "しおり" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabId>("reorder");
  const [processing, setProcessing] = useState(false);
  const pdf = usePdf();

  const handleFilesSelected = useCallback(
    (files: File[]) => {
      pdf.addFiles(files);
    },
    [pdf]
  );

  const isPageSelectTab =
    activeTab === "delete" || activeTab === "extract" || activeTab === "rotate";

  const handleReorderDownload = useCallback(async () => {
    if (pdf.files.length === 0 || pdf.pages.length === 0) return;

    setProcessing(true);
    try {
      const file = pdf.files[0];
      // pages の現在の順序から 0始まりインデックスの配列を生成
      const newOrder = pdf.pages.map((p) => p.pageNumber - 1);
      const result = await reorderPdfPages(file.data, newOrder);
      const filename = addFilenameSuffix(file.name, "_reordered");
      downloadPdf(result, filename);
    } catch {
      alert("PDFの並び替えに失敗しました");
    } finally {
      setProcessing(false);
    }
  }, [pdf.files, pdf.pages]);

  const handleMergeDownload = useCallback(async () => {
    if (pdf.files.length < 2) return;

    setProcessing(true);
    try {
      const sources = pdf.files.map((f) => ({ data: f.data }));
      const result = await mergePdfs(sources);
      downloadPdf(result, "merged.pdf");
    } catch {
      alert("PDFの結合に失敗しました");
    } finally {
      setProcessing(false);
    }
  }, [pdf.files]);

  const handleDeleteDownload = useCallback(async () => {
    const selected = pdf.pages.filter((p) => p.selected);
    if (selected.length === 0 || pdf.files.length === 0) return;
    if (selected.length === pdf.pages.length) {
      alert("すべてのページを削除することはできません");
      return;
    }

    setProcessing(true);
    try {
      const file = pdf.files[0];
      const deletePageNumbers = selected.map((p) => p.pageNumber);
      const result = await deletePages(file.data, deletePageNumbers);
      const filename = addFilenameSuffix(file.name, "_deleted");
      downloadPdf(result, filename);
    } catch {
      alert("ページの削除に失敗しました");
    } finally {
      setProcessing(false);
    }
  }, [pdf.files, pdf.pages]);

  const handleExtractDownload = useCallback(async () => {
    const selected = pdf.pages.filter((p) => p.selected);
    if (selected.length === 0 || pdf.files.length === 0) return;

    setProcessing(true);
    try {
      const file = pdf.files[0];
      const extractPageNumbers = selected.map((p) => p.pageNumber);
      const result = await extractPages(file.data, extractPageNumbers);
      const filename = addFilenameSuffix(file.name, "_extracted");
      downloadPdf(result, filename);
    } catch {
      alert("ページの抽出に失敗しました");
    } finally {
      setProcessing(false);
    }
  }, [pdf.files, pdf.pages]);

  const handleRotateDownload = useCallback(async () => {
    if (pdf.files.length === 0) return;
    const rotated = pdf.pages.filter((p) => p.rotation !== 0);
    if (rotated.length === 0) return;

    setProcessing(true);
    try {
      const file = pdf.files[0];
      const rotations: Record<number, PageRotation> = {};
      for (const p of rotated) {
        rotations[p.pageNumber] = p.rotation;
      }
      const result = await rotatePages(file.data, rotations);
      const filename = addFilenameSuffix(file.name, "_rotated");
      downloadPdf(result, filename);
    } catch {
      alert("ページの回転に失敗しました");
    } finally {
      setProcessing(false);
    }
  }, [pdf.files, pdf.pages]);

  const hasPages = pdf.pages.length > 0;
  const selectedCount = pdf.pages.filter((p) => p.selected).length;
  const rotatedCount = pdf.pages.filter((p) => p.rotation !== 0).length;

  return (
    <div className="flex min-h-screen flex-col">
      {/* ヘッダー */}
      <header className="border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
          PDF Edit Tool
        </h1>
      </header>

      {/* タブナビゲーション */}
      <nav className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex gap-0 px-6">
          {TABS.map((tab) => (
            <button
              key={tab.id}
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
      <main className="flex-1 bg-zinc-50 px-6 py-6 dark:bg-zinc-900">
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

          {/* タブ別コンテンツ */}
          {hasPages && activeTab === "reorder" && (
            <>
              <PageSorter pages={pdf.pages} onReorder={pdf.reorderPages} />
              <div className="flex justify-end">
                <button
                  onClick={handleReorderDownload}
                  disabled={processing}
                  className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                >
                  {processing ? "処理中..." : "並び替えたPDFをダウンロード"}
                </button>
              </div>
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
              <div className="flex justify-end">
                <button
                  onClick={handleMergeDownload}
                  disabled={processing || pdf.files.length < 2}
                  className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                >
                  {processing ? "処理中..." : "結合したPDFをダウンロード"}
                </button>
              </div>
              {pdf.files.length < 2 && (
                <p className="text-center text-sm text-zinc-400">
                  結合するには2つ以上のPDFファイルをアップロードしてください
                </p>
              )}
            </>
          )}

          {/* 削除タブ */}
          {hasPages && activeTab === "delete" && (
            <>
              <PageSelector
                pages={pdf.pages}
                onToggleSelection={pdf.togglePageSelection}
                onSelectAll={pdf.selectAllPages}
                onDeselectAll={pdf.deselectAllPages}
                onSelectByRange={pdf.selectByPageNumbers}
              />
              <div className="flex justify-end">
                <button
                  onClick={handleDeleteDownload}
                  disabled={processing || selectedCount === 0}
                  className="rounded-lg bg-red-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                >
                  {processing
                    ? "処理中..."
                    : `選択した ${selectedCount} ページを削除してダウンロード`}
                </button>
              </div>
            </>
          )}

          {/* 抽出タブ */}
          {hasPages && activeTab === "extract" && (
            <>
              <PageSelector
                pages={pdf.pages}
                onToggleSelection={pdf.togglePageSelection}
                onSelectAll={pdf.selectAllPages}
                onDeselectAll={pdf.deselectAllPages}
                onSelectByRange={pdf.selectByPageNumbers}
              />
              <div className="flex justify-end">
                <button
                  onClick={handleExtractDownload}
                  disabled={processing || selectedCount === 0}
                  className="rounded-lg bg-green-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
                >
                  {processing
                    ? "処理中..."
                    : `選択した ${selectedCount} ページを抽出してダウンロード`}
                </button>
              </div>
            </>
          )}

          {/* 回転タブ */}
          {hasPages && activeTab === "rotate" && (
            <>
              {/* 一括回転ボタン */}
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">
                  選択中のページを一括回転:
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => pdf.rotateSelectedPages(90)}
                    disabled={selectedCount === 0}
                    className="flex items-center gap-1 rounded border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-700"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                    90°
                  </button>
                  <button
                    onClick={() => pdf.rotateSelectedPages(180)}
                    disabled={selectedCount === 0}
                    className="flex items-center gap-1 rounded border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-700"
                  >
                    180°
                  </button>
                  <button
                    onClick={() => pdf.rotateSelectedPages(270)}
                    disabled={selectedCount === 0}
                    className="flex items-center gap-1 rounded border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-700"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    270°
                  </button>
                </div>
                <span className="text-xs text-zinc-400">
                  {selectedCount} 件選択 / {rotatedCount} 件回転済み
                </span>
              </div>

              {/* サムネイルグリッド（個別回転ボタン付き） */}
              <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
                {pdf.pages.map((page) => (
                  <div key={page.id} className="group relative flex flex-col items-center gap-1">
                    {/* 選択クリック領域 */}
                    <button
                      type="button"
                      onClick={() => pdf.togglePageSelection(page.id)}
                      className={`
                        relative w-full rounded-lg p-2 transition-all
                        hover:bg-zinc-100 dark:hover:bg-zinc-800
                        ${page.selected ? "ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-950/30" : ""}
                      `}
                    >
                      {/* 選択チェックマーク */}
                      <div
                        className={`
                          absolute top-1 right-1 z-10 flex h-5 w-5 items-center justify-center
                          rounded-full border-2 text-xs transition-colors
                          ${page.selected
                            ? "border-blue-500 bg-blue-500 text-white"
                            : "border-zinc-300 bg-white dark:border-zinc-600 dark:bg-zinc-800"}
                        `}
                      >
                        {page.selected && "✓"}
                      </div>

                      {/* サムネイル */}
                      <div className="mx-auto overflow-hidden rounded border border-zinc-200 shadow-sm dark:border-zinc-700">
                        {page.thumbnailUrl ? (
                          <img
                            src={page.thumbnailUrl}
                            alt={`Page ${page.pageNumber}`}
                            className="h-auto w-full transition-transform"
                            style={{ transform: `rotate(${page.rotation}deg)` }}
                            draggable={false}
                          />
                        ) : (
                          <div className="flex h-32 w-24 items-center justify-center bg-zinc-100 dark:bg-zinc-800">
                            <span className="text-xs text-zinc-400">読込中</span>
                          </div>
                        )}
                      </div>
                    </button>

                    {/* 個別回転ボタン + ページ番号 */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => pdf.rotatePage(page.id, 270)}
                        className="rounded p-0.5 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-zinc-700"
                        title="左に90°回転"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4" />
                        </svg>
                      </button>
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        {page.pageNumber}
                        {page.rotation !== 0 && (
                          <span className="ml-0.5 text-blue-500">{page.rotation}°</span>
                        )}
                      </span>
                      <button
                        onClick={() => pdf.rotatePage(page.id, 90)}
                        className="rounded p-0.5 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-zinc-700"
                        title="右に90°回転"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10H11a5 5 0 00-5 5v2M21 10l-4-4M21 10l-4 4" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* ダウンロードボタン */}
              <div className="flex justify-end">
                <button
                  onClick={handleRotateDownload}
                  disabled={processing || rotatedCount === 0}
                  className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                >
                  {processing
                    ? "処理中..."
                    : `回転したPDFをダウンロード (${rotatedCount}ページ)`}
                </button>
              </div>
            </>
          )}

          {/* 未実装タブのプレースホルダー */}
          {hasPages &&
            activeTab !== "reorder" &&
            activeTab !== "merge" &&
            activeTab !== "delete" &&
            activeTab !== "extract" &&
            activeTab !== "rotate" && (
              <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800">
                <p className="text-sm text-zinc-400">
                  「{TABS.find((t) => t.id === activeTab)?.label}
                  」機能は次のフェーズで実装されます
                </p>
              </div>
            )}
        </div>
      </main>
    </div>
  );
}
