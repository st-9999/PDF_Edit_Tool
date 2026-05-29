"use client";

import { toast } from "sonner";
import { createInitialPages } from "@/lib/editor/operations";
import { checkLimits, RECOMMENDED_MAX_PAGES } from "@/lib/perf/limits";
import { useEditorStore } from "@/store/editor-store";
import { usePdfSources } from "@/features/viewer/pdf-sources-context";
import { useSave } from "@/features/save/use-save";

/** ツールバー / コンテキストメニュー共通の編集アクション。 */
export function useEditActions() {
  const { addSource } = usePdfSources();
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

  const merge = async (file: File) => {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { sourceId, numPages } = await addSource(bytes);
      const newPages = createInitialPages(sourceId, numPages);
      const { pages, mergePages } = useEditorStore.getState();
      mergePages(pages.length, newPages);
      toast.success(`${numPages} ページを結合しました`);
      const total = pages.length + numPages;
      if (checkLimits(total, 0).exceedsPages) {
        toast.warning(
          `合計 ${total} ページになりました（推奨 約 ${RECOMMENDED_MAX_PAGES} ページ）。動作が重くなる場合があります。`,
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "結合に失敗しました");
    }
  };

  return { rotate, remove, extract, split, merge };
}
