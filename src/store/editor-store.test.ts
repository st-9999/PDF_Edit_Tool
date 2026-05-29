import { describe, it, expect, beforeEach } from "vitest";
import { useEditorStore, editorSelectors } from "./editor-store";

const get = () => useEditorStore.getState();
const ids = () => get().pages.map((p) => p.id);

beforeEach(() => {
  get().reset();
});

describe("editor-store: 初期化", () => {
  it("initDocument でページ生成・未編集状態", () => {
    get().initDocument(4, "doc");
    expect(get().pages).toHaveLength(4);
    expect(get().sourceId).toBe("doc");
    expect(editorSelectors.isDirty(get())).toBe(false);
    expect(editorSelectors.canUndo(get())).toBe(false);
  });
});

describe("editor-store: 選択 + 回転 + Undo/Redo", () => {
  beforeEach(() => get().initDocument(3, "doc"));

  it("選択ページを回転し、Undo/Redo できる", () => {
    const [, second] = ids();
    get().selectClick(second!);
    get().rotateSelected(90);

    expect(get().pages[1]!.rotation).toBe(90);
    expect(editorSelectors.isDirty(get())).toBe(true);

    get().undo();
    expect(get().pages[1]!.rotation).toBe(0);
    expect(editorSelectors.isDirty(get())).toBe(false);

    get().redo();
    expect(get().pages[1]!.rotation).toBe(90);
  });

  it("選択が無ければ回転は no-op", () => {
    get().rotateSelected(90);
    expect(editorSelectors.isDirty(get())).toBe(false);
  });
});

describe("editor-store: 保存フラグ", () => {
  beforeEach(() => get().initDocument(3, "doc"));

  it("markSaved で未保存が解消し、追加編集で再び未保存になる", () => {
    const [a] = ids();
    get().selectClick(a!);
    get().rotateSelected(90);
    expect(editorSelectors.isDirty(get())).toBe(true);

    get().markSaved();
    expect(editorSelectors.isDirty(get())).toBe(false);

    get().selectClick(a!);
    get().rotateSelected(90);
    expect(editorSelectors.isDirty(get())).toBe(true);
  });
});

describe("editor-store: 範囲選択 + 削除", () => {
  beforeEach(() => get().initDocument(5, "doc"));

  it("Shift 範囲選択して削除、Undo で復元", () => {
    const [a, b, c] = ids();
    get().selectClick(a!);
    get().selectRangeTo(c!); // a..c = 3 ページ
    expect(editorSelectors.selectedCount(get())).toBe(3);

    get().deleteSelected();
    expect(get().pages).toHaveLength(2);
    expect(editorSelectors.selectedCount(get())).toBe(0); // 削除で選択クリア
    expect(ids()).not.toContain(b);

    get().undo();
    expect(get().pages).toHaveLength(5);
  });
});

describe("editor-store: reorder", () => {
  beforeEach(() => get().initDocument(3, "doc"));

  it("先頭ページを末尾へ移動", () => {
    const before = ids();
    get().reorder([before[0]!], 99);
    expect(ids()).toEqual([before[1], before[2], before[0]]);
  });
});

describe("editor-store: Ctrl トグル選択", () => {
  beforeEach(() => get().initDocument(3, "doc"));

  it("個別トグルで選択集合を増減", () => {
    const [a, b] = ids();
    get().selectClick(a!);
    get().selectToggle(b!);
    expect(editorSelectors.selectedCount(get())).toBe(2);
    get().selectToggle(a!);
    expect(editorSelectors.selectedCount(get())).toBe(1);
  });

  it("selectAll で全選択、clear で解除", () => {
    get().selectAll();
    expect(editorSelectors.selectedCount(get())).toBe(3);
    get().clear();
    expect(editorSelectors.selectedCount(get())).toBe(0);
  });
});
