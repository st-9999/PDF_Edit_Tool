"use client";

import { useEffect } from "react";

/** 未保存の編集があるとき、タブを閉じる/離脱する際に確認ダイアログを出す。 */
export function useUnsavedGuard(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // 一部ブラウザは returnValue の設定を要求する
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
}
