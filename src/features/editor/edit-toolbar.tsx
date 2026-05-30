"use client";

import { useState } from "react";
import {
  FileOutputIcon,
  LayoutGridIcon,
  RotateCcwIcon,
  RotateCwIcon,
  ScissorsIcon,
  Trash2Icon,
} from "lucide-react";
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
import { editorSelectors, useEditorStore } from "@/store/editor-store";
import { useViewerStore } from "@/store/viewer-store";
import { ROTATION_STEP } from "@/lib/editor/operations";
import { cn } from "@/lib/utils";
import { useEditActions } from "./use-edit-actions";

/** ページ操作ツールバー。回転/削除/抽出/分割は選択時のみ活性。 */
export function EditToolbar() {
  const selectedCount = useEditorStore(editorSelectors.selectedCount);
  const { rotate, remove, extract, split } = useEditActions();
  const setOrganize = useViewerStore((s) => s.setOrganize);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const hasSelection = selectedCount > 0;

  return (
    <div className="flex flex-wrap items-center gap-1 border-b px-4 py-1.5">
      <span
        className={cn(
          "mr-2 text-xs",
          // 選択中は他のツールバーテキストと同じ前景色で表示し、薄さを解消する
          hasSelection ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {hasSelection ? `${selectedCount} ページ選択中` : "ページ未選択"}
      </span>

      <Button
        type="button"
        size="icon"
        variant="ghost"
        aria-label="左に回転"
        disabled={!hasSelection}
        onClick={() => rotate(-ROTATION_STEP)}
      >
        <RotateCcwIcon aria-hidden />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        aria-label="右に回転"
        disabled={!hasSelection}
        onClick={() => rotate(ROTATION_STEP)}
      >
        <RotateCwIcon aria-hidden />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        aria-label="削除"
        disabled={!hasSelection}
        onClick={() => setConfirmOpen(true)}
      >
        <Trash2Icon aria-hidden />
      </Button>

      <div className="bg-border mx-1 h-5 w-px" aria-hidden />

      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={!hasSelection}
        onClick={extract}
      >
        <FileOutputIcon aria-hidden />
        抽出
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={!hasSelection}
        onClick={split}
      >
        <ScissorsIcon aria-hidden />
        分割
      </Button>

      <div className="bg-border mx-1 h-5 w-px" aria-hidden />

      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => setOrganize(true)}
      >
        <LayoutGridIcon aria-hidden />
        ページを一覧整理
      </Button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              選択した {selectedCount} ページを削除しますか？
            </AlertDialogTitle>
            <AlertDialogDescription>
              この操作は Undo（Ctrl+Z）で元に戻せます。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                remove();
                setConfirmOpen(false);
              }}
            >
              削除する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
