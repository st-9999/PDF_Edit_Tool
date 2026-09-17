"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlignCenterIcon,
  AlignLeftIcon,
  AlignRightIcon,
  AlertTriangleIcon,
  CircleXIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { RewriteResult, TextAlign } from "@/lib/pdf/content/rewrite";
import { suggestAlign } from "@/lib/pdf/content/text-runs";
import {
  fallbackStylesOfResult,
  loadFallbackFonts,
} from "@/lib/pdf/fallback-font-source";
import type { ScreenRect } from "@/lib/pdf/content/hit-test";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/store/editor-store";
import { useTextEditStore, type TextSelection } from "@/store/text-edit-store";
import { previewStatus } from "./preview-status";
import type { EditablePage } from "./use-editable-page";

/** 入力から確認までの待ち時間（ms）。 */
const PREVIEW_DELAY = 150;
/** 編集ボックスの幅（px）。 */
const POPOVER_WIDTH = 320;
/** 編集ボックスの高さの目安（px）。ページ下端に近い場合は選択範囲の上に出す判定に使う。 */
const POPOVER_HEIGHT_ESTIMATE = 200;
/** 選択範囲との間隔（px）。 */
const POPOVER_GAP = 6;

/**
 * 要素全体が見えるよう、ビューアのスクロール領域（`[data-viewer-scroll]`）の中だけを最小限スクロールする。
 * `scrollIntoView` は祖先のスクロール領域（文書全体）まで動かすため使わない。
 */
function revealInViewer(element: HTMLElement) {
  const container = element.closest<HTMLElement>("[data-viewer-scroll]");
  if (!container) return;
  const box = element.getBoundingClientRect();
  const view = container.getBoundingClientRect();
  if (box.bottom > view.bottom) container.scrollTop += box.bottom - view.bottom;
  else if (box.top < view.top) container.scrollTop -= view.top - box.top;
}

const ALIGNS: {
  value: TextAlign;
  label: string;
  Icon: typeof AlignLeftIcon;
}[] = [
  { value: "left", label: "左揃え", Icon: AlignLeftIcon },
  { value: "center", label: "中央揃え", Icon: AlignCenterIcon },
  { value: "right", label: "右揃え", Icon: AlignRightIcon },
];

/**
 * 選んだ範囲の書き換えボックス。入力のたびに確定前の確認を行い、
 * 書体が変わる文字（同梱フォント）や書き換えられない理由をその場で表示する。
 */
export function TextEditPopover({
  pageId,
  data,
  selection,
  rect,
  pageWidth,
  pageHeight,
}: {
  pageId: string;
  data: EditablePage;
  selection: TextSelection;
  /** 選択範囲の枠（ページ内の CSS ピクセル）。 */
  rect: ScreenRect;
  pageWidth: number;
  pageHeight: number;
}) {
  const original = data.glyphs
    .slice(selection.start, selection.end)
    .map((g) => g.text ?? "")
    .join("");
  const [text, setText] = useState(original);
  const [align, setAlign] = useState<TextAlign>(() => suggestAlign(original));
  const [checked, setChecked] = useState<{
    text: string;
    align: TextAlign;
    result: RewriteResult;
  } | null>(null);
  const clearSelection = useTextEditStore((s) => s.clearSelection);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (boxRef.current) revealInViewer(boxRef.current);
    inputRef.current?.focus({ preventScroll: true });
    inputRef.current?.select();
  }, []);

  // 入力が止まったら確定前の確認を行う（元のフォントに無い文字があれば、元の書体に近い同梱フォントを読み込んで再確認）
  useEffect(() => {
    if (text === original) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const { previewTextEdit } = await import("@/lib/editor/text-edit");
      const edit = {
        replacements: [
          { start: selection.start, end: selection.end, text, align },
        ],
      };
      let result = previewTextEdit(data.doc, data.pageIndex, edit);
      const styles = fallbackStylesOfResult(result);
      if (!result.ok && styles.length > 0) {
        try {
          const fallbackFonts = await loadFallbackFonts(styles);
          result = previewTextEdit(data.doc, data.pageIndex, edit, {
            fallbackFonts,
          });
        } catch {
          // フォントを読めなければ、描けない文字として表示する
        }
      }
      if (!cancelled) setChecked({ text, align, result });
    }, PREVIEW_DELAY);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [text, align, original, selection.start, selection.end, data]);

  const result =
    checked && checked.text === text && checked.align === align
      ? checked.result
      : null;
  const status = previewStatus({ original, text, result });

  const confirm = () => {
    if (!status.canConfirm || !result) return;
    // 同梱フォントを使った書体を記録し、表示・保存ではそのフォントだけを読み込む
    const fallbackStyles = fallbackStylesOfResult(result);
    useEditorStore.getState().editText(pageId, {
      replacements: [
        { start: selection.start, end: selection.end, text, align },
      ],
      ...(fallbackStyles.length > 0 ? { fallbackStyles } : {}),
    });
    clearSelection();
  };

  const left = Math.max(0, Math.min(rect.left, pageWidth - POPOVER_WIDTH));
  // ページ下端に近ければ選択範囲の上に出す
  const below =
    rect.top + rect.height + POPOVER_GAP + POPOVER_HEIGHT_ESTIMATE <=
      pageHeight || rect.top < POPOVER_HEIGHT_ESTIMATE + POPOVER_GAP;
  const position = below
    ? { top: rect.top + rect.height + POPOVER_GAP }
    : { bottom: pageHeight - rect.top + POPOVER_GAP };

  return (
    <div
      ref={boxRef}
      role="dialog"
      aria-label="文字の書き換え"
      className="bg-popover text-popover-foreground absolute z-20 flex flex-col gap-2 rounded-lg border p-3 shadow-lg"
      style={{ left, width: POPOVER_WIDTH, ...position }}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onPointerMove={(e) => e.stopPropagation()}
    >
      <p className="text-muted-foreground truncate text-xs">
        元の文字: <span className="text-foreground">{original}</span>
      </p>
      <Input
        ref={inputRef}
        aria-label="新しい文字"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
            e.preventDefault();
            confirm();
          } else if (e.key === "Escape") {
            e.preventDefault();
            clearSelection();
          }
        }}
      />
      <div className="flex items-center gap-1" role="group" aria-label="揃え">
        {ALIGNS.map(({ value, label, Icon }) => (
          <Button
            key={value}
            type="button"
            size="icon-sm"
            variant={align === value ? "secondary" : "ghost"}
            aria-label={label}
            aria-pressed={align === value}
            title={label}
            onClick={() => setAlign(value)}
          >
            <Icon aria-hidden />
          </Button>
        ))}
      </div>
      <p
        role="status"
        className={cn(
          "flex min-h-4 items-start gap-1 text-xs",
          status.kind === "error" && "text-destructive",
          status.kind === "warning" && "text-amber-700 dark:text-amber-400",
          (status.kind === "ok" ||
            status.kind === "checking" ||
            status.kind === "unchanged") &&
            "text-muted-foreground",
        )}
      >
        {status.kind === "error" && (
          <CircleXIcon className="mt-px size-3.5 shrink-0" aria-hidden />
        )}
        {status.kind === "warning" && (
          <AlertTriangleIcon className="mt-px size-3.5 shrink-0" aria-hidden />
        )}
        {status.message ??
          (status.kind === "checking"
            ? "確認中…"
            : status.kind === "ok"
              ? "元の書体のまま書き換えます"
              : "")}
      </p>
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={clearSelection}
        >
          キャンセル
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!status.canConfirm}
          onClick={confirm}
        >
          確定
        </Button>
      </div>
    </div>
  );
}
