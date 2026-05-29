"use client";

import { useEffect, useRef, type MouseEvent } from "react";
import { CheckIcon } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useVisible } from "@/lib/hooks/use-visible";
import { renderPageToCanvas } from "@/lib/pdf/render";
import { THUMBNAIL_WIDTH } from "@/lib/pdf/constants";
import { cn } from "@/lib/utils";

/** A4 縦相当の概算アスペクト比（高さ = 幅 × 1.414）。プレースホルダ高さに使う。 */
const THUMBNAIL_ASPECT = 1.414;

interface ThumbnailProps {
  pdf: PDFDocumentProxy;
  /** 描画する元ページ（1 始まり）。 */
  pageNumber: number;
  /** 一覧内の表示位置（1 始まり・ラベル/現在ページ判定用）。 */
  position: number;
  /** ユーザー適用の追加回転（時計回り度）。サムネに反映する。 */
  rotation?: number;
  /** サムネイル描画幅（px）。左ペインの拡大縮小で変化する。 */
  width?: number;
  selected: boolean;
  current: boolean;
  onClick: (event: MouseEvent) => void;
  /** 一覧側がスクロール同期に使うボタン要素の登録コールバック。 */
  registerRef?: (el: HTMLButtonElement | null) => void;
}

/** サムネイル 1 件。可視範囲に入ったら低解像度で描画する（遅延生成）。 */
export function Thumbnail({
  pdf,
  pageNumber,
  position,
  rotation = 0,
  width = THUMBNAIL_WIDTH,
  selected,
  current,
  onClick,
  registerRef,
}: ThumbnailProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const visible = useVisible(buttonRef);

  useEffect(() => {
    if (!visible) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let cancelRender: (() => void) | null = null;

    (async () => {
      try {
        const page = await pdf.getPage(pageNumber);
        if (cancelled) return;
        const base = page.getViewport({ scale: 1 });
        const scale = width / base.width;
        const handle = renderPageToCanvas(page, canvas, scale, rotation);
        cancelRender = handle.cancel;
        await handle.promise;
      } catch {
        // キャンセル等は無視（再マウント時に再描画）
      }
    })();

    return () => {
      cancelled = true;
      cancelRender?.();
    };
  }, [visible, pdf, pageNumber, rotation, width]);

  return (
    <button
      ref={(el) => {
        buttonRef.current = el;
        registerRef?.(el);
      }}
      type="button"
      onClick={onClick}
      aria-label={`ページ ${position}`}
      aria-pressed={selected}
      aria-current={current ? "page" : undefined}
      className={cn(
        "relative flex flex-col items-center gap-1 rounded-md p-1.5 transition-all",
        // 閲覧中ページ: 青いリング＋オフセットで「いま表示中」を明示
        current && "ring-2 ring-sky-500 ring-offset-2 ring-offset-background",
        // 選択中ページ（編集対象）: primary の淡い塗り。未選択時のみホバー反応
        selected ? "bg-primary/15" : "hover:bg-muted",
      )}
    >
      <div
        className={cn(
          "bg-background relative overflow-hidden transition-colors",
          // 選択中は primary の太枠＋チェック、非選択は控えめな枠
          selected ? "ring-primary ring-2" : "ring-1 ring-black/5",
        )}
        style={{
          width,
          minHeight: Math.round(width * THUMBNAIL_ASPECT),
        }}
      >
        {visible ? <canvas ref={canvasRef} className="block w-full" /> : null}
        {selected && (
          <span
            className="bg-primary text-primary-foreground absolute top-1 right-1 flex size-4 items-center justify-center rounded-full shadow-sm"
            aria-hidden
          >
            <CheckIcon className="size-3" />
          </span>
        )}
      </div>
      <span
        className={cn(
          "rounded-full px-2 text-xs tabular-nums transition-colors",
          current
            ? "bg-sky-500 font-semibold text-white"
            : "text-muted-foreground",
        )}
      >
        {position}
      </span>
    </button>
  );
}
