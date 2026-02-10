"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { BookmarkNode } from "@/types/pdf";
import type { HeadingPattern, ExtractionProgress } from "@/types/heading-pattern";
import { Dialog } from "@/components/ui/Dialog";
import {
  DEFAULT_PATTERNS,
  autoGenerateBookmarks,
} from "@/lib/pdf/auto-bookmark";
import { nanoid } from "nanoid";

/* ------------------------------------------------------------------ */
/*  localStorage 永続化                                                */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = "pdf-edit:auto-bookmark-patterns";

interface StoredPatterns {
  customPatterns: HeadingPattern[];
  builtinOverrides: Record<string, boolean>;
}

function loadStoredPatterns(): StoredPatterns {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return { customPatterns: [], builtinOverrides: {} };
}

function saveStoredPatterns(stored: StoredPatterns) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    /* ignore */
  }
}

function buildPatterns(stored: StoredPatterns): HeadingPattern[] {
  const builtins = DEFAULT_PATTERNS.map((p) => ({
    ...p,
    enabled: stored.builtinOverrides[p.id] ?? p.enabled,
  }));
  return [...builtins, ...stored.customPatterns];
}

/* ------------------------------------------------------------------ */
/*  コンポーネント                                                     */
/* ------------------------------------------------------------------ */

type Step = "config" | "running" | "result";

interface AutoBookmarkDialogProps {
  open: boolean;
  onClose: () => void;
  pdfDoc: PDFDocumentProxy | null;
  existingCount: number;
  onGenerate: (bookmarks: BookmarkNode[], mode: "replace" | "append") => void;
}

