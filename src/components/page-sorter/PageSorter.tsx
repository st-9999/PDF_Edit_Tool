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
import type { PageInfo } from "@/types/pdf";

interface PageSorterProps {
  pages: PageInfo[];
  onReorder: (pages: PageInfo[]) => void;
}

export function PageSorter({ pages, onReorder }: PageSorterProps) {
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
            <SortablePageItem key={page.id} page={page} />
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
}

function SortablePageItem({ page }: SortablePageItemProps) {
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
      {...listeners}
      className={`
        flex cursor-grab flex-col items-center gap-1 rounded-lg p-2
        transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800
        ${isDragging ? "opacity-30" : ""}
      `}
    >
      <div className="overflow-hidden rounded border border-zinc-200 shadow-sm dark:border-zinc-700">
        {page.thumbnailUrl ? (
          <img
            src={page.thumbnailUrl}
            alt={`Page ${page.pageNumber}`}
            className="h-auto w-full"
            draggable={false}
          />
        ) : (
          <div className="flex h-32 w-24 items-center justify-center bg-zinc-100 dark:bg-zinc-800">
            <span className="text-xs text-zinc-400">読込中</span>
          </div>
        )}
      </div>
      <span className="text-xs text-zinc-500 dark:text-zinc-400">
        {page.pageNumber}
      </span>
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
            className="h-auto w-full"
            draggable={false}
          />
        )}
      </div>
      <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
        {page.pageNumber}
      </span>
    </div>
  );
}
