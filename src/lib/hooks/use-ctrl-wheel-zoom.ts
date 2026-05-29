"use client";

import { useCallback } from "react";

/**
 * 要素上で Ctrl/⌘ + ホイールを「その要素専用のズーム」に割り当てる **ref コールバック** を返すフック。
 *
 * 戻り値を対象要素の `ref` に渡す（`<div ref={zoomRef} />`）。要素のマウント時に
 * `{ passive: false }` のネイティブ wheel リスナを張り、アンマウント時に解除する
 * （React 19 の ref クリーンアップを利用）。
 *
 * なぜ RefObject + useEffect ではなく ref コールバックなのか:
 * - React の `onWheel` 合成イベントは root に passive 登録されるため、そこで
 *   `preventDefault()` を呼んでもブラウザ標準ズームを止められない。確実に止めるには
 *   要素へ直接 `{ passive: false }` のリスナを張る必要がある。
 * - 対象が遅延マウントされるコンテナ（例: base-ui Tabs.Panel は active 時のみ、初回
 *   コミット後の状態確定で子をマウントする）内にある場合、`useEffect` 実行時点では
 *   `ref.current` がまだ null でリスナが張られないことがある。ref コールバックなら
 *   ノードの実マウント時に確実に発火する。
 *
 * カーソルがこの要素上にあるときだけ発火するため、左ペイン/ビュアーで別々のズーム
 * 対象に割り当てられる。要素外では既定のブラウザズームがそのまま効く。
 */
export function useCtrlWheelZoom(handlers: {
  onZoomIn: () => void;
  onZoomOut: () => void;
}): (el: HTMLElement | null) => (() => void) | undefined {
  const { onZoomIn, onZoomOut } = handlers;

  return useCallback(
    (el: HTMLElement | null) => {
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
    },
    [onZoomIn, onZoomOut],
  );
}
