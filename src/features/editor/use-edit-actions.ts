"use client";

import { useEditorStore } from "@/store/editor-store";
import { useSave } from "@/features/save/use-save";

/** ツールバー / コンテキストメニュー共通の編集アクション。 */
export function useEditActions() {
  const { saveExtract, saveSplit } = useSave();

  const rotate = (delta: number) => {
    useEditorStore.getState().rotateSelected(delta);
  };

  const remove = () => {
    useEditorStore.getState().deleteSelected();
  };

  // 抽出・分割は保存層（能力判定）経由で出力する
  const extract = () => saveExtract();
  const split = () => saveSplit();

  return { rotate, remove, extract, split };
}
