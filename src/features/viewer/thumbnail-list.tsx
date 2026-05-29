"use client";

import type { MouseEvent } from "react";
import { useViewerStore } from "@/store/viewer-store";
import { useEditorStore } from "@/store/editor-store";
import { usePdfDocument } from "./pdf-document-context";
import { Thumbnail } from "./thumbnail";

/** サムネイル一覧。クリックでページ移動＋選択（Shift 範囲 / Ctrl 個別）。 */
export function ThumbnailList() {
  const pdf = usePdfDocument();
  const pages = useEditorStore((s) => s.pages);
  const selected = useEditorStore((s) => s.selection.selected);
  const selectClick = useEditorStore((s) => s.selectClick);
  const selectToggle = useEditorStore((s) => s.selectToggle);
  const selectRangeTo = useEditorStore((s) => s.selectRangeTo);
  const currentPage = useViewerStore((s) => s.currentPage);
  const requestPage = useViewerStore((s) => s.requestPage);

  const handleClick = (event: MouseEvent, id: string, position: number) => {
    if (event.shiftKey) selectRangeTo(id);
    else if (event.ctrlKey || event.metaKey) selectToggle(id);
    else selectClick(id);
    requestPage(position);
  };

  return (
    <div className="flex flex-col items-center gap-1 p-2">
      {pages.map((page, index) => {
        const position = index + 1;
        return (
          <Thumbnail
            key={page.id}
            pdf={pdf}
            pageNumber={page.sourceIndex + 1}
            position={position}
            selected={selected.has(page.id)}
            current={position === currentPage}
            onClick={(event) => handleClick(event, page.id, position)}
          />
        );
      })}
    </div>
  );
}
