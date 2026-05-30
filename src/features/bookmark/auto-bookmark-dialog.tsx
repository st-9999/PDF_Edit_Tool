"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { PlusIcon, XIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { createId } from "@/lib/id";
import { cn } from "@/lib/utils";
import type { EditableOutlineNode } from "@/lib/outline/edit";
import {
  DEFAULT_PATTERNS,
  PATTERNS_STORAGE_KEY,
  autoGenerateBookmarks,
  mergeStoredPatterns,
  type AutoBookmarkPage,
  type TextSource,
} from "@/lib/outline/auto-bookmark";
import type {
  ExtractionProgress,
  HeadingPattern,
} from "@/types/heading-pattern";

/** 既存しおりがある場合の反映方法。 */
export type MergeMode = "replace" | "append";

type Step = "config" | "running" | "result";

interface AutoBookmarkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 自動生成の対象となる表示ページ列（順序＝出力ページ順）。 */
  pages: AutoBookmarkPage[];
  /** sourceId から pdf.js プロキシ（TextSource）を解決する。 */
  getSource: (sourceId: string) => TextSource | undefined;
  /** 既存しおり件数（0 のとき反映方法の選択肢は出さない）。 */
  existingCount: number;
  /** 適用時に生成ツリーと反映方法を通知する。 */
  onGenerate: (nodes: EditableOutlineNode[], mode: MergeMode) => void;
}

/** 子孫を含むノード総数を数える。 */
function countNodes(nodes: EditableOutlineNode[]): number {
  return nodes.reduce((n, node) => n + 1 + countNodes(node.children), 0);
}

/** localStorage からパターン設定を読み込む（不正・未保存は既定）。 */
function loadPatterns(): HeadingPattern[] {
  try {
    const raw = localStorage.getItem(PATTERNS_STORAGE_KEY);
    return mergeStoredPatterns(raw ? JSON.parse(raw) : null);
  } catch {
    return DEFAULT_PATTERNS.map((p) => ({ ...p }));
  }
}

/** パターン設定を localStorage へ保存する（失敗は無視）。 */
function savePatterns(patterns: HeadingPattern[]): void {
  try {
    localStorage.setItem(PATTERNS_STORAGE_KEY, JSON.stringify(patterns));
  } catch {
    // localStorage 不可環境では永続化のみスキップ
  }
}

/* ------------------------------ 結果プレビュー ------------------------------ */

