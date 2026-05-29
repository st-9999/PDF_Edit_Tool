"use client";

import { useCallback, useRef, useState } from "react";
import { UploadIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useViewerStore } from "@/store/viewer-store";
import { cn } from "@/lib/utils";

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

  return (
    <main className="flex flex-1 items-center justify-center p-8">
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
          "flex w-full max-w-xl cursor-pointer flex-col items-center gap-4 rounded-xl border-2 border-dashed p-16 text-center transition-colors",
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
        <p className="text-muted-foreground text-xs">
          ファイルはブラウザ内で処理され、サーバーに送信されません。
        </p>
      </div>
    </main>
  );
}
