"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDownIcon, ChevronUpIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { findMatches, getPageText } from "@/lib/search/search";
import { useEditorStore } from "@/store/editor-store";
import { useViewerStore } from "@/store/viewer-store";
import { useSearchStore } from "@/store/search-store";
import { usePdfSources } from "@/features/viewer/pdf-sources-context";

/** 検索バー（Ctrl+F）。常時マウントし、open のときだけパネルを表示する。 */
export function SearchBar() {
  const { getProxy } = usePdfSources();
  const pages = useEditorStore((s) => s.pages);
  const requestPage = useViewerStore((s) => s.requestPage);
  const open = useSearchStore((s) => s.open);
  const query = useSearchStore((s) => s.query);
  const matches = useSearchStore((s) => s.matches);
  const activeIndex = useSearchStore((s) => s.activeIndex);
  const setOpen = useSearchStore((s) => s.setOpen);
  const setQuery = useSearchStore((s) => s.setQuery);
  const setResults = useSearchStore((s) => s.setResults);
  const next = useSearchStore((s) => s.next);
  const prev = useSearchStore((s) => s.prev);

  const inputRef = useRef<HTMLInputElement>(null);
  const [pageTexts, setPageTexts] = useState<string[] | null>(null);
  const sig = pages.map((p) => `${p.id}:${p.sourceIndex}`).join("|");

  // Ctrl/Cmd+F でオープン
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setOpen(true);
      } else if (event.key === "Escape" && useSearchStore.getState().open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setOpen]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // オープン中・ページ構成が変わったらテキストを抽出
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const texts: string[] = [];
      for (const page of pages) {
        const proxy = getProxy(page.sourceId);
        if (!proxy) {
          texts.push("");
          continue;
        }
        texts.push(
          await getPageText(await proxy.getPage(page.sourceIndex + 1)),
        );
      }
      if (!cancelled) setPageTexts(texts);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, sig, getProxy, pages]);

  // クエリ・抽出結果からヒットを再計算
  useEffect(() => {
    if (!open || pageTexts === null) return;
    setResults(findMatches(pageTexts, query));
  }, [open, pageTexts, query, setResults]);

  // 現在ヒットのページへ移動
  useEffect(() => {
    if (activeIndex < 0) return;
    const match = matches[activeIndex];
    if (match) requestPage(match.page);
  }, [activeIndex, matches, requestPage]);

  if (!open) return null;

  const count =
    matches.length > 0
      ? `${activeIndex + 1} / ${matches.length}`
      : query.trim()
        ? "0 件"
        : "";

  return (
    <div className="bg-background absolute top-3 right-6 z-20 flex items-center gap-1 rounded-md border p-1.5 shadow-md">
      <Input
        ref={inputRef}
        aria-label="検索語"
        placeholder="検索…"
        className="h-8 w-48"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (e.shiftKey) prev();
            else next();
          }
        }}
      />
      <span className="text-muted-foreground w-16 text-center text-xs tabular-nums">
        {count}
      </span>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        aria-label="前のヒット"
        disabled={matches.length === 0}
        onClick={prev}
      >
        <ChevronUpIcon aria-hidden />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        aria-label="次のヒット"
        disabled={matches.length === 0}
        onClick={next}
      >
        <ChevronDownIcon aria-hidden />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        aria-label="検索を閉じる"
        onClick={() => setOpen(false)}
      >
        <XIcon aria-hidden />
      </Button>
    </div>
  );
}
