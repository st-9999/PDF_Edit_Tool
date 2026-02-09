"use client";

import { useState, useCallback } from "react";
import type { BookmarkNode } from "@/types/pdf";
import {
  createBookmarkNode,
  addSibling,
  addChild,
  removeNode,
  updateTitle,
  updatePageNumber,
  moveNode,
  countNodes,
} from "@/lib/utils/bookmark-tree";

interface BookmarkEditorProps {
  bookmarks: BookmarkNode[];
  onBookmarksChange: (bookmarks: BookmarkNode[]) => void;
  totalPages: number;
  /** ページサムネイルクリックでページ番号を設定するためのアクティブノードID */
  activeNodeId: string | null;
  onActiveNodeChange: (nodeId: string | null) => void;
  /** しおりノードからページビュアーへナビゲート */
  onPageNavigate?: (pageNumber: number) => void;
}

export function BookmarkEditor({
  bookmarks,
  onBookmarksChange,
  totalPages,
  activeNodeId,
  onActiveNodeChange,
  onPageNavigate,
}: BookmarkEditorProps) {
  const nodeCount = countNodes(bookmarks);

  const handleAddRoot = useCallback(() => {
    onBookmarksChange([...bookmarks, createBookmarkNode("新しいしおり", 1)]);
  }, [bookmarks, onBookmarksChange]);

  return (
    <div className="space-y-4">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          しおり一覧（{nodeCount} 件）
        </h3>
        <button
          onClick={handleAddRoot}
          className="rounded bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-100 dark:bg-blue-950/30 dark:text-blue-400 dark:hover:bg-blue-950/50"
        >
          + ルートしおりを追加
        </button>
      </div>

      {activeNodeId && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          右側のサムネイルをクリックするとページ番号が設定されます
        </p>
      )}

      {/* ツリー表示 */}
      {bookmarks.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-600">
          <p className="text-sm text-zinc-400">
            しおりがありません。「ルートしおりを追加」で作成してください。
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {bookmarks.map((node, index) => (
            <BookmarkTreeNode
              key={node.id}
              node={node}
              depth={0}
              index={index}
              siblingCount={bookmarks.length}
              bookmarks={bookmarks}
              onBookmarksChange={onBookmarksChange}
              totalPages={totalPages}
              activeNodeId={activeNodeId}
              onActiveNodeChange={onActiveNodeChange}
              onPageNavigate={onPageNavigate}
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
  index: number;
  siblingCount: number;
  bookmarks: BookmarkNode[];
  onBookmarksChange: (bookmarks: BookmarkNode[]) => void;
  totalPages: number;
  activeNodeId: string | null;
  onActiveNodeChange: (nodeId: string | null) => void;
  onPageNavigate?: (pageNumber: number) => void;
}

function BookmarkTreeNode({
  node,
  depth,
  index,
  siblingCount,
  bookmarks,
  onBookmarksChange,
  totalPages,
  activeNodeId,
  onActiveNodeChange,
  onPageNavigate,
}: BookmarkTreeNodeProps) {
  const [expanded, setExpanded] = useState(true);
  const isActive = activeNodeId === node.id;

  return (
    <div style={{ marginLeft: depth * 20 }}>
      <div
        className={`
          flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors
          ${isActive
            ? "border-amber-400 bg-amber-50 dark:border-amber-600 dark:bg-amber-950/30"
            : "border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800"}
        `}
      >
        {/* 展開/折りたたみ */}
        {node.children.length > 0 ? (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700"
          >
            <svg
              className={`h-3 w-3 transition-transform ${expanded ? "rotate-90" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>
        ) : (
          <div className="h-5 w-5 flex-shrink-0" />
        )}

        {/* タイトル入力 */}
        <input
          type="text"
          value={node.title}
          onChange={(e) =>
            onBookmarksChange(updateTitle(bookmarks, node.id, e.target.value))
          }
          className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm text-zinc-800 focus:border-blue-400 focus:outline-none dark:text-zinc-200"
          placeholder="しおりのタイトル"
        />

        {/* ページ番号 */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-zinc-400">p.</span>
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
            className="w-12 rounded border border-zinc-200 bg-transparent px-1 py-0.5 text-center text-xs text-zinc-700 focus:border-blue-400 focus:outline-none dark:border-zinc-600 dark:text-zinc-300"
          />
          <button
            onClick={() =>
              onActiveNodeChange(isActive ? null : node.id)
            }
            className={`rounded p-1 text-xs transition-colors ${
              isActive
                ? "bg-amber-200 text-amber-700 dark:bg-amber-800 dark:text-amber-200"
                : "text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700"
            }`}
            title="サムネイルからページを選択"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
            </svg>
          </button>
          {onPageNavigate && (
            <button
              onClick={() => onPageNavigate(node.pageNumber)}
              className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-blue-500 dark:hover:bg-zinc-700"
              title="このページを表示"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            </button>
          )}
        </div>

        {/* 操作ボタン群 */}
        <div className="flex items-center gap-0.5">
          {/* 上移動 */}
          <button
            onClick={() =>
              onBookmarksChange(moveNode(bookmarks, node.id, "up"))
            }
            disabled={index === 0}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 disabled:opacity-30 dark:hover:bg-zinc-700"
            title="上に移動"
          >
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          </button>
          {/* 下移動 */}
          <button
            onClick={() =>
              onBookmarksChange(moveNode(bookmarks, node.id, "down"))
            }
            disabled={index === siblingCount - 1}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 disabled:opacity-30 dark:hover:bg-zinc-700"
            title="下に移動"
          >
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {/* 子を追加 */}
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
          {/* 兄弟を追加 */}
          <button
            onClick={() =>
              onBookmarksChange(addSibling(bookmarks, node.id))
            }
            className="rounded p-1 text-zinc-400 hover:bg-green-50 hover:text-green-500 dark:hover:bg-green-950/30"
            title="兄弟しおりを追加"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14v6m-3-3h6M6 10h2a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v2a2 2 0 002 2z" />
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

      {/* 子ノード */}
      {expanded &&
        node.children.map((child, childIndex) => (
          <BookmarkTreeNode
            key={child.id}
            node={child}
            depth={depth + 1}
            index={childIndex}
            siblingCount={node.children.length}
            bookmarks={bookmarks}
            onBookmarksChange={onBookmarksChange}
            totalPages={totalPages}
            activeNodeId={activeNodeId}
            onActiveNodeChange={onActiveNodeChange}
            onPageNavigate={onPageNavigate}
          />
        ))}
    </div>
  );
}
