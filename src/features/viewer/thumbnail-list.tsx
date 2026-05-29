"use client";

import type { MouseEvent } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVerticalIcon } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useViewerStore } from "@/store/viewer-store";
import { useEditorStore } from "@/store/editor-store";
import { ROTATION_STEP, type PageRef } from "@/lib/editor/operations";
import { useEditActions } from "@/features/editor/use-edit-actions";
import { usePdfSources } from "./pdf-sources-context";
import { Thumbnail } from "./thumbnail";

function SortableThumbnail({
  pdf,
  page,
  position,
  width,
  selected,
  current,
  onClick,
}: {
  pdf: PDFDocumentProxy | undefined;
  page: PageRef;
  position: number;
  width: number;
  selected: boolean;
  current: boolean;
  onClick: (event: MouseEvent) => void;
}) {
  const {
    setNodeRef,
    setActivatorNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: page.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex w-full items-center justify-center gap-1"
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        aria-label={`ページ ${position} を並び替え`}
        className="text-muted-foreground hover:text-foreground cursor-grab touch-none active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVerticalIcon className="size-4" aria-hidden />
      </button>
      {pdf ? (
        <Thumbnail
          pdf={pdf}
          pageNumber={page.sourceIndex + 1}
          position={position}
          rotation={page.rotation}
          width={width}
          selected={selected}
          current={current}
          onClick={onClick}
        />
      ) : null}
    </div>
  );
}

/** サムネイル一覧。D&D 並び替え＋クリック/Ctrl/Shift 複数選択。 */
export function ThumbnailList() {
  const { getProxy } = usePdfSources();
  const pages = useEditorStore((s) => s.pages);
  const selected = useEditorStore((s) => s.selection.selected);
  const selectClick = useEditorStore((s) => s.selectClick);
  const selectToggle = useEditorStore((s) => s.selectToggle);
  const selectRangeTo = useEditorStore((s) => s.selectRangeTo);
  const reorder = useEditorStore((s) => s.reorder);
  const currentPage = useViewerStore((s) => s.currentPage);
  const requestPage = useViewerStore((s) => s.requestPage);
  const thumbnailWidth = useViewerStore((s) => s.thumbnailWidth);
  const actions = useEditActions();

  // 右クリック時、対象が未選択ならそのページだけを選択してから操作する
  const ensureSelected = (id: string) => {
    if (!useEditorStore.getState().selection.selected.has(id)) selectClick(id);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const handleClick = (event: MouseEvent, id: string, position: number) => {
    if (event.shiftKey) selectRangeTo(id);
    else if (event.ctrlKey || event.metaKey) selectToggle(id);
    else selectClick(id);
    requestPage(position);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const newIndex = pages.findIndex((p) => p.id === over.id);
    if (newIndex >= 0) reorder([String(active.id)], newIndex);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={pages.map((p) => p.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex flex-col items-center gap-1 p-2">
          {pages.map((page, index) => {
            const position = index + 1;
            return (
              <ContextMenu key={page.id}>
                <ContextMenuTrigger
                  className="w-full"
                  onContextMenu={() => ensureSelected(page.id)}
                >
                  <SortableThumbnail
                    pdf={getProxy(page.sourceId)}
                    page={page}
                    position={position}
                    width={thumbnailWidth}
                    selected={selected.has(page.id)}
                    current={position === currentPage}
                    onClick={(event) => handleClick(event, page.id, position)}
                  />
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem
                    onClick={() => actions.rotate(-ROTATION_STEP)}
                  >
                    左に回転
                  </ContextMenuItem>
                  <ContextMenuItem
                    onClick={() => actions.rotate(ROTATION_STEP)}
                  >
                    右に回転
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => void actions.extract()}>
                    抽出
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => void actions.split()}>
                    分割
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    variant="destructive"
                    onClick={() => actions.remove()}
                  >
                    削除
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            );
          })}
        </div>
      </SortableContext>
    </DndContext>
  );
}
