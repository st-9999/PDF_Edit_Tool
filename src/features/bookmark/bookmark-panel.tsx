"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  CheckIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  GripVerticalIcon,
  IndentIncreaseIcon,
  IndentDecreaseIcon,
  MoreVerticalIcon,
  PencilIcon,
  PencilLineIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import type { EditableOutlineNode } from "@/lib/outline/edit";
import { collectEditableOutline } from "@/lib/outline/collect";
import {
  buildTree,
  flattenTree,
  getProjection,
  removeChildrenOf,
} from "@/lib/outline/tree-dnd";
import { useEditorStore } from "@/store/editor-store";
import { useViewerStore } from "@/store/viewer-store";
import { docKeyFromSourceIds, useOutlineStore } from "@/store/outline-store";
import { usePdfSources } from "@/features/viewer/pdf-sources-context";
import { cn } from "@/lib/utils";

/** ドラッグ 1 段あたりのインデント幅(px)。横移動量を深さ変化へ換算する基準。 */
const INDENT_WIDTH = 16;

/** 子孫を含むノード数を数える（削除確認の文言用）。 */
function countDescendants(node: EditableOutlineNode): number {
  return node.children.reduce((n, c) => n + 1 + countDescendants(c), 0);
}

/** 宛先なし見出しのサフィックス表示。 */
function NoDestTag({ show }: { show: boolean }) {
  return show ? (
    <span className="text-muted-foreground ml-1 text-xs">—</span>
  ) : null;
}

/* ------------------------------- 閲覧モード ------------------------------- */