function PreviewNode({
  node,
  level,
  pageOf,
}: {
  node: EditableOutlineNode;
  level: number;
  pageOf: (node: EditableOutlineNode) => number | null;
}) {
  const page = pageOf(node);
  return (
    <li>
      <div
        className="flex items-baseline justify-between gap-2 py-0.5"
        style={{ paddingLeft: level * 16 }}
      >
        <span className="truncate">{node.title}</span>
        <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
          {page === null ? "—" : `p.${page}`}
        </span>
      </div>
      {node.children.length > 0 && (
        <ul>
          {node.children.map((child) => (
            <PreviewNode
              key={child.id}
              node={child}
              level={level + 1}
              pageOf={pageOf}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/* ------------------------------ ダイアログ本体 ------------------------------ */

export function AutoBookmarkDialog({
  open,
  onOpenChange,
  pages,
  getSource,
  existingCount,
  onGenerate,
}: AutoBookmarkDialogProps) {
  const [patterns, setPatterns] = useState<HeadingPattern[]>(loadPatterns);
  const [startPage, setStartPage] = useState(1);
  const [step, setStep] = useState<Step>("config");
  const [progress, setProgress] = useState<ExtractionProgress | null>(null);
  const [results, setResults] = useState<EditableOutlineNode[] | null>(null);
  const [mergeMode, setMergeMode] = useState<MergeMode>("replace");

  // カスタムパターン追加フォーム
  const [customLabel, setCustomLabel] = useState("");
  const [customPattern, setCustomPattern] = useState("");
  const [customLevel, setCustomLevel] = useState<1 | 2 | 3>(1);
  const [customError, setCustomError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  // ダイアログを開いた瞬間に config へリセットする（描画時・エフェクト不要）。
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setStep("config");
      setProgress(null);
      setResults(null);
      setStartPage((p) => Math.min(Math.max(1, p), Math.max(1, pages.length)));
    }
  }

  const enabledCount = patterns.filter((p) => p.enabled).length;
  const canRun = pages.length > 0 && enabledCount > 0;

  /** 表示ページ位置（1 始まり）をノードの宛先から逆引きする。 */
  const pageOf = useMemo(() => {
    return (node: EditableOutlineNode): number | null => {
      const idx = pages.findIndex(
        (p) =>
          p.sourceId === node.sourceId && p.sourceIndex === node.sourceIndex,
      );
      return idx >= 0 ? idx + 1 : null;
    };
  }, [pages]);

  const updatePatterns = (next: HeadingPattern[]) => {
    setPatterns(next);
    savePatterns(next);
  };

  const togglePattern = (id: string, enabled: boolean) =>
    updatePatterns(
      patterns.map((p) => (p.id === id ? { ...p, enabled } : p)),
    );

  const removePattern = (id: string) =>
    updatePatterns(patterns.filter((p) => p.id !== id));

  const addCustomPattern = () => {
    const label = customLabel.trim();
    const pattern = customPattern.trim();
    if (label.length === 0 || pattern.length === 0) {
      setCustomError("パターン名と正規表現を入力してください");
      return;
    }
    try {
      new RegExp(pattern);
    } catch {
      setCustomError("無効な正規表現です");
      return;
    }
    updatePatterns([
      ...patterns,
      {
        id: createId("pattern"),
        label,
        pattern,
        level: customLevel,
        enabled: true,
        builtin: false,
      },
    ]);
    setCustomLabel("");
    setCustomPattern("");
    setCustomLevel(1);
    setCustomError(null);
  };

  const run = async () => {
    const controller = new AbortController();
    abortRef.current = controller;
    setProgress({ currentPage: 0, totalPages: pages.length, foundCount: 0 });
    setStep("running");
    try {
      const tree = await autoGenerateBookmarks(
        pages,
        getSource,
        patterns,
        (p) => setProgress(p),
        controller.signal,
        startPage,
      );
      setResults(tree);
      setMergeMode("replace");
      setStep("result");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setStep("config"); // 中止は静かに設定へ戻る
      } else {
        toast.error("しおりの自動作成に失敗しました");
        setStep("config");
      }
    } finally {
      abortRef.current = null;
    }
  };

  const cancelRun = () => abortRef.current?.abort();

  const apply = () => {
    if (!results) return;
    onGenerate(results, existingCount > 0 ? mergeMode : "replace");
    onOpenChange(false);
  };

  const progressPercent =
    progress && progress.totalPages > 0
      ? Math.round((progress.currentPage / progress.totalPages) * 100)
      : 0;

  const resultCount = results ? countNodes(results) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton={step !== "running"}>
        <DialogHeader>
          <DialogTitle>報告書しおり自動作成</DialogTitle>
          <DialogDescription>
            本文から章（第N章）/ 節（N.N）/ 項（N.N.N）の見出しを検出してしおりを作成します。
          </DialogDescription>
        </DialogHeader>

        {/* ------------------------------ config ------------------------------ */}
        {step === "config" && (
          <div className="flex flex-col gap-4">
            <label className="flex items-center gap-2 text-sm">
              開始ページ
              <Input
                type="number"
                min={1}
                max={Math.max(1, pages.length)}
                value={startPage}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v)) {
                    setStartPage(
                      Math.min(Math.max(1, v), Math.max(1, pages.length)),
                    );
                  }
                }}
                className="h-8 w-20"
              />
              <span className="text-muted-foreground">
                / {pages.length} ページ
              </span>
            </label>

            <div className="flex flex-col gap-1.5">
              <span className="text-muted-foreground text-xs">
                見出しパターン
              </span>
              <ul className="flex flex-col gap-1">
                {patterns.map((p) => (
                  <li key={p.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={p.enabled}
                      onCheckedChange={(checked) =>
                        togglePattern(p.id, checked === true)
                      }
                      aria-label={`${p.label} を${p.enabled ? "無効" : "有効"}にする`}
                    />
                    <span className="flex-1 truncate">{p.label}</span>
                    <span className="text-muted-foreground shrink-0 text-xs">
                      Lv.{p.level}
                    </span>
                    {!p.builtin && (
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`${p.label} を削除`}
                        onClick={() => removePattern(p.id)}
                      >
                        <XIcon className="size-3.5" aria-hidden />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-col gap-1.5 border-t pt-3">
              <span className="text-muted-foreground text-xs">
                カスタムパターンを追加
              </span>
              <Input
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                placeholder="パターン名（例: 附則）"
                className="h-8"
              />
              <Input
                value={customPattern}
                onChange={(e) => setCustomPattern(e.target.value)}
                placeholder="正規表現（例: ^\\s*(?<title>附則.*)$）"
                className="h-8 font-mono text-xs"
              />
              <div className="flex items-center gap-2">
                <label className="text-muted-foreground flex items-center gap-1 text-xs">
                  レベル
                  <select
                    value={customLevel}
                    onChange={(e) =>
                      setCustomLevel(Number(e.target.value) as 1 | 2 | 3)
                    }
                    className="border-input bg-transparent h-8 rounded-md border px-2 text-sm"
                  >
                    <option value={1}>1（章）</option>
                    <option value={2}>2（節）</option>
                    <option value={3}>3（項）</option>
                  </select>
                </label>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="ml-auto h-8"
                  onClick={addCustomPattern}
                >
                  <PlusIcon aria-hidden />
                  追加
                </Button>
              </div>
              {customError && (
                <p className="text-destructive text-xs">{customError}</p>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                キャンセル
              </Button>
              <Button onClick={run} disabled={!canRun}>
                実行
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* ------------------------------ running ------------------------------ */}
        {step === "running" && (
          <div className="flex flex-col gap-3 py-2">
            <p className="text-sm">
              ページ {progress?.currentPage ?? 0}/{progress?.totalPages ?? 0}{" "}
              を解析中…
            </p>
            <p className="text-muted-foreground text-xs">
              {progress?.foundCount ?? 0} 件検出
            </p>
            <div className="bg-muted h-2 w-full overflow-hidden rounded">
              <div
                className="bg-primary h-full transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={cancelRun}>
                中止
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* ------------------------------ result ------------------------------ */}
        {step === "result" && (
          <div className="flex flex-col gap-3">
            {resultCount === 0 ? (
              <p className="text-muted-foreground text-sm">
                見出しが検出されませんでした。パターンや開始ページを調整してください。
              </p>
            ) : (
              <>
                <p className="text-sm">
                  {resultCount} 件の見出しを検出しました
                </p>
                <ul className="max-h-60 overflow-auto rounded border p-2 text-sm">
                  {results!.map((node) => (
                    <PreviewNode
                      key={node.id}
                      node={node}
                      level={0}
                      pageOf={pageOf}
                    />
                  ))}
                </ul>

                {existingCount > 0 && (
                  <fieldset className="flex flex-col gap-1.5">
                    <legend className="text-muted-foreground text-xs">
                      既存のしおり（{existingCount} 件）の扱い
                    </legend>
                    {(
                      [
                        ["replace", "上書き（既存を削除して置き換え）"],
                        ["append", "末尾に追加（既存を残す）"],
                      ] as const
                    ).map(([value, label]) => (
                      <label
                        key={value}
                        className={cn(
                          "flex items-center gap-2 text-sm",
                          mergeMode === value && "font-medium",
                        )}
                      >
                        <input
                          type="radio"
                          name="auto-bookmark-merge-mode"
                          value={value}
                          checked={mergeMode === value}
                          onChange={() => setMergeMode(value)}
                          className="accent-primary size-4"
                        />
                        {label}
                      </label>
                    ))}
                  </fieldset>
                )}
              </>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("config")}>
                戻る
              </Button>
              <Button onClick={apply} disabled={resultCount === 0}>
                適用
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
