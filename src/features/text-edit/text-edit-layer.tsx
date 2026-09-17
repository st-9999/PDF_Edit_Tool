"use client";

import { useCallback, useRef, useState, type PointerEvent } from "react";
import type { PageViewport } from "pdfjs-dist";
import { toast } from "sonner";
import type { PageRef } from "@/lib/editor/operations";
import {
  glyphAt,
  selectionRect,
  type PointMapper,
} from "@/lib/pdf/content/hit-test";
import {
  hasNeighborRun,
  rangeBetween,
  runAt,
} from "@/lib/pdf/content/text-runs";
import { cn } from "@/lib/utils";
import { useTextEditStore } from "@/store/text-edit-store";
import { TextEditPopover } from "./text-edit-popover";
import { useEditablePage } from "./use-editable-page";

/** クリックとドラッグを区別する移動量（px）。 */
const DRAG_THRESHOLD = 3;
/** 案内の吹き出しの高さの目安（px）。範囲の上に置けなければ下に置く。 */
const HINT_HEIGHT = 24;
/** 範囲と案内の吹き出しの間隔（px）。 */
const HINT_GAP = 4;

/** 空白を除いた文字数。 */
const visibleLength = (text: string) => [...text.replace(/\s/gu, "")].length;

/**
 * 書き換えモードでページの上に重ねる層。
 * クリックで「語・数値のまとまり」、ドラッグで同じ行の文字範囲を選び、編集ボックスを開く。
 */
export function TextEditLayer({
  page,
  viewport,
}: {
  page: PageRef;
  viewport: PageViewport;
}) {
  const state = useEditablePage(page, true);
  const selection = useTextEditStore((s) =>
    s.selection?.pageId === page.id ? s.selection : null,
  );
  const select = useTextEditStore((s) => s.select);
  const clearSelection = useTextEditStore((s) => s.clearSelection);
  const [hover, setHover] = useState<{ start: number; end: number } | null>(
    null,
  );
  /** ドラッグで範囲を選んでいる最中か（表示を切り替える）。 */
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{
    anchor: number;
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);

  const toScreen = useCallback<PointMapper>(
    (x, y) => viewport.convertToViewportPoint(x, y) as [number, number],
    [viewport],
  );

  const data = state.status === "ready" ? state.data : null;

  const pointFrom = (e: PointerEvent<HTMLDivElement>): [number, number] => {
    const box = e.currentTarget.getBoundingClientRect();
    return [e.clientX - box.left, e.clientY - box.top];
  };

  const rangeAt = (glyphIndex: number) => {
    if (!data) return null;
    const run = runAt(data.runs, glyphIndex);
    return run ? { start: run.start, end: run.end } : null;
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!data) return;
    const point = pointFrom(e);
    const index = glyphAt(data.glyphs, point, toScreen);
    const d = drag.current;
    if (d) {
      if (
        !d.moved &&
        Math.hypot(point[0] - d.x, point[1] - d.y) > DRAG_THRESHOLD
      ) {
        d.moved = true;
        setDragging(true);
      }
      if (d.moved && index !== null) {
        setHover(rangeBetween(data.glyphs, d.anchor, index));
      }
      return;
    }
    setHover(index === null ? null : rangeAt(index));
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!data || e.button !== 0) return;
    const point = pointFrom(e);
    const index = glyphAt(data.glyphs, point, toScreen);
    if (index === null) {
      clearSelection();
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { anchor: index, x: point[0], y: point[1], moved: false };
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    if (!data || !d) return;
    const index = glyphAt(data.glyphs, pointFrom(e), toScreen) ?? d.anchor;
    const range =
      d.moved && index !== d.anchor
        ? rangeBetween(data.glyphs, d.anchor, index)
        : rangeAt(d.anchor);
    if (!range) {
      toast.info(
        d.moved
          ? "別の行にまたがる範囲は選べません"
          : "この文字は書き換えられません",
      );
      return;
    }
    const unsupported = data.glyphs
      .slice(range.start, range.end)
      .some((g) => g.unsupported);
    if (unsupported) {
      toast.info("この文字は書き換えられません（対応していないフォントです）");
      return;
    }
    setHover(null);
    select({ pageId: page.id, ...range });
  };

  const hoverRect =
    data && hover && !selection
      ? selectionRect(data.glyphs, hover.start, hover.end, toScreen)
      : null;
  const hoverText =
    data && hover
      ? data.glyphs
          .slice(hover.start, hover.end)
          .map((g) => g.text ?? "")
          .join("")
      : "";
  const showNeighborHint =
    !!data && !!selection && hasNeighborRun(data.glyphs, data.runs, selection);
  const selectedRect =
    data && selection
      ? selectionRect(data.glyphs, selection.start, selection.end, toScreen)
      : null;

  return (
    <div
      data-text-edit-layer
      aria-label="文字の書き換え範囲を選ぶ"
      className={
        state.status === "ready"
          ? "absolute inset-0 cursor-text"
          : "absolute inset-0 cursor-wait"
      }
      onPointerMove={onPointerMove}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={() => {
        if (!drag.current) setHover(null);
      }}
    >
      {hoverRect && (
        <>
          <div
            data-text-edit-candidate={dragging ? "drag" : "hover"}
            aria-hidden
            className={cn(
              "pointer-events-none absolute rounded-sm border-blue-600 dark:border-blue-400",
              dragging
                ? "border-2 bg-blue-500/25 ring-4 ring-blue-500/25"
                : "border bg-blue-500/10",
            )}
            style={{
              left: hoverRect.left - 2,
              top: hoverRect.top - 2,
              width: hoverRect.width + 4,
              height: hoverRect.height + 4,
            }}
          />
          <div
            data-text-edit-hint
            className={cn(
              "pointer-events-none absolute z-10 max-w-80 truncate rounded-md px-2 py-0.5 text-xs whitespace-nowrap shadow-sm",
              dragging
                ? "bg-blue-600 font-medium text-white"
                : "bg-foreground/85 text-background",
            )}
            style={{
              left: Math.max(0, hoverRect.left - 2),
              top:
                hoverRect.top - HINT_HEIGHT - HINT_GAP >= 0
                  ? hoverRect.top - HINT_HEIGHT - HINT_GAP
                  : hoverRect.top + hoverRect.height + HINT_GAP,
            }}
          >
            {dragging
              ? `「${hoverText}」を選択中（${visibleLength(hoverText)} 文字）`
              : "クリックで選択 ／ ドラッグでまとめて選択"}
          </div>
        </>
      )}
      {selectedRect && (
        <div
          data-text-edit-selection
          aria-hidden
          className="pointer-events-none absolute rounded-sm border-2 border-blue-600 bg-blue-500/20 dark:border-blue-400"
          style={{
            left: selectedRect.left - 2,
            top: selectedRect.top - 2,
            width: selectedRect.width + 4,
            height: selectedRect.height + 4,
          }}
        />
      )}
      {data && selection && selectedRect && (
        <TextEditPopover
          key={`${selection.start}-${selection.end}-${JSON.stringify(page.textEdits ?? [])}`}
          pageId={page.id}
          data={data}
          selection={selection}
          rect={selectedRect}
          pageWidth={viewport.width}
          pageHeight={viewport.height}
          showNeighborHint={showNeighborHint}
        />
      )}
    </div>
  );
}
