"use client";

import { useRef } from "react";
import {
  FileTextIcon,
  RedoIcon,
  UndoIcon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useViewerStore } from "@/store/viewer-store";
import { editorSelectors, useEditorStore } from "@/store/editor-store";
import { SaveMenu } from "@/features/save/save-menu";

function isPdfFile(file: File): boolean {
  return (
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
  );
}

/** トップバー: アプリ名・ファイルを開く/閉じる。編集系は P2 以降で追加。 */
export function TopBar() {
  const fileName = useViewerStore((s) => s.fileName);
  const setFile = useViewerStore((s) => s.setFile);
  const clearFile = useViewerStore((s) => s.clearFile);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const canUndo = useEditorStore(editorSelectors.canUndo);
  const canRedo = useEditorStore(editorSelectors.canRedo);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <header className="flex items-center gap-3 border-b px-4 py-2">
      <div className="flex items-center gap-2 font-semibold">
        <FileTextIcon className="size-5" aria-hidden />
        <span>PDF ビューア＆エディタ</span>
      </div>

      <div className="ml-2 flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => inputRef.current?.click()}
        >
          <UploadIcon aria-hidden />
          開く
        </Button>
        {fileName && (
          <Button type="button" variant="ghost" size="sm" onClick={clearFile}>
            <XIcon aria-hidden />
            閉じる
          </Button>
        )}
      </div>

      {fileName && (
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="元に戻す"
            disabled={!canUndo}
            onClick={undo}
          >
            <UndoIcon aria-hidden />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="やり直す"
            disabled={!canRedo}
            onClick={redo}
          >
            <RedoIcon aria-hidden />
          </Button>
        </div>
      )}

      {fileName && (
        <div className="ml-auto flex items-center gap-3">
          <span className="text-muted-foreground max-w-[32ch] truncate text-sm">
            {fileName}
          </span>
          <SaveMenu />
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          if (!isPdfFile(file)) {
            toast.error("PDF ファイルを選択してください");
            return;
          }
          setFile(file);
          e.target.value = "";
        }}
      />
    </header>
  );
}
