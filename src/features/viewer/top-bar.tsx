"use client";

import { useRef, useState } from "react";
import {
  FileTextIcon,
  RedoIcon,
  SearchIcon,
  UndoIcon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useViewerStore } from "@/store/viewer-store";
import { editorSelectors, useEditorStore } from "@/store/editor-store";
import { useIsDirty } from "@/lib/hooks/use-is-dirty";
import { useSearchStore } from "@/store/search-store";
import { SaveMenu } from "@/features/save/save-menu";
import { ThemeToggle } from "./theme-toggle";

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
  const isDirty = useIsDirty();
  const openSearch = useSearchStore((s) => s.setOpen);
  const inputRef = useRef<HTMLInputElement>(null);
  // 未保存の変更がある状態で「開く / 閉じる」を選んだときの確認対象。
  const [pendingAction, setPendingAction] = useState<null | "open" | "close">(
    null,
  );

  const openPicker = () => inputRef.current?.click();

  // 別ファイルを開く・閉じると現在の変更は失われる。未保存なら確認を挟む。
  const handleOpen = () => {
    if (fileName && isDirty) setPendingAction("open");
    else openPicker();
  };
  const handleClose = () => {
    if (isDirty) setPendingAction("close");
    else clearFile();
  };
  const confirmPending = () => {
    const action = pendingAction;
    setPendingAction(null);
    if (action === "open") openPicker();
    else if (action === "close") clearFile();
  };

  return (
    <header className="flex shrink-0 items-center gap-3 border-b px-4 py-2">
      <div className="flex items-center gap-2 font-semibold">
        <FileTextIcon className="size-5" aria-hidden />
        <span>PDF ビューア＆エディタ</span>
      </div>

      <div className="ml-2 flex items-center gap-1">
        <Button type="button" variant="ghost" size="sm" onClick={handleOpen}>
          <UploadIcon aria-hidden />
          開く
        </Button>
        {fileName && (
          <Button type="button" variant="ghost" size="sm" onClick={handleClose}>
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

          <div className="bg-border mx-1 h-5 w-px" aria-hidden />

          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => openSearch(true)}
          >
            <SearchIcon aria-hidden />
            テキストを検索
          </Button>
        </div>
      )}

      <div className="ml-auto flex items-center gap-3">
        {fileName && (
          <span className="text-muted-foreground max-w-[32ch] truncate text-sm">
            {fileName}
          </span>
        )}
        {fileName && <SaveMenu />}
        <ThemeToggle />
      </div>

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

      <AlertDialog
        open={pendingAction !== null}
        onOpenChange={(open) => {
          if (!open) setPendingAction(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>未保存の変更があります</AlertDialogTitle>
            <AlertDialogDescription>
              現在開いている PDF への変更はまだ保存されていません。このまま
              {pendingAction === "open" ? "別のファイルを開く" : "閉じる"}
              と、変更は失われます。よろしいですか？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={confirmPending}>
              {pendingAction === "open"
                ? "変更を破棄して開く"
                : "変更を破棄して閉じる"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  );
}
