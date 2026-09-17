"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
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

/** ドラッグ&ドロップとクリックでファイルを受け取る枠（入口画面の 2 枠で共通）。 */
function DropZone({
  label,
  icon,
  title,
  description,
  buttonLabel,
  multiple = false,
  onFiles,
}: {
  label: string;
  icon: ReactNode;
  title: string;
  description: string;
  buttonLabel: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const openPicker = () => inputRef.current?.click();

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={label}
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
        onFiles(Array.from(e.dataTransfer.files ?? []));
      }}
      className={cn(
        "flex h-full w-full cursor-pointer flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed px-6 py-16 text-center transition-colors",
        dragging
          ? "border-primary bg-primary/5"
          : "border-zinc-300 dark:border-zinc-700",
      )}
    >
      {icon}
      <div className="space-y-1">
        <p className="text-lg font-medium">{title}</p>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      <Button
        type="button"
        variant="secondary"
        onClick={(e) => {
          e.stopPropagation();
          openPicker();
        }}
      >
        {buttonLabel}
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []));
          // 同じファイルを選び直しても change が発火するようにする
          e.target.value = "";
        }}
      />
    </div>
  );
}

/**
 * 初期（未読込）状態。単一 PDF を開く枠と、複数 PDF を結合する枠を同じ大きさで並べる。
 */
export function EmptyState() {
  const setFile = useViewerStore((s) => s.setFile);
  // 結合モード: 複数 PDF を選んで順序を決め、結合してビュアーへ進む。
  // 値は結合用の枠で受け取ったファイル（結合画面の一覧の初期値）。null は入口画面。
  const [mergeFiles, setMergeFiles] = useState<File[] | null>(null);

  const openSingle = useCallback(
    (files: File[]) => {
      const file = files[0];
      if (!file) return;
      if (!isPdfFile(file)) {
        toast.error("PDF ファイルを選択してください");
        return;
      }
      setFile(file);
    },
    [setFile],
  );

  const startMerge = useCallback((files: File[]) => {
    if (files.length === 0) return;
    if (!files.some(isPdfFile)) {
      toast.error("PDF ファイルを選択してください");
      return;
    }
    // PDF 以外の除外と通知は結合画面側（MergeIntake.addFiles）で行う
    setMergeFiles(files);
  }, []);

  if (mergeFiles) {
    return (
      <main className="relative flex flex-1 flex-col overflow-y-auto">
        <div className="absolute top-4 right-4 z-10">
          <ThemeToggle />
        </div>
        <MergeIntake
          initialFiles={mergeFiles}
          onBack={() => setMergeFiles(null)}
        />
      </main>
    );
  }

  return (
    <main className="relative flex flex-1 flex-col items-center overflow-y-auto p-8">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="my-auto flex w-full max-w-4xl flex-col items-center gap-6">
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

        {/* 単一 PDF を開く枠と、複数 PDF を結合する枠（同じ大きさで横並び） */}
        <div className="grid w-full grid-cols-1 gap-4 md:grid-cols-2">
          <DropZone
            label="PDFの読み込み"
            icon={
              <UploadIcon
                className="text-muted-foreground size-10"
                aria-hidden
              />
            }
            title="PDF をドラッグ & ドロップ"
            description="またはクリックしてファイルを選択"
            buttonLabel="ファイルを選択"
            onFiles={openSingle}
          />
          <DropZone
            label="結合する複数 PDF の読み込み"
            multiple
            icon={
              <FilePlus2Icon
                className="text-muted-foreground size-10"
                aria-hidden
              />
            }
            title="複数 PDF を結合"
            description="結合する場合はこちらにまとめてドラッグ & ドロップ"
            buttonLabel="複数ファイルを選択"
            onFiles={startMerge}
          />
        </div>

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
