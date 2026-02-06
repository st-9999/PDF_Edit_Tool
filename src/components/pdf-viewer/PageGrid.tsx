"use client";

import { useCallback } from "react";
import type { PageInfo } from "@/types/pdf";

interface PageGridProps {
  pages: PageInfo[];
  selectable?: boolean;
  onPageClick?: (pageId: string) => void;
}

export function PageGrid({
  pages,
  selectable = false,
  onPageClick,
}: PageGridProps) {
  const handleClick = useCallback(
    (pageId: string) => {
      onPageClick?.(pageId);
    },
    [onPageClick]
  );

  if (pages.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-zinc-400">
        PDFファイルを読み込んでください
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
      {pages.map((page) => (
        <PageThumbnail
          key={page.id}
          page={page}
          selectable={selectable}
          onClick={() => handleClick(page.id)}
        />
      ))}
    </div>
  );
}

interface PageThumbnailProps {
  page: PageInfo;
  selectable: boolean;
  onClick: () => void;
}

function PageThumbnail({ page, selectable, onClick }: PageThumbnailProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        group relative flex flex-col items-center gap-1 rounded-lg p-2
        transition-all hover:bg-zinc-100 dark:hover:bg-zinc-800
        ${
          page.selected && selectable
            ? "ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-950/30"
            : ""
        }
      `}
    >
      {/* 選択チェックマーク */}
      {selectable && (
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
      )}

      {/* サムネイル画像 */}
      <div className="overflow-hidden rounded border border-zinc-200 shadow-sm dark:border-zinc-700">
        {page.thumbnailUrl ? (
          <img
            src={page.thumbnailUrl}
            alt={`Page ${page.pageNumber}`}
            className="h-auto w-full"
            style={{
              transform: `rotate(${page.rotation}deg)`,
            }}
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
  );
}
