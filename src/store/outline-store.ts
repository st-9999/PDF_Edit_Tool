import { create } from "zustand";
import {
  addChild,
  addNode,
  createNode,
  indent,
  moveDown,
  moveUp,
  outdent,
  removeNode,
  renameNode,
  type EditableOutlineNode,
} from "@/lib/outline/edit";

interface OutlineState {
  /** 現在の編集ツリー。 */
  nodes: EditableOutlineNode[];
  /** 現在のドキュメント向けに baseline を読み込み済みか。 */
  loaded: boolean;
  /** 読み込んだドキュメントの識別子（ソース ID 列）。別ドキュメントとの取り違え防止。 */
  docKey: string | null;
  /** baseline から編集されたか（未保存判定に使用）。 */
  dirty: boolean;

  /** baseline を読み込む（しおりタブ表示時／保存時の初期化）。dirty をクリア。 */
  load: (nodes: EditableOutlineNode[], docKey: string) => void;
  /** ドキュメントを閉じた等でクリアする。 */
  reset: () => void;
  /** 保存完了で dirty をクリアする。 */
  markSaved: () => void;

  rename: (id: string, title: string) => void;
  remove: (id: string) => void;
  /**
   * 新規しおりを `afterId` の直後（null でルート末尾）に追加し、その ID を返す。
   * 追加直後にリネーム編集へ入るため ID を返す。
   */
  addBookmark: (
    afterId: string | null,
    input: { title: string; sourceId: string; sourceIndex: number | null },
  ) => string;
  /** 新規しおりを `parentId` の子末尾へ追加し、その ID を返す。 */
  addSubBookmark: (
    parentId: string,
    input: { title: string; sourceId: string; sourceIndex: number | null },
  ) => string;
  moveUp: (id: string) => void;
  moveDown: (id: string) => void;
  indent: (id: string) => void;
  outdent: (id: string) => void;
}

export const useOutlineStore = create<OutlineState>((set) => ({
  nodes: [],
  loaded: false,
  docKey: null,
  dirty: false,

  load: (nodes, docKey) => set({ nodes, loaded: true, docKey, dirty: false }),
  reset: () => set({ nodes: [], loaded: false, docKey: null, dirty: false }),
  markSaved: () => set({ dirty: false }),

  rename: (id, title) =>
    set((s) => ({ nodes: renameNode(s.nodes, id, title), dirty: true })),
  remove: (id) => set((s) => ({ nodes: removeNode(s.nodes, id), dirty: true })),

  addBookmark: (afterId, input) => {
    const node = createNode(input);
    set((s) => ({ nodes: addNode(s.nodes, afterId, node), dirty: true }));
    return node.id;
  },
  addSubBookmark: (parentId, input) => {
    const node = createNode(input);
    set((s) => ({ nodes: addChild(s.nodes, parentId, node), dirty: true }));
    return node.id;
  },

  moveUp: (id) => set((s) => ({ nodes: moveUp(s.nodes, id), dirty: true })),
  moveDown: (id) => set((s) => ({ nodes: moveDown(s.nodes, id), dirty: true })),
  indent: (id) => set((s) => ({ nodes: indent(s.nodes, id), dirty: true })),
  outdent: (id) => set((s) => ({ nodes: outdent(s.nodes, id), dirty: true })),
}));

/** ページ列から現在ドキュメントの docKey（ソース ID の初出順連結）を作る。 */
export function docKeyFromSourceIds(sourceIds: string[]): string {
  return sourceIds.join("|");
}
