"use client";

import { useState, useCallback } from "react";
import { FileUploader } from "@/components/file-uploader/FileUploader";
import { PageGrid } from "@/components/pdf-viewer/PageGrid";
import { PageSorter } from "@/components/page-sorter/PageSorter";
import { MergeFileList } from "@/components/file-uploader/MergeFileList";
import { usePdf } from "@/hooks/use-pdf";
import { reorderPdfPages } from "@/lib/pdf/reorder";
import { mergePdfs } from "@/lib/pdf/merge";
import { downloadPdf, addFilenameSuffix } from "@/lib/utils/download";

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

  const isSelectable =
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

  const hasPages = pdf.pages.length > 0;
  const selectedCount = pdf.pages.filter((p) => p.selected).length;

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
                {isSelectable && (
                  <span className="text-sm text-zinc-500">
                    {selectedCount} 件選択中
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                {isSelectable && (
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

          {/* 他のタブ: 選択可能グリッド表示 */}
          {hasPages && isSelectable && (
            <PageGrid
              pages={pdf.pages}
              selectable
              onPageClick={pdf.togglePageSelection}
            />
          )}

          {/* 未実装タブのプレースホルダー */}
          {hasPages &&
            activeTab !== "reorder" &&
            activeTab !== "merge" &&
            !isSelectable && (
              <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800">
                <p className="text-sm text-zinc-400">
                  「{TABS.find((t) => t.id === activeTab)?.label}
                  」機能は次のフェーズで実装されます
                </p>
              </div>
            )}

          {/* 選択タブのプレースホルダー操作パネル */}
          {hasPages && isSelectable && (
            <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800">
              <p className="text-sm text-zinc-400">
                「{TABS.find((t) => t.id === activeTab)?.label}
                」の操作パネルは次のフェーズで実装されます
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
