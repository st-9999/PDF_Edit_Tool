"use client";

import { useEffect, type RefObject } from "react";

/**
 * 要素上で Ctrl/⌘ + ホイールを「その要素専用のズーム」に割り当てるフック。
 *
 * React の `onWheel` 合成イベントは root に passive リスナとして登録されるため、
 * そこで `preventDefault()` を呼んでもブラウザ標準のズームを止められない。
 * これを確実に抑止するには、対象要素に `{ passive: false }` のネイティブ
 * リスナを直接張る必要がある（React 公式の useEffect + addEventListener パターン）。
 *
 * カーソルがこの要素上にあるときだけ発火するため、左ペイン/ビュアーで別々の
 * ズーム対象に割り当てられる。要素外では既定のブラウザズームがそのまま効く。
 */
export function useCtrlWheelZoom(
  ref: RefObject<HTMLElement | null>,
  handlers: { onZoomIn: () => void; onZoomOut: () => void },
): void {
  const { onZoomIn, onZoomOut } = handlers;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const handler = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      // ブラウザ標準のページズームを抑止し、この要素専用のズームに置き換える
      event.preventDefault();
      if (event.deltaY < 0) onZoomIn();
      else if (event.deltaY > 0) onZoomOut();
    };

    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [ref, onZoomIn, onZoomOut]);
}
