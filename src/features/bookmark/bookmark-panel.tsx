"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronRightIcon,
  IndentIncreaseIcon,
  IndentDecreaseIcon,
  MoreVerticalIcon,
  PlusIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  PencilIcon,
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
import { useEditorStore } from "@/store/editor-store";
import { useViewerStore } from "@/store/viewer-store";
import { docKeyFromSourceIds, useOutlineStore } from "@/store/outline-store";
import { usePdfSources } from "@/features/viewer/pdf-sources-context";
import { cn } from "@/lib/utils";

/** 子孫を含むノード数を数える（削除確認の文言用）。 */
function countDescendants(node: EditableOutlineNode): number {
  return node.children.reduce((n, c) => n + 1 + countDescendants(c), 0);
}

function TreeItem({
  node,
  level,
  editingId,
  onJump,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onAddSub,
  onMoveUp,
  onMoveDown,
  onIndent,
  onOutdent,
  onRequestDelete,
}: {
  node: EditableOutlineNode;
  level: number;
  editingId: string | null;
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
}) {
  const [open, setOpen] = useState(true);
  const hasChildren = node.children.length > 0;
  const editing = editingId === node.id;

  return (
    <li>
      <div
        className="group hover:bg-muted/60 flex items-center gap-0.5 rounded"
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

        {editing ? (
          <RenameInput
            initial={node.title}
            onCommit={(title) => onCommitRename(node.id, title)}
            onCancel={onCancelRename}
          />
        ) : (
          <>
            <button
              type="button"
              onClick={() => onJump(node)}
              onDoubleClick={() => onStartRename(node.id)}
              disabled={node.sourceIndex === null}
              title={
                node.sourceIndex === null
                  ? `${node.title}（宛先なし）`
                  : node.title
              }
              className="hover:text-foreground flex-1 truncate rounded px-1 py-0.5 text-left text-sm disabled:opacity-60"
            >
              {node.title}
              {node.sourceIndex === null && (
                <span className="text-muted-foreground ml-1 text-xs">—</span>
              )}
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
                <DropdownMenuItem onClick={() => onStartRename(node.id)}>
                  <PencilIcon aria-hidden />
                  名前を変更
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onAddSub(node.id)}>
                  <PlusIcon aria-hidden />
                  サブ項目を追加（現在のページ）
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onMoveUp(node.id)}>
                  <ChevronUpIcon aria-hidden />
                  上へ移動
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onMoveDown(node.id)}>
                  <ChevronDownIcon aria-hidden />
                  下へ移動
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onIndent(node.id)}>
                  <IndentIncreaseIcon aria-hidden />
                  階層を下げる
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onOutdent(node.id)}>
                  <IndentDecreaseIcon aria-hidden />
                  階層を上げる
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => onRequestDelete(node)}
                >
                  <Trash2Icon aria-hidden />
                  削除
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>

      {hasChildren && open && (
        <ul>
          {node.children.map((child) => (
            <TreeItem
              key={child.id}
              node={child}
              level={level + 1}
              editingId={editingId}
              onJump={onJump}
              onStartRename={onStartRename}
              onCommitRename={onCommitRename}
              onCancelRename={onCancelRename}
              onAddSub={onAddSub}
              onMoveUp={onMoveUp}
              onMoveDown={onMoveDown}
              onIndent={onIndent}
              onOutdent={onOutdent}
              onRequestDelete={onRequestDelete}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

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

/** 左ペイン「しおり」タブ。アウトラインの表示・ジャンプ・編集（追加/改名/移動/削除）。 */
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

  const addCurrent = () => {
    const id = addBookmark(null, currentTarget());
    setEditingId(id);
  };
  const addSub = (parentId: string) => {
    const id = addSubBookmark(parentId, currentTarget());
    setEditingId(id);
  };

  const commitRename = (id: string, title: string) => {
    rename(id, title);
    setEditingId(null);
  };

  const requestDelete = (node: EditableOutlineNode) => {
    if (node.children.length > 0) {
      setPendingDelete(node); // 子があるとき確認
    } else {
      remove(node.id);
    }
  };

  if (!ready) {
    return <p className="text-muted-foreground p-4 text-sm">読み込み中…</p>;
  }

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-center justify-between gap-1 border-b px-2 py-1.5">
        <span className="text-muted-foreground text-xs">
          しおり {nodes.length > 0 ? "" : "（なし）"}
        </span>
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
      </div>

      {nodes.length === 0 ? (
        <p className="text-muted-foreground p-4 text-sm">
          しおりがありません。「現在のページを追加」から作成できます。
        </p>
      ) : (
        <ul className="flex-1 overflow-auto p-2">
          {nodes.map((node) => (
            <TreeItem
              key={node.id}
              node={node}
              level={0}
              editingId={editingId}
              onJump={jump}
              onStartRename={setEditingId}
              onCommitRename={commitRename}
              onCancelRename={() => setEditingId(null)}
              onAddSub={addSub}
              onMoveUp={moveUp}
              onMoveDown={moveDown}
              onIndent={indent}
              onOutdent={outdent}
              onRequestDelete={requestDelete}
            />
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
