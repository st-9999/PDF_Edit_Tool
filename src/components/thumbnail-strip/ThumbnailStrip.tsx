"use client";

import { useRef, useEffect, useCallback } from "react";
import type { PageInfo } from "@/types/pdf";

interface ThumbnailStripProps {
  pages: PageInfo[];
  selectedPageNumber: number;
  onPageSelect: (pageNumber: number) => void;
}

export function ThumbnailStrip({
  pages,
  selectedPageNumber,
  onPageSelect,
}: ThumbnailStripProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  // Auto-scroll to selected page
  useEffect(() => {
    const el = itemRefs.current.get(selectedPageNumber);
    if (el) {
      el.scrollIntoView({ behavior: "instant", block: "nearest" });
    }
  }, [selectedPageNumber]);

  const handleClick = useCallback(
    (pageNumber: number) => {
      onPageSelect(pageNumber);
    },
    [onPageSelect]
  );

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-zinc-200 px-3 py-2 dark:border-zinc-700">
        <h4 className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
          ページ一覧
        </h4>
      </div>
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto p-2"
      >
        <div className="flex flex-col gap-2">
          {pages.map((page) => {
            const isSelected = page.pageNumber === selectedPageNumber;
            return (
              <button
                key={page.id}
                ref={(el) => {
                  if (el) {
                    itemRefs.current.set(page.pageNumber, el);
                  } else {
                    itemRefs.current.delete(page.pageNumber);
                  }
                }}
                type="button"
                onClick={() => handleClick(page.pageNumber)}
                className={`
                  flex flex-col items-center gap-1 rounded p-1.5 transition-all
                  ${isSelected
                    ? "ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-950/30"
                    : "hover:bg-zinc-100 dark:hover:bg-zinc-800"}
                `}
              >
                <div className="w-full overflow-hidden rounded border border-zinc-200 dark:border-zinc-600">
                  {page.thumbnailUrl && (
                    <img
                      src={page.thumbnailUrl}
                      alt={`Page ${page.pageNumber}`}
                      className="h-auto w-full object-contain"
                      draggable={false}
                    />
                  )}
                </div>
                <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
                  {page.pageNumber}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
