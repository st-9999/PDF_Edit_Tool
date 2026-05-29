"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * 要素がビューポート（の近傍）に入ったかを返す。一度可視になったら true を保持する
 * （遅延描画の起点に使う）。IntersectionObserver 非対応環境では即座に true。
 */
export function useInView(
  ref: RefObject<Element | null>,
  rootMargin = "300px",
): boolean {
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || inView || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, rootMargin, inView]);

  return inView;
}
