"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDownIcon, ChevronUpIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toggle } from "@/components/ui/toggle";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { buildMatcher, findMatches, getPageText } from "@/lib/search/search";
import { useEditorStore } from "@/store/editor-store";
import { useViewerStore } from "@/store/viewer-store";
import { useSearchStore } from "@/store/search-store";
import { usePdfSources } from "@/features/viewer/pdf-sources-context";
import { cn } from "@/lib/utils";

/** 検索バー（Ctrl+F）。常時マウントし、open のときだけパネルを表示する。 */
export function SearchBar() {
  const { getProxy } = usePdfSources();
  const pages = useEditorStore((s) => s.pages);
  const requestPage = useViewerStore((s) => s.requestPage);
  const open = useSearchStore((s) => s.open);
  const query = useSearchStore((s) => s.query);
  const regex = useSearchStore((s) => s.regex);
  const caseSensitive = useSearchStore((s) => s.caseSensitive);
  const matches = useSearchStore((s) => s.matches);
  const activeIndex = useSearchStore((s) => s.activeIndex);
  const setOpen = useSearchStore((s) => s.setOpen);
  const setQuery = useSearchStore((s) => s.setQuery);
  const setRegex = useSearchStore((s) => s.setRegex);
  const setCaseSensitive = useSearchStore((s) => s.setCaseSensitive);
  const setResults = useSearchStore((s) => s.setResults);
  const next = useSearchStore((s) => s.next);
  const prev = useSearchStore((s) => s.prev);

  const inputRef = useRef<HTMLInputElement>(null);
  const [pageTexts, setPageTexts] = useState<string[] | null>(null);
  const sig = pages.map((p) => `${p.id}:${p.sourceIndex}`).join("|");

  // 正規表現モードで式が不正なら警告（プレーン検索では常に有効）
  const invalidRegex =
    regex && query.trim().length > 0 && buildMatcher(query, { regex }) === null;

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

  // クエリ・抽出結果・オプションからヒットを再計算
  useEffect(() => {
    if (!open || pageTexts === null) return;
    setResults(findMatches(pageTexts, query, { regex, caseSensitive }));
  }, [open, pageTexts, query, regex, caseSensitive, setResults]);

  // 現在ヒットのページへ移動
  useEffect(() => {
    if (activeIndex < 0) return;
    const match = matches[activeIndex];
    if (match) requestPage(match.page);
  }, [activeIndex, matches, requestPage]);

  if (!open) return null;

  const count = invalidRegex
    ? "無効な式"
    : matches.length > 0
      ? `${activeIndex + 1} / ${matches.length}`
      : query.trim()
        ? "0 件"
        : "";

  return (
    <TooltipProvider delay={300}>
      <div className="bg-background absolute top-3 right-6 z-20 flex items-center gap-1 rounded-md border p-1.5 shadow-md">
        <Input
          ref={inputRef}
          aria-label="検索語"
          placeholder={regex ? "正規表現…" : "検索…"}
          className={cn("h-8 w-48", invalidRegex && "border-destructive")}
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
        <Tooltip>
          <TooltipTrigger
            render={
              <Toggle
                size="sm"
                aria-label="大文字小文字を区別"
                pressed={caseSensitive}
                onPressedChange={setCaseSensitive}
                className="h-8 px-2 font-mono text-xs"
              >
                Aa
              </Toggle>
            }
          />
          <TooltipContent>大文字小文字を区別</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Toggle
                size="sm"
                aria-label="正規表現"
                pressed={regex}
                onPressedChange={setRegex}
                className="h-8 px-2 font-mono text-xs"
              >
                .*
              </Toggle>
            }
          />
          <TooltipContent>正規表現として検索</TooltipContent>
        </Tooltip>
        <span
          className={cn(
            "w-16 text-center text-xs tabular-nums",
            invalidRegex ? "text-destructive" : "text-muted-foreground",
          )}
        >
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
    </TooltipProvider>
  );
}
