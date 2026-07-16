import {
  degrees,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNull,
  PDFNumber,
  type PDFRef,
} from "pdf-lib";
import { decryptPdfIfNeeded } from "@/lib/pdf/decrypt";
import { normalizeRotation, type PageRef } from "./operations";

/** sourceId → 元 PDF のバイト列。 */
export type SourceBytes = Record<string, Uint8Array>;

/**
 * 出力へ書き戻すしおり（アウトライン）ノード。`sourceIndex` は元ソース内 0 始まりページ。
 * 出力時に (sourceId, sourceIndex) を出力ページへ再マッピングして /Dest を張り直す。
 */
export interface BuildOutlineNode {
  title: string;
  sourceId: string;
  sourceIndex: number | null;
  children: BuildOutlineNode[];
}

/** ノード群の可視（開いた状態の）総数を数える（PDF アウトラインの /Count 用）。 */
function countVisible(nodes: BuildOutlineNode[]): number {
  let n = 0;
  for (const node of nodes) n += 1 + countVisible(node.children);
  return n;
}

/**
 * 構築済み出力 PDF にしおり（/Outlines）を書き戻す。
 * 各ノードの (sourceId, sourceIndex) を現在のページ並びの出力ページへ対応付け、
 * 見つかったページへの /Dest を張る（削除等で見つからない場合は宛先なしの見出しとして残す）。
 */
function applyOutline(
  out: PDFDocument,
  pages: PageRef[],
  outline: BuildOutlineNode[],
): void {
  if (outline.length === 0) return;
  const context = out.context;
  const outPages = out.getPages();

  const refForTarget = (node: BuildOutlineNode): PDFRef | null => {
    if (node.sourceIndex == null) return null;
    const idx = pages.findIndex(
      (p) => p.sourceId === node.sourceId && p.sourceIndex === node.sourceIndex,
    );
    if (idx < 0 || idx >= outPages.length) return null;
    return outPages[idx]!.ref;
  };

  // 子から参照を確保しつつ、Parent / Prev / Next を相互リンクして 1 レベル分を構築する。
  const buildLevel = (
    nodes: BuildOutlineNode[],
    parentRef: PDFRef,
  ): { first: PDFRef; last: PDFRef; count: number } | null => {
    if (nodes.length === 0) return null;
    const refs = nodes.map(() => context.nextRef());
    nodes.forEach((node, i) => {
      const ref = refs[i]!;
      const childRes = buildLevel(node.children, ref);
      const dict = PDFDict.withContext(context);
      dict.set(PDFName.of("Title"), PDFHexString.fromText(node.title));
      dict.set(PDFName.of("Parent"), parentRef);
      if (i > 0) dict.set(PDFName.of("Prev"), refs[i - 1]!);
      if (i < nodes.length - 1) dict.set(PDFName.of("Next"), refs[i + 1]!);
      if (childRes) {
        dict.set(PDFName.of("First"), childRes.first);
        dict.set(PDFName.of("Last"), childRes.last);
        dict.set(PDFName.of("Count"), PDFNumber.of(childRes.count));
      }
      const target = refForTarget(node);
      if (target) {
        dict.set(
          PDFName.of("Dest"),
          context.obj([target, PDFName.of("XYZ"), PDFNull, PDFNull, PDFNull]),
        );
      }
      context.assign(ref, dict);
    });
    return {
      first: refs[0]!,
      last: refs[refs.length - 1]!,
      count: countVisible(nodes),
    };
  };

  const outlinesRef = context.nextRef();
  const top = buildLevel(outline, outlinesRef);
  if (!top) return;
  const outlinesDict = PDFDict.withContext(context);
  outlinesDict.set(PDFName.of("Type"), PDFName.of("Outlines"));
  outlinesDict.set(PDFName.of("First"), top.first);
  outlinesDict.set(PDFName.of("Last"), top.last);
  outlinesDict.set(PDFName.of("Count"), PDFNumber.of(top.count));
  context.assign(outlinesRef, outlinesDict);
  out.catalog.set(PDFName.of("Outlines"), outlinesRef);
}

async function loadSourceDocs(
  sources: SourceBytes,
  sourceIds: string[],
): Promise<Map<string, PDFDocument>> {
  const map = new Map<string, PDFDocument>();
  for (const id of sourceIds) {
    const bytes = sources[id];
    if (!bytes) throw new Error(`ソース "${id}" のバイト列が見つかりません`);
    // pdf-lib は暗号化 PDF を扱えない（`ignoreEncryption` を渡しても中身は暗号文のまま）。
    // pdf.js は閲覧時に復号できるため「表示できるのに保存できない」状態になる。
    // 保存前にここで復号し、暗号化なしの通常 PDF として扱う。
    map.set(id, await PDFDocument.load(await decryptPdfIfNeeded(bytes)));
  }
  return map;
}

export interface BuildOptions {
  /** ページ追加ごとに進捗を通知（done/total）。 */
  onProgress?: (done: number, total: number) => void;
  /** 中断シグナル（worker 終了の代替として本スレッド実行で使用）。 */
  signal?: AbortSignal;
  /** 元ドキュメントのしおり（アウトライン）。指定時は出力へ再マッピングして書き戻す。 */
  outline?: BuildOutlineNode[];
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
  if (options.outline && options.outline.length > 0) {
    applyOutline(out, pages, options.outline);
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
