"use client";

import { useMemo } from "react";
import { toast } from "sonner";
import {
  extractPages,
  splitPdf,
  type BuildOutlineNode,
} from "@/lib/editor/build";
import { runBuild } from "@/lib/pdf/build-runner";
import { collectEditableOutline } from "@/lib/outline/collect";
import { toBuildNodes } from "@/lib/outline/edit";
import { createSaveStrategy, type SaveStrategy } from "@/lib/save/strategy";
import { useEditorStore } from "@/store/editor-store";
import { useViewerStore } from "@/store/viewer-store";
import { useProgressStore } from "@/store/progress-store";
import { docKeyFromSourceIds, useOutlineStore } from "@/store/outline-store";
import { usePdfSources } from "@/features/viewer/pdf-sources-context";

function suggestedName(fileName: string | null, suffix = ""): string {
  const base = (fileName ?? "document.pdf").replace(/\.pdf$/i, "");
  return `${base}${suffix}.pdf`;
}

/** メッセージが日本語（かな・漢字）を含むか。アプリ自身が投げたものかの判定に使う。 */
function hasJapanese(message: string): boolean {
  return /[぀-ヿ一-鿿]/.test(message);
}

/**
 * 保存失敗時にユーザーへ見せるメッセージを決める。
 * pdf-lib など内部ライブラリの英語メッセージは、そのまま出しても利用者が対処できず
 * 内部実装の示唆（例: `ignoreEncryption` を使え）を含むこともあるため、
 * 日本語を含むメッセージ（＝アプリが意図して出したもの）だけを表示し、
 * それ以外は定型文にしてコンソールへ詳細を残す。
 */
function saveErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && hasJapanese(err.message)) return err.message;
  console.error(fallback, err);
  return fallback;
}

/** 保存層のアクション群。能力に応じた保存戦略を内部で選択する。 */
export function useSave() {
  const { getAllBytes, getProxy } = usePdfSources();
  const strategy = useMemo<SaveStrategy>(() => createSaveStrategy(), []);

  // 保存時に出力へ書き戻すしおりを決める（保存でしおりが消えないように）。
  // しおりタブで編集済み（同一ドキュメント）なら編集ツリーを優先し、
  // 未編集なら pdf.js から全ソースのしおりを収集する（従来どおり）。
  const collectOutline = async (): Promise<BuildOutlineNode[]> => {
    const pages = useEditorStore.getState().pages;
    const sourceIds = [...new Set(pages.map((p) => p.sourceId))];
    const docKey = docKeyFromSourceIds(sourceIds);
    const outline = useOutlineStore.getState();

    const editable =
      outline.loaded && outline.docKey === docKey
        ? outline.nodes
        : await collectEditableOutline(sourceIds, getProxy);
    return toBuildNodes(editable);
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
      useOutlineStore.getState().markSaved();
      toast.success(`保存しました: ${target.name}`);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        toast.info("保存をキャンセルしました");
        return;
      }
      toast.error(saveErrorMessage(err, "保存に失敗しました"));
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
      useOutlineStore.getState().markSaved();
      toast.success("上書き保存しました");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        toast.info("保存をキャンセルしました");
        return;
      }
      toast.error(saveErrorMessage(err, "上書き保存に失敗しました"));
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
      toast.error(saveErrorMessage(err, "分割保存に失敗しました"));
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
      toast.error(saveErrorMessage(err, "抽出に失敗しました"));
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
