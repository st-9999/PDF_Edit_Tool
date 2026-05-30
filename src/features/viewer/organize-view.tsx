"use client";

import { useEffect, useState, type MouseEvent } from "react";
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
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowLeftIcon,
  CheckCheckIcon,
  FileOutputIcon,
  RotateCcwIcon,
  RotateCwIcon,
  ScissorsIcon,
  Trash2Icon,
  XIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { editorSelectors, useEditorStore } from "@/store/editor-store";
import { useViewerStore } from "@/store/viewer-store";
import { ROTATION_STEP, type PageRef } from "@/lib/editor/operations";
import {
  THUMBNAIL_WIDTH_DEFAULT,
  THUMBNAIL_WIDTH_MAX,
  THUMBNAIL_WIDTH_MIN,
} from "@/lib/pdf/constants";
import { useEditActions } from "@/features/editor/use-edit-actions";
import { ProgressOverlay } from "@/features/progress/progress-overlay";
import { usePdfSources } from "./pdf-sources-context";
import { Thumbnail } from "./thumbnail";

/** グリッド内の並べ替え可能な 1 タイル。タイル全体をドラッグして並べ替える。 */
function SortableTile({
  proxy,
  page,
  position,
  width,
  selected,
  current,
  onSelect,
  onOpen,
  onContextMenu,
  actions,
}: {
  proxy: PDFDocumentProxy | undefined;
  page: PageRef;
  position: number;
  width: number;
  selected: boolean;
  current: boolean;
  onSelect: (event: MouseEvent) => void;
  onOpen: () => void;
  onContextMenu: () => void;
  actions: ReturnType<typeof useEditActions>;
}) {
  const { setNodeRef, listeners, transform, transition, isDragging } =
    useSortable({ id: page.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      onDoubleClick={onOpen}
      className="flex touch-none justify-center"
    >
      <ContextMenu>
        <ContextMenuTrigger onContextMenu={onContextMenu}>
          {proxy ? (
            <Thumbnail
              pdf={proxy}
              pageNumber={page.sourceIndex + 1}
              position={position}
              rotation={page.rotation}
              width={width}
              selected={selected}
              current={current}
              multiSelectMode
              onClick={onSelect}
            />
          ) : null}
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={() => actions.rotate(-ROTATION_STEP)}>
            左に回転
          </ContextMenuItem>
          <ContextMenuItem onClick={() => actions.rotate(ROTATION_STEP)}>
            右に回転
          </ContextMenuItem>
          <ContextMenuItem onClick={() => void actions.extract()}>
            抽出
          </ContextMenuItem>
          <ContextMenuItem onClick={() => void actions.split()}>
            分割
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem variant="destructive" onClick={onOpen}>
            このページを表示
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </div>
  );
}

/**
 * ページを一覧整理（グリッド）画面。全ページをサムネで並べ、
 * ドラッグ並べ替え・回転・削除・抽出・分割を行える。編集は editor-store を共有するため
 * ビュアーに戻ると変更が反映されている。
 */
export function OrganizeView() {
  const { getProxy } = usePdfSources();
  const pages = useEditorStore((s) => s.pages);
  const selected = useEditorStore((s) => s.selection.selected);
  const selectedCount = useEditorStore(editorSelectors.selectedCount);
  const selectClick = useEditorStore((s) => s.selectClick);
  const selectToggle = useEditorStore((s) => s.selectToggle);
  const selectRangeTo = useEditorStore((s) => s.selectRangeTo);
  const selectAll = useEditorStore((s) => s.selectAll);
  const clearSelection = useEditorStore((s) => s.clear);
  const reorder = useEditorStore((s) => s.reorder);

  const thumbnailWidth = useViewerStore((s) => s.thumbnailWidth);
  const thumbnailZoomIn = useViewerStore((s) => s.thumbnailZoomIn);
  const thumbnailZoomOut = useViewerStore((s) => s.thumbnailZoomOut);
  const setOrganize = useViewerStore((s) => s.setOrganize);
  const currentPage = useViewerStore((s) => s.currentPage);
  const requestPage = useViewerStore((s) => s.requestPage);

  const actions = useEditActions();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const hasSelection = selectedCount > 0;
  const percent = Math.round((thumbnailWidth / THUMBNAIL_WIDTH_DEFAULT) * 100);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const exit = () => setOrganize(false);

  // Esc でビュアーに戻る（削除確認ダイアログ表示中は無視＝ダイアログ側が閉じる）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !confirmOpen) setOrganize(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmOpen, setOrganize]);

  const handleSelect = (event: MouseEvent, id: string) => {
    if (event.shiftKey) selectRangeTo(id);
    else if (event.ctrlKey || event.metaKey) selectToggle(id);
    else selectClick(id);
  };

  const openInViewer = (position: number) => {
    requestPage(position);
    setOrganize(false);
  };

  const ensureSelected = (id: string) => {
    if (!useEditorStore.getState().selection.selected.has(id)) selectClick(id);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const newIndex = pages.findIndex((p) => p.id === over.id);
    if (newIndex >= 0) reorder([String(active.id)], newIndex);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TooltipProvider delay={300}>
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2">
          <Button type="button" variant="ghost" size="sm" onClick={exit}>
            <ArrowLeftIcon aria-hidden />
            ビューアに戻る
          </Button>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pl-1">
            <span className="font-medium">ページを一覧整理</span>
            <span className="text-muted-foreground text-xs">
              {hasSelection ? `${selectedCount} ページ選択中` : "ページ未選択"}
            </span>
            <span className="text-muted-foreground hidden text-xs sm:inline">
              Ctrl＋クリックで複数選択（Shift＋クリックで範囲選択）
            </span>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={selectAll}
              disabled={pages.length === 0}
            >
              <CheckCheckIcon aria-hidden />
              全選択
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={clearSelection}
              disabled={!hasSelection}
            >
              <XIcon aria-hidden />
              選択解除
            </Button>

            <div className="bg-border mx-1 h-5 w-px" aria-hidden />

            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label="左に回転"
                    disabled={!hasSelection}
                    onClick={() => actions.rotate(-ROTATION_STEP)}
                  >
                    <RotateCcwIcon aria-hidden />
                  </Button>
                }
              />
              <TooltipContent>左に回転</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label="右に回転"
                    disabled={!hasSelection}
                    onClick={() => actions.rotate(ROTATION_STEP)}
                  >
                    <RotateCwIcon aria-hidden />
                  </Button>
                }
              />
              <TooltipContent>右に回転</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label="削除"
                    disabled={!hasSelection}
                    onClick={() => setConfirmOpen(true)}
                  >
                    <Trash2Icon aria-hidden />
                  </Button>
                }
              />
              <TooltipContent>削除</TooltipContent>
            </Tooltip>

            <div className="bg-border mx-1 h-5 w-px" aria-hidden />

            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={!hasSelection}
              onClick={() => void actions.extract()}
            >
              <FileOutputIcon aria-hidden />
              抽出
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={!hasSelection}
              onClick={() => void actions.split()}
            >
              <ScissorsIcon aria-hidden />
              分割
            </Button>

            <div className="bg-border mx-1 h-5 w-px" aria-hidden />

            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-7"
              aria-label="サムネイルを縮小"
              disabled={thumbnailWidth <= THUMBNAIL_WIDTH_MIN}
              onClick={thumbnailZoomOut}
            >
              <ZoomOutIcon aria-hidden />
            </Button>
            <span
              className="text-muted-foreground w-10 text-center text-xs tabular-nums"
              aria-label="サムネイル拡大率"
            >
              {percent}%
            </span>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-7"
              aria-label="サムネイルを拡大"
              disabled={thumbnailWidth >= THUMBNAIL_WIDTH_MAX}
              onClick={thumbnailZoomIn}
            >
              <ZoomInIcon aria-hidden />
            </Button>
          </div>
        </div>
      </TooltipProvider>

      <div
        data-organize-scroll
        className="bg-muted/30 min-h-0 flex-1 overflow-auto p-4"
      >
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={pages.map((p) => p.id)}
            strategy={rectSortingStrategy}
          >
            <div
              className="grid justify-center gap-4"
              style={{
                gridTemplateColumns: `repeat(auto-fill, minmax(${thumbnailWidth + 24}px, 1fr))`,
              }}
            >
              {pages.map((page, index) => {
                const position = index + 1;
                return (
                  <SortableTile
                    key={page.id}
                    proxy={getProxy(page.sourceId)}
                    page={page}
                    position={position}
                    width={thumbnailWidth}
                    selected={selected.has(page.id)}
                    current={position === currentPage}
                    onSelect={(event) => handleSelect(event, page.id)}
                    onOpen={() => openInViewer(position)}
                    onContextMenu={() => ensureSelected(page.id)}
                    actions={actions}
                  />
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              選択した {selectedCount} ページを削除しますか？
            </AlertDialogTitle>
            <AlertDialogDescription>
              この操作は Undo（Ctrl+Z）で元に戻せます。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                actions.remove();
                setConfirmOpen(false);
              }}
            >
              削除する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ProgressOverlay />
    </div>
  );
}
