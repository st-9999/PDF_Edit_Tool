import { createId } from "@/lib/id";

/** 解決済みのしおりノード。`sourceIndex` は元ソース内 0 始まりページ（解決不能なら null）。 */
export interface OutlineNode {
  id: string;
  title: string;
  sourceIndex: number | null;
  children: OutlineNode[];
}

/** pdf.js が返す生のアウトライン項目（必要部分のみ）。 */
interface RawOutlineItem {
  title: string;
  dest: string | unknown[] | null;
  items: RawOutlineItem[];
}

/** buildOutline が必要とする pdf.js プロキシの最小インターフェース（テスト容易性のため）。 */
export interface OutlineSource {
  getOutline(): Promise<RawOutlineItem[] | null>;
  getDestination(id: string): Promise<unknown[] | null>;
  getPageIndex(ref: unknown): Promise<number>;
}

/** dest（名前付き or 明示配列）を 0 始まりページ番号へ解決する。失敗は null。 */
async function resolveDest(
  source: OutlineSource,
  dest: string | unknown[] | null,
): Promise<number | null> {
  try {
    const explicit =
      typeof dest === "string" ? await source.getDestination(dest) : dest;
    if (!Array.isArray(explicit) || explicit.length === 0) return null;
    const ref = explicit[0];
    if (ref == null) return null;
    return await source.getPageIndex(ref);
  } catch {
    return null;
  }
}

async function buildNodes(
  source: OutlineSource,
  items: RawOutlineItem[],
): Promise<OutlineNode[]> {
  const nodes: OutlineNode[] = [];
  for (const item of items) {
    nodes.push({
      id: createId("outline"),
      title: item.title,
      sourceIndex: await resolveDest(source, item.dest),
      children: await buildNodes(source, item.items ?? []),
    });
  }
  return nodes;
}

/** PDF のアウトラインを解決済みツリーへ変換する。アウトライン無しは []。 */
export async function buildOutline(
  source: OutlineSource,
): Promise<OutlineNode[]> {
  const raw = await source.getOutline();
  if (!raw || raw.length === 0) return [];
  return buildNodes(source, raw);
}
