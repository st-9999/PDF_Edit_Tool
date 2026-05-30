"use client";

import { useCallback, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { FilePlus2Icon, UploadIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useViewerStore } from "@/store/viewer-store";
import { recommendedLimitsLabel } from "@/lib/perf/limits";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./theme-toggle";

// 結合インテーク（dnd-kit / pdf.js を含む）は結合モードに入るまで不要なため
// 動的 import で初期バンドルから分離する。
const MergeIntake = dynamic(
  () => import("./merge-intake").then((m) => m.MergeIntake),
  {
    ssr: false,
    loading: () => (
      <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">
        読み込み中…
      </div>
    ),
  },
);

function isPdfFile(file: File): boolean {
  return (
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
  );
}

/** 初期（未読込）状態。ドラッグ&ドロップとファイル選択で PDF を受け取る。 */
export function EmptyState() {
  const setFile = useViewerStore((s) => s.setFile);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  // 結合モード: 複数 PDF を選んで順序を決め、結合してビュアーへ進む。
  const [mergeMode, setMergeMode] = useState(false);

  const accept = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (!file) return;
      if (!isPdfFile(file)) {
        toast.error("PDF ファイルを選択してください");
        return;
      }
      setFile(file);
    },
    [setFile],
  );

  const openPicker = () => inputRef.current?.click();

  if (mergeMode) {
    return (
      <main className="relative flex flex-1 flex-col overflow-y-auto">
        <div className="absolute top-4 right-4 z-10">
          <ThemeToggle />
        </div>
        <MergeIntake onBack={() => setMergeMode(false)} />
      </main>
    );
  }

  return (
    <main className="relative flex flex-1 items-center justify-center p-8">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="flex w-full max-w-xl flex-col items-center gap-6">
        {/* タイトルと簡単な説明 */}
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold tracking-tight">
            PDF ビューア＆エディタ
          </h1>
          <p className="text-muted-foreground text-sm">
            ブラウザだけで PDF
            を閲覧・編集できます（回転・削除・並べ替え・抽出・分割・結合）。
          </p>
        </div>

        {/* 単一 PDF のドラッグ&ドロップ / ファイル選択 */}
        <div
          role="button"
          tabIndex={0}
          aria-label="PDFの読み込み"
          onClick={openPicker}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              openPicker();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            accept(e.dataTransfer.files);
          }}
          className={cn(
            "flex w-full cursor-pointer flex-col items-center gap-4 rounded-xl border-2 border-dashed p-16 text-center transition-colors",
            dragging
              ? "border-primary bg-primary/5"
              : "border-zinc-300 dark:border-zinc-700",
          )}
        >
          <UploadIcon className="text-muted-foreground size-10" aria-hidden />
          <div className="space-y-1">
            <p className="text-lg font-medium">PDF をドラッグ &amp; ドロップ</p>
            <p className="text-muted-foreground text-sm">
              またはクリックしてファイルを選択
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={(e) => {
              e.stopPropagation();
              openPicker();
            }}
          >
            ファイルを選択
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => accept(e.target.files)}
          />
        </div>

        {/* 複数 PDF の結合（枠外・やや目立たせる） */}
        <Button type="button" size="lg" onClick={() => setMergeMode(true)}>
          <FilePlus2Icon aria-hidden />
          複数 PDF を結合
        </Button>

        <div className="space-y-1 text-center">
          <p className="text-muted-foreground text-xs">
            ファイルはブラウザ内で処理され、サーバーに送信されません。
          </p>
          <p className="text-muted-foreground text-xs">
            {recommendedLimitsLabel()}
          </p>
        </div>
      </div>
    </main>
  );
}
