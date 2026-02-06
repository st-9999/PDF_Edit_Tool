"use client";

import { useCallback } from "react";
import type { PdfFileInfo, PageInfo } from "@/types/pdf";

interface MergeFileListProps {
  files: PdfFileInfo[];
  pages: PageInfo[];
  onRemoveFile: (fileId: string) => void;
  onMoveFile: (fileId: string, direction: "up" | "down") => void;
}

export function MergeFileList({
  files,
  pages,
  onRemoveFile,
  onMoveFile,
}: MergeFileListProps) {
  if (files.length === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
        結合するファイル（上から順に結合されます）
      </h3>
      {files.map((file, index) => (
        <MergeFileItem
          key={file.id}
          file={file}
          pages={pages.filter((p) => p.fileId === file.id)}
          index={index}
          total={files.length}
          onRemove={() => onRemoveFile(file.id)}
          onMoveUp={() => onMoveFile(file.id, "up")}
          onMoveDown={() => onMoveFile(file.id, "down")}
        />
      ))}
    </div>
  );
}

interface MergeFileItemProps {
  file: PdfFileInfo;
  pages: PageInfo[];
  index: number;
  total: number;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function MergeFileItem({
  file,
  pages,
  index,
  total,
  onRemove,
  onMoveUp,
  onMoveDown,
}: MergeFileItemProps) {
  const formatSize = useCallback((bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }, []);

  return (
    <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800">
      {/* ファイルヘッダー */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-300">
            {index + 1}
          </span>
          <div>
            <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
              {file.name}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {file.pageCount} ページ / {formatSize(file.size)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onMoveUp}
            disabled={index === 0}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 disabled:opacity-30 dark:hover:bg-zinc-700"
            title="上に移動"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          </button>
          <button
            onClick={onMoveDown}
            disabled={index === total - 1}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 disabled:opacity-30 dark:hover:bg-zinc-700"
            title="下に移動"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <button
            onClick={onRemove}
            className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
            title="削除"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* サムネイルプレビュー */}
      <div className="border-t border-zinc-100 px-4 py-3 dark:border-zinc-700">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {pages.map((page) => (
            <div
              key={page.id}
              className="flex flex-shrink-0 flex-col items-center gap-0.5"
            >
              <div className="h-16 w-12 overflow-hidden rounded border border-zinc-200 dark:border-zinc-600">
                {page.thumbnailUrl && (
                  <img
                    src={page.thumbnailUrl}
                    alt={`Page ${page.pageNumber}`}
                    className="h-full w-full object-cover"
                    draggable={false}
                  />
                )}
              </div>
              <span className="text-[10px] text-zinc-400">{page.pageNumber}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
