"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * 要素が可視範囲（+ rootMargin の前後バッファ）にあるかを双方向に追跡する。
 * 離れると false になるため、呼び出し側で canvas をアンマウントして破棄できる（仮想化）。
 * これらのコンポーネントは ssr:false の動的チャンク内なので初期値は環境で分岐してよい。
 */
export function useVisible(
  ref: RefObject<Element | null>,
  rootMargin = "800px",
): boolean {
  const [visible, setVisible] = useState(
    () => typeof IntersectionObserver === "undefined",
  );

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) setVisible(entry.isIntersecting);
      },
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, rootMargin]);

  return visible;
}
