import { degrees, PDFDocument } from "pdf-lib";
import { normalizeRotation, type PageRef } from "./operations";

/** sourceId → 元 PDF のバイト列。 */
export type SourceBytes = Record<string, Uint8Array>;

async function loadSourceDocs(
  sources: SourceBytes,
  sourceIds: string[],
): Promise<Map<string, PDFDocument>> {
  const map = new Map<string, PDFDocument>();
  for (const id of sourceIds) {
    const bytes = sources[id];
    if (!bytes) throw new Error(`ソース "${id}" のバイト列が見つかりません`);
    map.set(id, await PDFDocument.load(bytes));
  }
  return map;
}

export interface BuildOptions {
  /** ページ追加ごとに進捗を通知（done/total）。 */
  onProgress?: (done: number, total: number) => void;
  /** 中断シグナル（worker 終了の代替として本スレッド実行で使用）。 */
  signal?: AbortSignal;
}

/**
 * PageRef 列から新しい PDF を構築する（並び替え・回転・削除・結合の実出力）。
 * 各ページを元ドキュメントからコピーし、ユーザー回転を元の回転に加算して適用する。
 */
export async function buildPdf(
  sources: SourceBytes,
  pages: PageRef[],
  options: BuildOptions = {},
): Promise<Uint8Array> {
  if (pages.length === 0) {
    throw new Error("出力するページがありません");
  }
  const out = await PDFDocument.create();
  const sourceIds = [...new Set(pages.map((p) => p.sourceId))];
  const docs = await loadSourceDocs(sources, sourceIds);

  for (let i = 0; i < pages.length; i += 1) {
    if (options.signal?.aborted) {
      throw new DOMException("キャンセルされました", "AbortError");
    }
    const page = pages[i]!;
    const srcDoc = docs.get(page.sourceId)!;
    const [copied] = await out.copyPages(srcDoc, [page.sourceIndex]);
    const angle = normalizeRotation(copied.getRotation().angle + page.rotation);
    copied.setRotation(degrees(angle));
    out.addPage(copied);
    options.onProgress?.(i + 1, pages.length);
  }
  return out.save();
}

/** 指定 ID のページのみを現在の並び順で新規 PDF として抽出する。 */
export async function extractPages(
  sources: SourceBytes,
  pages: PageRef[],
  ids: Iterable<string>,
): Promise<Uint8Array> {
  const idSet = new Set(ids);
  const subset = pages.filter((p) => idSet.has(p.id));
  if (subset.length === 0) {
    throw new Error("抽出するページが選択されていません");
  }
  return buildPdf(sources, subset);
}

/**
 * 指定位置で分割し、複数 PDF を生成する。
 * `boundaries` は「その位置の前で切る」1 始まりのページ位置（例: 5 ページを [3] で割ると 1-2 と 3-5）。
 * 範囲外・重複は無視する。
 */
export async function splitPdf(
  sources: SourceBytes,
  pages: PageRef[],
  boundaries: number[],
): Promise<Uint8Array[]> {
  const len = pages.length;
  const cuts = [
    ...new Set(boundaries.filter((b) => b > 1 && b <= len).map(Math.trunc)),
  ].sort((a, b) => a - b);

  const ranges: PageRef[][] = [];
  let start = 0;
  for (const cut of cuts) {
    ranges.push(pages.slice(start, cut - 1));
    start = cut - 1;
  }
  ranges.push(pages.slice(start));

  const nonEmpty = ranges.filter((r) => r.length > 0);
  return Promise.all(nonEmpty.map((range) => buildPdf(sources, range)));
}
