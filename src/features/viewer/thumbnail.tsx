"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { CheckIcon } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useVisible } from "@/lib/hooks/use-visible";
import { computeFitScale, renderPageToCanvas } from "@/lib/pdf/render";
import { THUMBNAIL_WIDTH } from "@/lib/pdf/constants";
import { cn } from "@/lib/utils";

/** A4 縦相当の概算アスペクト比（高さ = 幅 × 1.414）。実寸が分かる前のプレースホルダ用。 */
const THUMBNAIL_ASPECT = 1.414;

/** 元ページの回転とユーザー回転を合算し [0,360) に正規化する（時計回り度）。 */
function totalRotation(pageRotate: number, userRotation: number): number {
  return (((pageRotate + userRotation) % 360) + 360) % 360;
}

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
  /** 複数選択モードか。ON の間は未選択ページにも空のチェックボックスを表示する。 */
  multiSelectMode?: boolean;
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
  multiSelectMode = false,
  onClick,
  registerRef,
}: ThumbnailProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const visible = useVisible(buttonRef);
  // 描画後のサムネ表示寸法（CSS px）。枠は描画実寸に一致させる（余白なし）。
  // 実寸は「幅 width × 高さ width×THUMBNAIL_ASPECT」のセルに収まるようスケールするため、
  // 横長ページでも width を超えず、グリッドで隣と重ならない。
  // 未描画時は縦長プレースホルダ（A4 縦相当）で代用する。
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);

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
        // 回転後（元ページ回転＋ユーザー回転）の表示寸法を求める。90/270° で幅・高さは入れ替わる。
        const total = totalRotation(page.rotate, rotation);
        const rotated = page.getViewport({ scale: 1, rotation: total });
        // 回転後のページを「幅 width × 高さ width×THUMBNAIL_ASPECT」のセルに、
        // アスペクト比を保ったまま収める。
        // 短辺基準（旧実装）では A3 横などの横長ページが width×1.414 の実寸になり、
        // グリッドのトラック幅を超えて隣のサムネと重なっていた。
        // このセル基準なら実寸は必ず width 以下・高さも上限内に収まる。
        // なお A4 縦（1:1.414）はセル比と一致するため、従来どおり width いっぱいに描画される。
        const scale = computeFitScale(
          rotated.width,
          rotated.height,
          "page",
          width,
          width * THUMBNAIL_ASPECT,
        );
        const handle = renderPageToCanvas(page, canvas, scale, rotation);
        cancelRender = handle.cancel;
        if (!cancelled && handle.cssWidth > 0 && handle.cssHeight > 0) {
          setBox({ w: handle.cssWidth, h: handle.cssHeight });
        }
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
        current && "ring-offset-background ring-2 ring-sky-500 ring-offset-2",
        // 選択中ページ（編集対象）: primary の塗り。未選択時のみホバー反応
        selected ? "bg-primary/15" : "hover:bg-muted",
      )}
    >
      <div
        className={cn(
          "bg-background relative overflow-hidden transition-[box-shadow]",
          // 選択中は primary の太枠＋外側グロー、非選択は控えめな枠
          selected
            ? "ring-primary shadow-primary/30 shadow-[0_0_0_4px] ring-[3px]"
            : "ring-1 ring-black/5",
        )}
        style={
          box
            ? { width: box.w, height: box.h }
            : // 未描画時は縦長プレースホルダ（高さ = 幅 × 1.414）
              { width, height: Math.round(width * THUMBNAIL_ASPECT) }
        }
      >
        {/* 枠は描画実寸に一致（短辺＝サムネ基準幅・余白なし）。canvas を実寸で敷き詰める */}
        {visible ? (
          <canvas ref={canvasRef} className="absolute top-0 left-0 block" />
        ) : null}
        {/* 選択中はページ全体に primary の半透明オーバーレイを重ね、複数選択を一目で把握できるようにする
            （実コンテンツの可読性を保つため薄め。主たる選択シグナルは太枠＋チェック） */}
        {selected && (
          <span
            className="bg-primary/10 pointer-events-none absolute inset-0"
            aria-hidden
          />
        )}
        {/* チェックボックスは複数選択モード中のみ表示（未選択は空丸／選択は塗り＋チェック）。
            単一選択モードでは表示しない（選択の目印は太枠＋オーバーレイ）。 */}
        {multiSelectMode && (
          <span
            className={cn(
              "absolute top-1 right-1 flex size-5 items-center justify-center rounded-full border-2 shadow-sm transition-colors",
              selected
                ? "border-primary bg-primary text-primary-foreground"
                : "border-muted-foreground/60 bg-background/80 text-transparent",
            )}
            aria-hidden
          >
            <CheckIcon className="size-3.5" />
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
