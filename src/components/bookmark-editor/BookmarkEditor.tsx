"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { BookmarkNode } from "@/types/pdf";
import {
  createBookmarkNode,
  addChild,
  removeNode,
  updateTitle,
  updatePageNumber,
  indentNode,
  outdentNode,
  countNodes,
} from "@/lib/utils/bookmark-tree";

interface BookmarkEditorProps {
  bookmarks: BookmarkNode[];
  onBookmarksChange: (bookmarks: BookmarkNode[]) => void;
  totalPages: number;
  /** しおりノードからページビュアーへナビゲート */
  onPageNavigate?: (pageNumber: number) => void;
}

export function BookmarkEditor({
  bookmarks,
  onBookmarksChange,
  totalPages,
  onPageNavigate,
}: BookmarkEditorProps) {
  const nodeCount = countNodes(bookmarks);

  const handleAddRoot = useCallback(() => {
    onBookmarksChange([...bookmarks, createBookmarkNode("新しいしおり", 1)]);
  }, [bookmarks, onBookmarksChange]);

  return (
    <div className="space-y-3">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
          しおり一覧（{nodeCount} 件）
        </h3>
        <button
          onClick={handleAddRoot}
          className="rounded bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-600 hover:bg-blue-100 dark:bg-blue-950/30 dark:text-blue-400 dark:hover:bg-blue-950/50"
        >
          + 親しおりを追加
        </button>
      </div>

      {/* ツリー表示 */}
      {bookmarks.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 p-6 text-center dark:border-zinc-600">
          <p className="text-xs text-zinc-400">
            しおりがありません。「+ 親しおりを追加」で作成してください。
          </p>
        </div>
      ) : (
        <div className="space-y-0.5">
          {bookmarks.map((node, index) => (
            <BookmarkTreeNode
              key={node.id}
              node={node}
              depth={0}
              bookmarks={bookmarks}
              onBookmarksChange={onBookmarksChange}
              totalPages={totalPages}
              onPageNavigate={onPageNavigate}
              isFirstSibling={index === 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface BookmarkTreeNodeProps {
  node: BookmarkNode;
  depth: number;
  bookmarks: BookmarkNode[];
  onBookmarksChange: (bookmarks: BookmarkNode[]) => void;
  totalPages: number;
  onPageNavigate?: (pageNumber: number) => void;
  isFirstSibling: boolean;
}

function BookmarkTreeNode({
  node,
  depth,
  bookmarks,
  onBookmarksChange,
  totalPages,
  onPageNavigate,
  isFirstSibling,
}: BookmarkTreeNodeProps) {
  const [expanded, setExpanded] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(node.title);
  const inputRef = useRef<HTMLInputElement>(null);
  // Focus input when entering edit mode
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  // Sync editValue when title changes externally
  useEffect(() => {
    if (!editing) {
      setEditValue(node.title);
    }
  }, [node.title, editing]);

  const commitEdit = useCallback(() => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== node.title) {
      onBookmarksChange(updateTitle(bookmarks, node.id, trimmed));
    } else {
      setEditValue(node.title);
    }
    setEditing(false);
  }, [editValue, node.title, node.id, bookmarks, onBookmarksChange]);

  const handleClick = useCallback(() => {
    if (editing) return;
    onPageNavigate?.(node.pageNumber);
  }, [editing, node.pageNumber, onPageNavigate]);

  const handleDoubleClick = useCallback(() => {
    setEditValue(node.title);
    setEditing(true);
  }, [node.title]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        commitEdit();
      } else if (e.key === "Escape") {
        setEditValue(node.title);
        setEditing(false);
      }
    },
    [commitEdit, node.title]
  );

  return (
    <div>
      <div
        className="group flex items-center gap-1.5 rounded px-2 py-1.5 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-700/50"
      >
        {/* 展開/折りたたみ */}
        {node.children.length > 0 ? (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
          >
            <svg
              className={`h-2.5 w-2.5 transition-transform ${expanded ? "rotate-90" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        ) : (
          <div className="h-4 w-4 flex-shrink-0" />
        )}

        {/* タイトル（クリックでページジャンプ / ダブルクリックで編集） */}
        {editing ? (
          <input
            ref={inputRef}
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={handleKeyDown}
            className="min-w-0 flex-1 rounded border border-blue-400 bg-white px-1.5 py-0.5 text-xs text-zinc-800 outline-none dark:bg-zinc-700 dark:text-zinc-200"
          />
        ) : (
          <span
            onClick={handleClick}
            onDoubleClick={handleDoubleClick}
            className="min-w-0 flex-1 cursor-pointer truncate text-xs text-zinc-700 hover:text-blue-600 dark:text-zinc-300 dark:hover:text-blue-400"
            title={`${node.title}（ダブルクリックで名称変更）`}
          >
            {node.title}
          </span>
        )}

        {/* ページ番号 */}
        <div className="flex items-center gap-0.5">
          <span className="text-[10px] text-zinc-400">p.</span>
          <input
            type="number"
            min={1}
            max={totalPages}
            value={node.pageNumber}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              if (!isNaN(val) && val >= 1 && val <= totalPages) {
                onBookmarksChange(
                  updatePageNumber(bookmarks, node.id, val)
                );
              }
            }}
            className="w-10 rounded border border-zinc-200 bg-transparent px-1 py-0.5 text-center text-[11px] text-zinc-600 focus:border-blue-400 focus:outline-none dark:border-zinc-600 dark:text-zinc-400"
          />
        </div>

        {/* 操作ボタン */}
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          {/* アウトデント（←） */}
          <button
            onClick={() => onBookmarksChange(outdentNode(bookmarks, node.id))}
            disabled={depth === 0}
            className="rounded p-1 text-zinc-400 hover:bg-blue-50 hover:text-blue-500 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-zinc-400 dark:hover:bg-blue-950/30"
            title="アウトデント"
          >
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          {/* インデント（→） */}
          <button
            onClick={() => onBookmarksChange(indentNode(bookmarks, node.id))}
            disabled={isFirstSibling}
            className="rounded p-1 text-zinc-400 hover:bg-blue-50 hover:text-blue-500 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-zinc-400 dark:hover:bg-blue-950/30"
            title="インデント"
          >
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          {/* 子しおりを追加 */}
          <button
            onClick={() => {
              onBookmarksChange(addChild(bookmarks, node.id));
              setExpanded(true);
            }}
            className="rounded p-1 text-zinc-400 hover:bg-blue-50 hover:text-blue-500 dark:hover:bg-blue-950/30"
            title="子しおりを追加"
          >
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
          {/* 削除 */}
          <button
            onClick={() =>
              onBookmarksChange(removeNode(bookmarks, node.id))
            }
            className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
            title="削除"
          >
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* 子ノード — ツリーコネクタ線付き */}
      {expanded && node.children.length > 0 && (
        <div className="ml-[15px]">
          {node.children.map((child, index) => {
            const isLast = index === node.children.length - 1;
            return (
              <div key={child.id} className="relative pl-3">
                {/* 縦線: 最後の子は行中央まで、それ以外は全高 */}
                <div
                  className={`absolute left-0 w-px bg-zinc-300 dark:bg-zinc-600 ${
                    isLast ? "top-0 h-[15px]" : "inset-y-0"
                  }`}
                />
                {/* 横線: 縦線からノードへの接続 */}
                <div className="absolute left-0 top-[15px] h-px w-3 bg-zinc-300 dark:bg-zinc-600" />
                <BookmarkTreeNode
                  node={child}
                  depth={depth + 1}
                  bookmarks={bookmarks}
                  onBookmarksChange={onBookmarksChange}
                  totalPages={totalPages}
                  onPageNavigate={onPageNavigate}
                  isFirstSibling={index === 0}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
