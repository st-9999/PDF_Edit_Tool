"use client";

import { useEffect } from "react";
import { ChevronDownIcon, SaveIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useEditorStore } from "@/store/editor-store";
import { useSave } from "./use-save";

/** 保存メニュー（名前を付けて保存 / 上書き保存 / 分割して保存）＋ Ctrl+S。 */
export function SaveMenu() {
  const { canOverwrite, save, saveAs, overwrite, saveSplit } = useSave();
  const fileHandle = useEditorStore((s) => s.fileHandle);
  const canUseOverwrite = canOverwrite && fileHandle != null;

  // Ctrl/Cmd+S で保存（入力中は除く）
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "s")
        return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      void save();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [save]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button type="button" size="sm" variant="ghost" />}
      >
        <SaveIcon aria-hidden />
        保存
        <ChevronDownIcon aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => void saveAs()}>
          名前を付けて保存
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!canUseOverwrite}
          onClick={() => void overwrite()}
        >
          上書き保存
          {!canOverwrite && (
            <span className="text-muted-foreground ml-2 text-xs">
              （Chrome / Edge のみ）
            </span>
          )}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void saveSplit()}>
          分割して保存
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