function ReadonlyItem({
  node,
  level,
  onJump,
}: {
  node: EditableOutlineNode;
  level: number;
  onJump: (node: EditableOutlineNode) => void;
}) {
  const [open, setOpen] = useState(true);
  const hasChildren = node.children.length > 0;

  return (
    <li>
      <div
        className="flex items-center gap-0.5"
        style={{ paddingLeft: level * 12 }}
      >
        {hasChildren ? (
          <button
            type="button"
            aria-label={open ? "折りたたむ" : "展開"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="text-muted-foreground hover:text-foreground flex size-4 shrink-0 items-center justify-center"
          >
            <ChevronRightIcon
              className={cn("size-3 transition-transform", open && "rotate-90")}
              aria-hidden
            />
          </button>
        ) : (
          <span className="size-4 shrink-0" aria-hidden />
        )}
        <button
          type="button"
          onClick={() => onJump(node)}
          disabled={node.sourceIndex === null}
          title={node.title}
          className="hover:bg-muted truncate rounded px-1 py-0.5 text-left text-sm disabled:opacity-50"
        >
          {node.title}
          <NoDestTag show={node.sourceIndex === null} />
        </button>
      </div>
      {hasChildren && open && (
        <ul>
          {node.children.map((child) => (
            <ReadonlyItem
              key={child.id}
              node={child}
              level={level + 1}
              onJump={onJump}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/* ------------------------------- 編集モード ------------------------------- */

/** インライン名称変更入力。Enter/blur で確定、Escape で取消。 */
function RenameInput({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (title: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  return (
    <Input
      autoFocus
      aria-label="しおり名"
      className="h-7 flex-1 text-sm"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onCommit(draft.trim() || initial);
        } else if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
      onBlur={() => onCommit(draft.trim() || initial)}
    />
  );
}

interface RowActions {
  onJump: (node: EditableOutlineNode) => void;
  onStartRename: (id: string) => void;
  onCommitRename: (id: string, title: string) => void;
  onCancelRename: () => void;
  onAddSub: (parentId: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  onIndent: (id: string) => void;
  onOutdent: (id: string) => void;
  onRequestDelete: (node: EditableOutlineNode) => void;
}

/** 編集モードの 1 行（ドラッグ並べ替え＋横ドラッグで階層変更＋⋮メニュー）。 */
function SortableRow({
  node,
  depth,
  editing,
  actions,
}: {
  node: EditableOutlineNode;
  /** 表示インデント深さ（ドラッグ中はプロジェクション深さ）。 */
  depth: number;
  editing: boolean;
  actions: RowActions;
}) {
  const {
    setNodeRef,
    setActivatorNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: node.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  };

  return (
    <li ref={setNodeRef} style={style}>
      <div
        className="group hover:bg-muted/60 flex items-center gap-0.5 rounded"
        style={{ paddingLeft: depth * INDENT_WIDTH }}
      >
        <button
          ref={setActivatorNodeRef}
          type="button"
          aria-label={`「${node.title}」をドラッグで移動`}
          className="text-muted-foreground hover:text-foreground flex size-5 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVerticalIcon className="size-4" aria-hidden />
        </button>

        {editing ? (
          <RenameInput
            initial={node.title}
            onCommit={(title) => actions.onCommitRename(node.id, title)}
            onCancel={actions.onCancelRename}
          />
        ) : (
          <>
            <button
              type="button"
              onClick={() => actions.onJump(node)}
              onDoubleClick={() => actions.onStartRename(node.id)}
              disabled={node.sourceIndex === null}
              title={
                node.sourceIndex === null
                  ? `${node.title}（宛先なし）`
                  : node.title
              }
              className="hover:text-foreground flex-1 truncate rounded px-1 py-0.5 text-left text-sm disabled:opacity-60"
            >
              {node.title}
              <NoDestTag show={node.sourceIndex === null} />
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={`「${node.title}」の操作`}
                    className="size-6 shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[popup-open]:opacity-100"
                  />
                }
              >
                <MoreVerticalIcon className="size-4" aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem
                  onClick={() => actions.onStartRename(node.id)}
                >
                  <PencilIcon aria-hidden />
                  名前を変更
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => actions.onAddSub(node.id)}>
                  <PlusIcon aria-hidden />
                  サブ項目を追加（現在のページ）
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => actions.onMoveUp(node.id)}>
                  <ChevronUpIcon aria-hidden />
                  上へ移動
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => actions.onMoveDown(node.id)}>
                  <ChevronDownIcon aria-hidden />
                  下へ移動
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => actions.onIndent(node.id)}>
                  <IndentIncreaseIcon aria-hidden />
                  階層を下げる
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => actions.onOutdent(node.id)}>
                  <IndentDecreaseIcon aria-hidden />
                  階層を上げる
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => actions.onRequestDelete(node)}
                >
                  <Trash2Icon aria-hidden />
                  削除
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>
    </li>
  );
}

function EditTree({
  nodes,
  editingId,
  actions,
}: {
  nodes: EditableOutlineNode[];
  editingId: string | null;
  actions: RowActions;
}) {
  const replaceTree = useOutlineStore((s) => s.replaceTree);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [offsetLeft, setOffsetLeft] = useState(0);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  // ドラッグ中はつかんだ枝の子孫を一覧から除外（自身の中へは落とせない）
  const flattened = useMemo(() => {
    const all = flattenTree(nodes);
    return activeId ? removeChildrenOf(all, [activeId]) : all;
  }, [nodes, activeId]);

  const projected =
    activeId && overId
      ? getProjection(flattened, activeId, overId, offsetLeft, INDENT_WIDTH)
      : null;

  const resetDrag = () => {
    setActiveId(null);
    setOverId(null);
    setOffsetLeft(0);
  };

  const handleDragStart = ({ active }: DragStartEvent) => {
    setActiveId(String(active.id));
    setOverId(String(active.id));
  };
  const handleDragMove = ({ delta }: DragMoveEvent) => setOffsetLeft(delta.x);
  const handleDragOver = ({ over }: DragOverEvent) =>
    setOverId(over ? String(over.id) : null);

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    resetDrag();
    if (!projected || !over) return;
    const { depth, parentId } = projected;
    const clone = flattenTree(nodes);
    const activeIndex = clone.findIndex((i) => i.id === active.id);
    const overIndex = clone.findIndex((i) => i.id === over.id);
    if (activeIndex < 0 || overIndex < 0) return;
    clone[activeIndex] = { ...clone[activeIndex]!, depth, parentId };
    replaceTree(buildTree(arrayMove(clone, activeIndex, overIndex)));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={resetDrag}
    >
      <SortableContext
        items={flattened.map((f) => f.id)}
        strategy={verticalListSortingStrategy}
      >
        <ul className="flex-1 overflow-auto p-2">
          {flattened.map((f) => (
            <SortableRow
              key={f.id}
              node={f.node}
              depth={activeId === f.id && projected ? projected.depth : f.depth}
              editing={editingId === f.id}
              actions={actions}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

/* --------------------------------- パネル --------------------------------- */

/** 左ペイン「しおり」タブ。既定は閲覧（ジャンプのみ）、「しおり編集」で編集モード。 */
export function BookmarkPanel() {
  const pages = useEditorStore((s) => s.pages);
  const currentPage = useViewerStore((s) => s.currentPage);
  const requestPage = useViewerStore((s) => s.requestPage);
  const { getProxy } = usePdfSources();

  const nodes = useOutlineStore((s) => s.nodes);
  const loaded = useOutlineStore((s) => s.loaded);
  const storeDocKey = useOutlineStore((s) => s.docKey);
  const load = useOutlineStore((s) => s.load);
  const rename = useOutlineStore((s) => s.rename);
  const remove = useOutlineStore((s) => s.remove);
  const addBookmark = useOutlineStore((s) => s.addBookmark);
  const addSubBookmark = useOutlineStore((s) => s.addSubBookmark);
  const moveUp = useOutlineStore((s) => s.moveUp);
  const moveDown = useOutlineStore((s) => s.moveDown);
  const indent = useOutlineStore((s) => s.indent);
  const outdent = useOutlineStore((s) => s.outdent);

  const [editMode, setEditMode] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] =
    useState<EditableOutlineNode | null>(null);

  const sourceIds = useMemo(
    () => [...new Set(pages.map((p) => p.sourceId))],
    [pages],
  );
  const docKey = docKeyFromSourceIds(sourceIds);
  const ready = loaded && storeDocKey === docKey;

  // 現在ドキュメント向けの baseline を未読込なら収集して読み込む
  useEffect(() => {
    if (sourceIds.length === 0 || ready) return;
    let cancelled = false;
    collectEditableOutline(sourceIds, getProxy)
      .then((tree) => {
        if (!cancelled) load(tree, docKey);
      })
      .catch(() => {
        if (!cancelled) load([], docKey);
      });
    return () => {
      cancelled = true;
    };
  }, [sourceIds, docKey, ready, load, getProxy]);

  // ドキュメントが変わったら編集モード・編集中状態を解除する（描画時リセット）
  const [shownDocKey, setShownDocKey] = useState(docKey);
  if (shownDocKey !== docKey) {
    setShownDocKey(docKey);
    setEditMode(false);
    setEditingId(null);
    setPendingDelete(null);
  }

  /** 現在の表示ページの宛先（sourceId/sourceIndex）。 */
  const currentTarget = () => {
    const ref = pages[currentPage - 1];
    return {
      title: `ページ ${currentPage}`,
      sourceId: ref?.sourceId ?? sourceIds[0] ?? "",
      sourceIndex: ref?.sourceIndex ?? null,
    };
  };

  const jump = (node: EditableOutlineNode) => {
    if (node.sourceIndex === null) return;
    const position =
      pages.findIndex(
        (p) =>
          p.sourceId === node.sourceId && p.sourceIndex === node.sourceIndex,
      ) + 1;
    if (position > 0) requestPage(position);
  };

  const addCurrent = () => setEditingId(addBookmark(null, currentTarget()));
  const addSub = (parentId: string) =>
    setEditingId(addSubBookmark(parentId, currentTarget()));

  const commitRename = (id: string, title: string) => {
    rename(id, title);
    setEditingId(null);
  };

  const requestDelete = (node: EditableOutlineNode) => {
    if (node.children.length > 0) setPendingDelete(node);
    else remove(node.id);
  };

  const actions: RowActions = {
    onJump: jump,
    onStartRename: setEditingId,
    onCommitRename: commitRename,
    onCancelRename: () => setEditingId(null),
    onAddSub: addSub,
    onMoveUp: moveUp,
    onMoveDown: moveDown,
    onIndent: indent,
    onOutdent: outdent,
    onRequestDelete: requestDelete,
  };

  if (!ready) {
    return <p className="text-muted-foreground p-4 text-sm">読み込み中…</p>;
  }

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-center justify-between gap-1 border-b px-2 py-1.5">
        <span className="text-muted-foreground text-xs">
          しおり{nodes.length === 0 ? "（なし）" : ` (${nodes.length})`}
        </span>
        {editMode ? (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7"
              onClick={addCurrent}
              disabled={pages.length === 0}
            >
              <PlusIcon aria-hidden />
              現在のページを追加
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-7"
              onClick={() => {
                setEditMode(false);
                setEditingId(null);
              }}
            >
              <CheckIcon aria-hidden />
              完了
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7"
            onClick={() => setEditMode(true)}
          >
            <PencilLineIcon aria-hidden />
            しおり編集
          </Button>
        )}
      </div>

      {nodes.length === 0 ? (
        <p className="text-muted-foreground p-4 text-sm">
          {editMode
            ? "しおりがありません。「現在のページを追加」から作成できます。"
            : "この PDF にはしおり（アウトライン）がありません。「しおり編集」から追加できます。"}
        </p>
      ) : editMode ? (
        <EditTree nodes={nodes} editingId={editingId} actions={actions} />
      ) : (
        <ul className="flex-1 overflow-auto p-2">
          {nodes.map((node) => (
            <ReadonlyItem key={node.id} node={node} level={0} onJump={jump} />
          ))}
        </ul>
      )}

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>しおりを削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              「{pendingDelete?.title}」とその下位
              {pendingDelete ? countDescendants(pendingDelete) : 0}
              件のしおりを削除します。この操作は保存するまで取り消せます。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete) remove(pendingDelete.id);
                setPendingDelete(null);
              }}
            >
              削除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
