import { editorSelectors, useEditorStore } from "@/store/editor-store";
import { useOutlineStore } from "@/store/outline-store";

/**
 * ドキュメント全体の未保存状態。ページ編集（操作ログ）に加えて
 * しおり編集（outline-store）も未保存として扱う。
 */
export function useIsDirty(): boolean {
  const editorDirty = useEditorStore(editorSelectors.isDirty);
  const outlineDirty = useOutlineStore((s) => s.dirty);
  return editorDirty || outlineDirty;
}
