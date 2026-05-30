import { buildOutline, type OutlineSource } from "@/lib/pdf/outline";
import { fromResolved, type EditableOutlineNode } from "./edit";

/**
 * 複数ソースのアウトラインを pdf.js から収集し、編集ツリーへ連結する。
 * `sourceIds` の順（＝ページの初出順）で連結し、各ノードへ所属 sourceId を付与する。
 * ソース単位の失敗はスキップする（しおり無しは空ツリー扱い）。
 */
export async function collectEditableOutline(
  sourceIds: string[],
  getProxy: (id: string) => OutlineSource | undefined,
): Promise<EditableOutlineNode[]> {
  const result: EditableOutlineNode[] = [];
  for (const id of sourceIds) {
    const proxy = getProxy(id);
    if (!proxy) continue;
    try {
      result.push(...fromResolved(await buildOutline(proxy), id));
    } catch {
      // 当該ソースのしおりはスキップ
    }
  }
  return result;
}
