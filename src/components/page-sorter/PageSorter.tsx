"use client";

import { useState, useCallback } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { PageInfo, PageRotation } from "@/types/pdf";

interface PageSorterProps {
  pages: PageInfo[];
  onReorder: (pages: PageInfo[]) => void;
  onDeletePage?: (pageId: string) => void;
  onRotatePage?: (pageId: string, angle: PageRotation) => void;
  canDelete?: boolean;
}

export function PageSorter({
  pages,
  onReorder,
  onDeletePage,
  onRotatePage,
  canDelete = true,
}: PageSorterProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);

      if (over && active.id !== over.id) {
        const oldIndex = pages.findIndex((p) => p.id === active.id);
        const newIndex = pages.findIndex((p) => p.id === over.id);
        if (oldIndex !== -1 && newIndex !== -1) {
          onReorder(arrayMove(pages, oldIndex, newIndex));
        }
      }
    },
    [pages, onReorder]
  );

  const activePage = activeId ? pages.find((p) => p.id === activeId) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={pages.map((p) => p.id)}
        strategy={rectSortingStrategy}
      >
        <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
          {pages.map((page) => (
            <SortablePageItem
              key={page.id}
              page={page}
              onDelete={onDeletePage}
              onRotate={onRotatePage}
              canDelete={canDelete}
            />
          ))}
        </div>
      </SortableContext>

      <DragOverlay>
        {activePage ? <PageOverlay page={activePage} /> : null}
      </DragOverlay>
    </DndContext>
  );
}

interface SortablePageItemProps {
  page: PageInfo;
  onDelete?: (pageId: string) => void;
  onRotate?: (pageId: string, angle: PageRotation) => void;
  canDelete?: boolean;
}

function SortablePageItem({
  page,
  onDelete,
  onRotate,
  canDelete,
}: SortablePageItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: page.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className={`
        group relative flex flex-col items-center gap-1 rounded-lg p-2
        transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800
        ${isDragging ? "opacity-30" : ""}
      `}
    >
      {/* 削除ボタン */}
      {onDelete && canDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(page.id);
          }}
          className="absolute top-1 right-1 z-10 hidden h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white shadow-sm hover:bg-red-600 group-hover:flex"
          title="ページを削除"
        >
          ×
        </button>
      )}

      {/* サムネイル（ドラッグハンドル） */}
      <div
        {...listeners}
        className="cursor-grab overflow-hidden rounded border border-zinc-200 shadow-sm dark:border-zinc-700"
      >
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

      {/* 回転ボタン + ページ番号 */}
      <div className="flex items-center gap-1">
        {onRotate && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRotate(page.id, 270);
            }}
            className="rounded p-0.5 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-zinc-700"
            title="左に90°回転"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4" />
            </svg>
          </button>
        )}
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          {page.pageNumber}
          {page.rotation !== 0 && (
            <span className="ml-0.5 text-blue-500">{page.rotation}°</span>
          )}
        </span>
        {onRotate && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRotate(page.id, 90);
            }}
            className="rounded p-0.5 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-zinc-700"
            title="右に90°回転"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10H11a5 5 0 00-5 5v2M21 10l-4-4M21 10l-4 4" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

function PageOverlay({ page }: { page: PageInfo }) {
  return (
    <div className="flex cursor-grabbing flex-col items-center gap-1 rounded-lg bg-white p-2 shadow-xl ring-2 ring-blue-500 dark:bg-zinc-800">
      <div className="overflow-hidden rounded border border-zinc-200 dark:border-zinc-700">
        {page.thumbnailUrl && (
          <img
            src={page.thumbnailUrl}
            alt={`Page ${page.pageNumber}`}
            className="h-auto w-full transition-transform"
            style={{ transform: `rotate(${page.rotation}deg)` }}
            draggable={false}
          />
        )}
      </div>
      <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
        {page.pageNumber}
        {page.rotation !== 0 && (
          <span className="ml-0.5">{page.rotation}°</span>
        )}
      </span>
    </div>
  );
}
