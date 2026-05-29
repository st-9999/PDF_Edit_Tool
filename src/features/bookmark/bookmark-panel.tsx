"use client";

import { useEffect, useState } from "react";
import { ChevronRightIcon } from "lucide-react";
import { buildOutline, type OutlineNode } from "@/lib/pdf/outline";
import { useEditorStore } from "@/store/editor-store";
import { useViewerStore } from "@/store/viewer-store";
import { usePdfSources } from "@/features/viewer/pdf-sources-context";
import { cn } from "@/lib/utils";

function TreeItem({
  node,
  level,
  onJump,
}: {
  node: OutlineNode;
  level: number;
  onJump: (node: OutlineNode) => void;
}) {
  const [open, setOpen] = useState(level < 1);
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
        </button>
      </div>
      {hasChildren && open && (
        <ul>
          {node.children.map((child) => (
            <TreeItem
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

/** 左ペイン「しおり」タブ。元ソースのアウトラインをツリー表示してジャンプする。 */
export function BookmarkPanel() {
  const sourceId = useEditorStore((s) => s.sourceId);
  const pages = useEditorStore((s) => s.pages);
  const requestPage = useViewerStore((s) => s.requestPage);
  const { getProxy } = usePdfSources();
  const [nodes, setNodes] = useState<OutlineNode[] | null>(null);

  useEffect(() => {
    const proxy = sourceId ? getProxy(sourceId) : undefined;
    if (!proxy) return;
    let cancelled = false;
    buildOutline(proxy)
      .then((tree) => {
        if (!cancelled) setNodes(tree);
      })
      .catch(() => {
        if (!cancelled) setNodes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [sourceId, getProxy]);

  const jump = (node: OutlineNode) => {
    if (node.sourceIndex === null) return;
    const position =
      pages.findIndex(
        (p) => p.sourceId === sourceId && p.sourceIndex === node.sourceIndex,
      ) + 1;
    if (position > 0) requestPage(position);
  };

  if (nodes === null) {
    return <p className="text-muted-foreground p-4 text-sm">読み込み中…</p>;
  }

  if (nodes.length === 0) {
    return (
      <p className="text-muted-foreground p-4 text-sm">
        この PDF にはしおり（アウトライン）がありません。
      </p>
    );
  }

  return (
    <ul className="p-2">
      {nodes.map((node) => (
        <TreeItem key={node.id} node={node} level={0} onJump={jump} />
      ))}
    </ul>
  );
}
