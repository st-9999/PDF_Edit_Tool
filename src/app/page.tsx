"use client";

import { useState, useCallback } from "react";
import { FileUploader } from "@/components/file-uploader/FileUploader";
import { PageGrid } from "@/components/pdf-viewer/PageGrid";
import { usePdf } from "@/hooks/use-pdf";

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
  const pdf = usePdf();

  const handleFilesSelected = useCallback(
    (files: File[]) => {
      pdf.addFiles(files);
    },
    [pdf]
  );

  const isSelectable = activeTab === "delete" || activeTab === "extract" || activeTab === "rotate";

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

          {/* ファイル情報 */}
          {pdf.files.length > 0 && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">
                  {pdf.files.length} ファイル / {pdf.pages.length} ページ
                </span>
                {isSelectable && (
                  <span className="text-sm text-zinc-500">
                    {pdf.pages.filter((p) => p.selected).length} 件選択中
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

          {/* ページグリッド */}
          {pdf.pages.length > 0 && (
            <PageGrid
              pages={pdf.pages}
              selectable={isSelectable}
              onPageClick={isSelectable ? pdf.togglePageSelection : undefined}
            />
          )}

          {/* タブ別の操作パネル（Phase 2以降で実装） */}
          {pdf.pages.length > 0 && (
            <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800">
              <p className="text-sm text-zinc-400">
                「{TABS.find((t) => t.id === activeTab)?.label}」機能は次のフェーズで実装されます
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
