"use client";

import { useEffect } from "react";
import { useEditorStore } from "@/store/editor-store";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.isContentEditable
  );
}

/** 編集ショートカット: Ctrl/Cmd+Z で Undo、Ctrl/Cmd+Y または Shift+Z で Redo。 */
export function useEditorShortcuts(): void {
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (isEditableTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if (key === "y" || (key === "z" && event.shiftKey)) {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo]);
}
