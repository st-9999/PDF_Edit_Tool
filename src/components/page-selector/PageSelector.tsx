"use client";

import { useState, useCallback } from "react";
import type { PageInfo } from "@/types/pdf";
import { parsePageRange, formatPageRange } from "@/lib/utils/page-range";

interface PageSelectorProps {
  pages: PageInfo[];
  onToggleSelection: (pageId: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  /** ページ範囲文字列からまとめて選択する */
  onSelectByRange: (pageNumbers: number[]) => void;
}

export function PageSelector({
  pages,
  onToggleSelection,
  onSelectAll,
  onDeselectAll,
  onSelectByRange,
}: PageSelectorProps) {
  const [rangeInput, setRangeInput] = useState("");
  const [rangeError, setRangeError] = useState<string | null>(null);

  const selectedCount = pages.filter((p) => p.selected).length;

  const handleRangeApply = useCallback(() => {
    setRangeError(null);
    try {
      const pageNumbers = parsePageRange(rangeInput, pages.length);
      if (pageNumbers.length === 0) {
        setRangeError("ページ番号を入力してください");
        return;
      }
      onSelectByRange(pageNumbers);
    } catch (err) {
      setRangeError(
        err instanceof Error ? err.message : "入力が不正です"
      );
    }
  }, [rangeInput, pages.length, onSelectByRange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleRangeApply();
      }
    },
    [handleRangeApply]
  );

  // 現在の選択状態を範囲文字列として表示
  const selectedPages = pages
    .filter((p) => p.selected)
    .map((p) => p.pageNumber);
  const selectionSummary = formatPageRange(selectedPages);

  return (
    <div className="space-y-4">
      {/* 操作バー */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={onSelectAll}
            className="rounded px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/30"
          >
            全選択
          </button>
          <button
            onClick={onDeselectAll}
            className="rounded px-3 py-1.5 text-xs font-medium text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            全解除
          </button>
        </div>

        <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-700" />

        {/* ページ範囲入力 */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={rangeInput}
            onChange={(e) => {
              setRangeInput(e.target.value);
              setRangeError(null);
            }}
            onKeyDown={handleKeyDown}
            placeholder="例: 1-5, 8, 12-15"
            className="w-48 rounded border border-zinc-300 px-3 py-1.5 text-xs text-zinc-800 placeholder-zinc-400 focus:border-blue-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200"
          />
          <button
            onClick={handleRangeApply}
            className="rounded bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
          >
            範囲選択
          </button>
        </div>

        {/* 選択状態の要約 */}
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          {selectedCount} / {pages.length} ページ選択中
          {selectionSummary && (
            <span className="ml-1 text-zinc-400">({selectionSummary})</span>
          )}
        </span>
      </div>

      {/* 範囲入力エラー */}
      {rangeError && (
        <p className="text-xs text-red-500">{rangeError}</p>
      )}

      {/* サムネイルグリッド */}
      <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
        {pages.map((page) => (
          <button
            key={page.id}
            type="button"
            onClick={() => onToggleSelection(page.id)}
            className={`
              group relative flex flex-col items-center gap-1 rounded-lg p-2
              transition-all hover:bg-zinc-100 dark:hover:bg-zinc-800
              ${
                page.selected
                  ? "ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-950/30"
                  : ""
              }
            `}
          >
            {/* 選択チェックマーク */}
            <div
              className={`
                absolute top-1 right-1 flex h-5 w-5 items-center justify-center
                rounded-full border-2 text-xs transition-colors
                ${
                  page.selected
                    ? "border-blue-500 bg-blue-500 text-white"
                    : "border-zinc-300 bg-white dark:border-zinc-600 dark:bg-zinc-800"
                }
              `}
            >
              {page.selected && "✓"}
            </div>

            {/* サムネイル画像 */}
            <div className="overflow-hidden rounded border border-zinc-200 shadow-sm dark:border-zinc-700">
              {page.thumbnailUrl ? (
                <img
                  src={page.thumbnailUrl}
                  alt={`Page ${page.pageNumber}`}
                  className="h-auto w-full"
                  style={{ transform: `rotate(${page.rotation}deg)` }}
                  draggable={false}
                />
              ) : (
                <div className="flex h-32 w-24 items-center justify-center bg-zinc-100 dark:bg-zinc-800">
                  <span className="text-xs text-zinc-400">読込中</span>
                </div>
              )}
            </div>

            {/* ページ番号 */}
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              {page.pageNumber}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
