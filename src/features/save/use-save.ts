"use client";

import { useMemo } from "react";
import { toast } from "sonner";
import {
  extractPages,
  splitPdf,
  type BuildOutlineNode,
} from "@/lib/editor/build";
import { runBuild } from "@/lib/pdf/build-runner";
import { buildOutline, type OutlineNode } from "@/lib/pdf/outline";
import { createSaveStrategy, type SaveStrategy } from "@/lib/save/strategy";
import { useEditorStore } from "@/store/editor-store";
import { useViewerStore } from "@/store/viewer-store";
import { useProgressStore } from "@/store/progress-store";
import { usePdfSources } from "@/features/viewer/pdf-sources-context";

/** OutlineNode（ソース内ページ基準）に sourceId を付与し、ビルド用ツリーへ変換する。 */
function tagWithSource(
  nodes: OutlineNode[],
  sourceId: string,
): BuildOutlineNode[] {
  return nodes.map((n) => ({
    title: n.title,
    sourceId,
    sourceIndex: n.sourceIndex,
    children: tagWithSource(n.children, sourceId),
  }));
}

function suggestedName(fileName: string | null, suffix = ""): string {
  const base = (fileName ?? "document.pdf").replace(/\.pdf$/i, "");
  return `${base}${suffix}.pdf`;
}

/** 保存層のアクション群。能力に応じた保存戦略を内部で選択する。 */
export function useSave() {
  const { getAllBytes, getProxy } = usePdfSources();
  const strategy = useMemo<SaveStrategy>(() => createSaveStrategy(), []);

  // 現在の全ソースのしおりを pdf.js で収集し、保存時に出力へ書き戻す（保存でしおりが
  // 消えないように）。複数ソース（結合）はソースの初出順に連結する。失敗時はしおり無し。
  const collectOutline = async (): Promise<BuildOutlineNode[]> => {
    const pages = useEditorStore.getState().pages;
    const sourceIds = [...new Set(pages.map((p) => p.sourceId))];
    const result: BuildOutlineNode[] = [];
    for (const id of sourceIds) {
      const proxy = getProxy(id);
      if (!proxy) continue;
      try {
        const tree = await buildOutline(proxy);
        result.push(...tagWithSource(tree, id));
      } catch {
        // 当該ソースのしおりはスキップ
      }
    }
    return result;
  };

  // 現在のドキュメントを Worker で生成（進捗オーバーレイ＋キャンセル付き）
  const buildCurrent = async () => {
    const outline = await collectOutline();
    const controller = new AbortController();
    useProgressStore
      .getState()
      .begin("PDF を生成中…", () => controller.abort());
    try {
      return await runBuild(getAllBytes(), useEditorStore.getState().pages, {
        signal: controller.signal,
        outline,
        onProgress: (done, total) =>
          useProgressStore.getState().progress(done, total),
      });
    } finally {
      useProgressStore.getState().end();
    }
  };

  const saveAs = async () => {
    try {
      const bytes = await buildCurrent();
      const name = suggestedName(useViewerStore.getState().fileName);
      const target = await strategy.saveAs(bytes, name);
      if (!target) return; // キャンセル
      useEditorStore.getState().markSaved(target.handle);
      toast.success(`保存しました: ${target.name}`);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        toast.info("保存をキャンセルしました");
        return;
      }
      toast.error(err instanceof Error ? err.message : "保存に失敗しました");
    }
  };

  const overwrite = async () => {
    const { fileHandle } = useEditorStore.getState();
    if (!strategy.canOverwrite || !fileHandle) {
      await saveAs();
      return;
    }
    try {
      const bytes = await buildCurrent();
      await strategy.overwrite(fileHandle, bytes);
      useEditorStore.getState().markSaved(fileHandle);
      toast.success("上書き保存しました");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        toast.info("保存をキャンセルしました");
        return;
      }
      toast.error(
        err instanceof Error ? err.message : "上書き保存に失敗しました",
      );
    }
  };

  /** ハンドルがあれば上書き、無ければ名前を付けて保存。 */
  const save = async () => {
    const { fileHandle } = useEditorStore.getState();
    if (strategy.canOverwrite && fileHandle) await overwrite();
    else await saveAs();
  };

  const saveSplit = async () => {
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
      const fileName = useViewerStore.getState().fileName;
      let saved = 0;
      for (let i = 0; i < parts.length; i += 1) {
        const target = await strategy.saveAs(
          parts[i]!,
          suggestedName(fileName, `-${String(i + 1).padStart(2, "0")}`),
        );
        if (!target) break; // キャンセルで中断
        saved += 1;
      }
      if (saved > 0) toast.success(`${saved} ファイルを保存しました`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "分割保存に失敗しました",
      );
    }
  };

  const saveExtract = async () => {
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
      const target = await strategy.saveAs(
        bytes,
        suggestedName(useViewerStore.getState().fileName, "-extract"),
      );
      if (target)
        toast.success(`${selection.selected.size} ページを抽出しました`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "抽出に失敗しました");
    }
  };

  return {
    canOverwrite: strategy.canOverwrite,
    save,
    saveAs,
    overwrite,
    saveSplit,
    saveExtract,
  };
}
