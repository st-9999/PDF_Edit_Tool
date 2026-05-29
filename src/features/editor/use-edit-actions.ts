"use client";

import { toast } from "sonner";
import { extractPages, splitPdf } from "@/lib/editor/build";
import { createInitialPages } from "@/lib/editor/operations";
import { downloadBytes } from "@/lib/download";
import { useEditorStore } from "@/store/editor-store";
import { usePdfSources } from "@/features/viewer/pdf-sources-context";

/** ツールバー / コンテキストメニュー共通の編集アクション。 */
export function useEditActions() {
  const { getAllBytes, addSource } = usePdfSources();

  const rotate = (delta: number) => {
    useEditorStore.getState().rotateSelected(delta);
  };

  const remove = () => {
    useEditorStore.getState().deleteSelected();
  };

  const extract = async () => {
    const { pages, selection } = useEditorStore.getState();
    if (selection.selected.size === 0) {
      toast.error("抽出するページを選択してください");
      return;
    }
    try {
      const bytes = await extractPages(
        getAllBytes(),
        pages,
        selection.selected,
      );
      downloadBytes(bytes, "extracted.pdf");
      toast.success(`${selection.selected.size} ページを抽出しました`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "抽出に失敗しました");
    }
  };

  const split = async () => {
    const { pages, selection } = useEditorStore.getState();
    const boundaries = [...selection.selected]
      .map((id) => pages.findIndex((p) => p.id === id) + 1)
      .filter((pos) => pos > 1)
      .sort((a, b) => a - b);
    if (boundaries.length === 0) {
      toast.error("分割位置（2ページ目以降）を選択してください");
      return;
    }
    try {
      const parts = await splitPdf(getAllBytes(), pages, boundaries);
      parts.forEach((bytes, i) =>
        downloadBytes(bytes, `split-${String(i + 1).padStart(2, "0")}.pdf`),
      );
      toast.success(`${parts.length} ファイルに分割しました`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "分割に失敗しました");
    }
  };

  const merge = async (file: File) => {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { sourceId, numPages } = await addSource(bytes);
      const newPages = createInitialPages(sourceId, numPages);
      const { pages, mergePages } = useEditorStore.getState();
      mergePages(pages.length, newPages);
      toast.success(`${numPages} ページを結合しました`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "結合に失敗しました");
    }
  };

  return { rotate, remove, extract, split, merge };
}