export function AutoBookmarkDialog({
  open,
  onClose,
  pdfDoc,
  existingCount,
  onGenerate,
}: AutoBookmarkDialogProps) {
  const [step, setStep] = useState<Step>("config");
  const [stored, setStored] = useState<StoredPatterns>(loadStoredPatterns);
  const [patterns, setPatterns] = useState<HeadingPattern[]>(() =>
    buildPatterns(loadStoredPatterns())
  );

  // カスタムパターン追加フォーム
  const [showAddForm, setShowAddForm] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newPattern, setNewPattern] = useState("");
  const [newLevel, setNewLevel] = useState<1 | 2 | 3>(1);
  const [patternError, setPatternError] = useState("");

  // 実行中
  const [progress, setProgress] = useState<ExtractionProgress>({
    currentPage: 0,
    totalPages: 0,
    foundCount: 0,
  });
  const abortRef = useRef<AbortController | null>(null);

  // 結果
  const [results, setResults] = useState<BookmarkNode[]>([]);
  const [mergeMode, setMergeMode] = useState<"replace" | "append">("replace");

  // ダイアログを開く度にリセット
  useEffect(() => {
    if (open) {
      setStep("config");
      const s = loadStoredPatterns();
      setStored(s);
      setPatterns(buildPatterns(s));
      setShowAddForm(false);
      setResults([]);
      setMergeMode("replace");
    }
  }, [open]);

  /* パターン有効/無効切り替え */
  const togglePattern = useCallback(
    (id: string) => {
      setPatterns((prev) =>
        prev.map((p) => (p.id === id ? { ...p, enabled: !p.enabled } : p))
      );
      setStored((prev) => {
        const next = { ...prev };
        const builtin = DEFAULT_PATTERNS.find((p) => p.id === id);
        if (builtin) {
          next.builtinOverrides = {
            ...prev.builtinOverrides,
            [id]: !(prev.builtinOverrides[id] ?? builtin.enabled),
          };
        } else {
          next.customPatterns = prev.customPatterns.map((p) =>
            p.id === id ? { ...p, enabled: !p.enabled } : p
          );
        }
        saveStoredPatterns(next);
        return next;
      });
    },
    []
  );

  /* カスタムパターン追加 */
  const handleAddCustom = useCallback(() => {
    if (!newLabel.trim() || !newPattern.trim()) return;
    try {
      new RegExp(newPattern);
    } catch {
      setPatternError("無効な正規表現です");
      return;
    }
    const p: HeadingPattern = {
      id: nanoid(),
      label: newLabel.trim(),
      pattern: newPattern.trim(),
      level: newLevel,
      enabled: true,
      builtin: false,
    };
    setPatterns((prev) => [...prev, p]);
    setStored((prev) => {
      const next = { ...prev, customPatterns: [...prev.customPatterns, p] };
      saveStoredPatterns(next);
      return next;
    });
    setShowAddForm(false);
    setNewLabel("");
    setNewPattern("");
    setNewLevel(1);
    setPatternError("");
  }, [newLabel, newPattern, newLevel]);

  /* カスタムパターン削除 */
  const handleDeleteCustom = useCallback((id: string) => {
    setPatterns((prev) => prev.filter((p) => p.id !== id));
    setStored((prev) => {
      const next = {
        ...prev,
        customPatterns: prev.customPatterns.filter((p) => p.id !== id),
      };
      saveStoredPatterns(next);
      return next;
    });
  }, []);

  /* 実行 */
  const handleRun = useCallback(async () => {
    if (!pdfDoc) return;
    setStep("running");
    setProgress({ currentPage: 0, totalPages: pdfDoc.numPages, foundCount: 0 });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const bookmarks = await autoGenerateBookmarks(
        pdfDoc,
        patterns,
        setProgress,
        controller.signal
      );
      if (!controller.signal.aborted) {
        setResults(bookmarks);
        setStep("result");
      }
    } catch {
      if (!controller.signal.aborted) {
        setResults([]);
        setStep("result");
      }
    }
  }, [pdfDoc, patterns]);

  /* 中止 */
  const handleAbort = useCallback(() => {
    abortRef.current?.abort();
    setStep("config");
  }, []);

  /* 適用 */
  const handleApply = useCallback(() => {
    onGenerate(results, mergeMode);
    onClose();
  }, [results, mergeMode, onGenerate, onClose]);

  const hasEnabled = patterns.some((p) => p.enabled);
  const progressPercent =
    progress.totalPages > 0
      ? Math.round((progress.currentPage / progress.totalPages) * 100)
      : 0;

  return (
    <Dialog
      open={open}
      onClose={step === "running" ? handleAbort : onClose}
      title="しおりを自動作成"
      footer={
        step === "config" ? (
          <>
            <button
              onClick={onClose}
              className="rounded px-3 py-1.5 text-xs text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-700"
            >
              キャンセル
            </button>
            <button
              onClick={handleRun}
              disabled={!pdfDoc || !hasEnabled}
              className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-40 dark:bg-emerald-700 dark:hover:bg-emerald-600"
            >
              実行
            </button>
          </>
        ) : step === "running" ? (
          <button
            onClick={handleAbort}
            className="rounded bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 dark:bg-red-950/30 dark:text-red-400 dark:hover:bg-red-950/50"
          >
            中止
          </button>
        ) : (
          <>
            <button
              onClick={() => setStep("config")}
              className="rounded px-3 py-1.5 text-xs text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-700"
            >
              戻る
            </button>
            <button
              onClick={handleApply}
              disabled={results.length === 0}
              className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-40 dark:bg-emerald-700 dark:hover:bg-emerald-600"
            >
              適用
            </button>
          </>
        )
      }
    >
      {/* Step 1: パターン設定 */}
      {step === "config" && (
        <div className="space-y-4">
          {/* ビルトインパターン */}
          <div>
            <h4 className="mb-2 text-xs font-medium text-zinc-600 dark:text-zinc-300">
              デフォルトパターン
            </h4>
            <div className="space-y-1.5">
              {patterns
                .filter((p) => p.builtin)
                .map((p) => (
                  <label
                    key={p.id}
                    className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-700/50"
                  >
                    <input
                      type="checkbox"
                      checked={p.enabled}
                      onChange={() => togglePattern(p.id)}
                      className="accent-emerald-600"
                    />
                    <span className="text-xs text-zinc-700 dark:text-zinc-300">
                      {p.label}
                    </span>
                    <code className="ml-auto max-w-[200px] truncate text-[10px] text-zinc-400">
                      {p.pattern}
                    </code>
                  </label>
                ))}
            </div>
          </div>

          {/* カスタムパターン */}
          <div>
            <h4 className="mb-2 text-xs font-medium text-zinc-600 dark:text-zinc-300">
              カスタムパターン
            </h4>
            {patterns.filter((p) => !p.builtin).length > 0 ? (
              <div className="space-y-1.5">
                {patterns
                  .filter((p) => !p.builtin)
                  .map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-700/50"
                    >
                      <input
                        type="checkbox"
                        checked={p.enabled}
                        onChange={() => togglePattern(p.id)}
                        className="accent-emerald-600"
                      />
                      <span className="text-xs text-zinc-700 dark:text-zinc-300">
                        {p.label}
                      </span>
                      <span className="ml-1 rounded bg-zinc-100 px-1 text-[10px] text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400">
                        Lv.{p.level}
                      </span>
                      <code className="ml-auto max-w-[150px] truncate text-[10px] text-zinc-400">
                        {p.pattern}
                      </code>
                      <button
                        onClick={() => handleDeleteCustom(p.id)}
                        className="rounded p-0.5 text-zinc-400 hover:text-red-500"
                        title="削除"
                      >
                        <svg
                          className="h-3 w-3"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </div>
                  ))}
              </div>
            ) : (
              !showAddForm && (
                <p className="px-2 text-[11px] text-zinc-400">
                  カスタムパターンはありません
                </p>
              )
            )}

            {/* 追加フォーム */}
            {showAddForm ? (
              <div className="mt-2 space-y-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-600">
                <div>
                  <label className="mb-1 block text-[11px] text-zinc-500">
                    パターン名
                  </label>
                  <input
                    type="text"
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    placeholder="例: 附則"
                    className="w-full rounded border border-zinc-200 bg-white px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-200"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-zinc-500">
                    正規表現
                  </label>
                  <input
                    type="text"
                    value={newPattern}
                    onChange={(e) => {
                      setNewPattern(e.target.value);
                      setPatternError("");
                    }}
                    placeholder={String.raw`例: ^\s*(?<title>附則\s*.+?)\s*$`}
                    className="w-full rounded border border-zinc-200 bg-white px-2 py-1 font-mono text-xs dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-200"
                  />
                  {patternError && (
                    <p className="mt-0.5 text-[11px] text-red-500">
                      {patternError}
                    </p>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-zinc-500">
                    見出しレベル
                  </label>
                  <select
                    value={newLevel}
                    onChange={(e) =>
                      setNewLevel(Number(e.target.value) as 1 | 2 | 3)
                    }
                    className="rounded border border-zinc-200 bg-white px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-200"
                  >
                    <option value={1}>レベル 1（章）</option>
                    <option value={2}>レベル 2（節）</option>
                    <option value={3}>レベル 3（項）</option>
                  </select>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => {
                      setShowAddForm(false);
                      setPatternError("");
                    }}
                    className="rounded px-2 py-1 text-[11px] text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                  >
                    キャンセル
                  </button>
                  <button
                    onClick={handleAddCustom}
                    disabled={!newLabel.trim() || !newPattern.trim()}
                    className="rounded bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
                  >
                    追加
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowAddForm(true)}
                className="mt-2 rounded px-2 py-1 text-[11px] text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
              >
                + カスタムパターンを追加
              </button>
            )}
          </div>
        </div>
      )}

      {/* Step 2: 実行中 */}
      {step === "running" && (
        <div className="space-y-4 py-4">
          <div className="text-center text-sm text-zinc-600 dark:text-zinc-300">
            ページ {progress.currentPage}/{progress.totalPages} を解析中...
            <br />
            <span className="text-xs text-zinc-400">
              {progress.foundCount} 件検出
            </span>
          </div>
          <div className="mx-auto w-full max-w-xs">
            <div className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Step 3: 結果確認 */}
      {step === "result" && (
        <div className="space-y-3">
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            {results.length > 0
              ? `${countBookmarks(results)} 件の見出しを検出しました`
              : "見出しが検出されませんでした。パターンを調整してください。"}
          </p>

          {results.length > 0 && (
            <>
              {/* プレビューリスト */}
              <div className="max-h-52 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-600">
                <ResultPreview bookmarks={results} />
              </div>

              {/* 既存しおりがある場合の選択 */}
              {existingCount > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] text-zinc-500">
                    既存のしおり（{existingCount} 件）の扱い:
                  </p>
                  <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                    <input
                      type="radio"
                      name="merge"
                      checked={mergeMode === "replace"}
                      onChange={() => setMergeMode("replace")}
                      className="accent-emerald-600"
                    />
                    上書き（既存を削除して置き換え）
                  </label>
                  <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                    <input
                      type="radio"
                      name="merge"
                      checked={mergeMode === "append"}
                      onChange={() => setMergeMode("append")}
                      className="accent-emerald-600"
                    />
                    末尾に追加（既存を残す）
                  </label>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  結果プレビュー                                                     */
/* ------------------------------------------------------------------ */

function ResultPreview({ bookmarks }: { bookmarks: BookmarkNode[] }) {
  return (
    <ul className="divide-y divide-zinc-100 dark:divide-zinc-700">
      {bookmarks.map((node) => (
        <ResultItem key={node.id} node={node} depth={0} />
      ))}
    </ul>
  );
}

function ResultItem({ node, depth }: { node: BookmarkNode; depth: number }) {
  return (
    <>
      <li
        className="flex items-center gap-2 px-3 py-1.5"
        style={{ paddingLeft: `${12 + depth * 16}px` }}
      >
        <span className="flex-1 truncate text-xs text-zinc-700 dark:text-zinc-300">
          {node.title}
        </span>
        <span className="flex-shrink-0 text-[10px] text-zinc-400">
          p.{node.pageNumber}
        </span>
      </li>
      {node.children.map((child) => (
        <ResultItem key={child.id} node={child} depth={depth + 1} />
      ))}
    </>
  );
}

function countBookmarks(nodes: BookmarkNode[]): number {
  let count = 0;
  for (const n of nodes) {
    count += 1 + countBookmarks(n.children);
  }
  return count;
}
