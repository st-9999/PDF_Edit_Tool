"use client";

import { useEffect, useState } from "react";
import type { PDFDocument } from "pdf-lib";
import type { PageRef } from "@/lib/editor/operations";
import type { PageGlyph } from "@/lib/pdf/content/text-layout";
import type { TextRun } from "@/lib/pdf/content/text-runs";
import {
  fallbackStylesOfEdits,
  loadFallbackFonts,
} from "@/lib/pdf/fallback-font-source";
import { usePdfSources } from "@/features/viewer/pdf-sources-context";

/**
 * 書き換えモードで使う、ページの「現在の状態」（それまでの書き換えを適用済み）の文字情報。
 * 当たり判定・範囲選択・確定前の確認は、保存時と同じ `loadDocumentWithEdits` の結果を使うため、
 * 選んだ範囲と実際に書き換わる範囲が必ず一致する。
 */
export interface EditablePage {
  /** 書き換えを適用した文書（確定前の確認に使う。変更しないこと）。 */
  doc: PDFDocument;
  pageIndex: number;
  glyphs: PageGlyph[];
  runs: TextRun[];
}

export type EditablePageState =
  | { status: "idle" | "loading" }
  | { status: "ready"; data: EditablePage }
  | { status: "error"; error: Error };

/** 同時に保持する文書数（元の PDF 全体を読むため少なめにする）。 */
const CAPACITY = 3;
const cache = new Map<string, Promise<EditablePage>>();

function keyOf(page: PageRef): string {
  return JSON.stringify([
    page.sourceId,
    page.sourceIndex,
    page.textEdits ?? [],
  ]);
}

async function loadEditablePage(
  page: PageRef,
  bytes: Uint8Array,
): Promise<EditablePage> {
  const [{ loadDocumentWithEdits }, { extractPageText }, { findTextRuns }] =
    await Promise.all([
      import("@/lib/editor/text-edit"),
      import("@/lib/pdf/content/page-text"),
      import("@/lib/pdf/content/text-runs"),
    ]);
  // 同梱フォントを使う書き換えを含む場合は、その書体のフォントだけを読み込む
  const edits = page.textEdits ?? [];
  const styles = fallbackStylesOfEdits(edits);
  const doc: PDFDocument = await loadDocumentWithEdits(
    bytes,
    page.sourceIndex,
    edits,
    styles.length > 0 ? { fallbackFonts: await loadFallbackFonts(styles) } : {},
  );
  const glyphs = extractPageText(doc, page.sourceIndex).glyphs;
  return {
    doc,
    pageIndex: page.sourceIndex,
    glyphs,
    runs: findTextRuns(glyphs),
  };
}

function load(page: PageRef, bytes: Uint8Array): Promise<EditablePage> {
  const key = keyOf(page);
  let entry = cache.get(key);
  if (entry) {
    cache.delete(key);
  } else {
    entry = loadEditablePage(page, bytes);
    entry.catch(() => cache.delete(key));
  }
  cache.set(key, entry);
  while (cache.size > CAPACITY) {
    cache.delete(cache.keys().next().value as string);
  }
  return entry;
}

/** 書き換えモードのときだけ、ページの文字情報を読み込む。 */
export function useEditablePage(
  page: PageRef | undefined,
  enabled: boolean,
): EditablePageState {
  const { getAllBytes } = usePdfSources();
  const [state, setState] = useState<{
    key: string | null;
    value: EditablePageState;
  }>({ key: null, value: { status: "idle" } });
  const key = page && enabled ? keyOf(page) : null;

  useEffect(() => {
    if (!page || !key) return;
    const bytes = getAllBytes()[page.sourceId];
    if (!bytes) return;
    let cancelled = false;
    load(page, bytes).then(
      (data) => {
        if (!cancelled) setState({ key, value: { status: "ready", data } });
      },
      (error: unknown) => {
        if (!cancelled) {
          setState({
            key,
            value: {
              status: "error",
              error: error instanceof Error ? error : new Error(String(error)),
            },
          });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [key, page, getAllBytes]);

  if (!key) return { status: "idle" };
  return state.key === key ? state.value : { status: "loading" };
}
