import { describe, it, expect, beforeEach } from "vitest";
import { useOutlineStore, docKeyFromSourceIds } from "./outline-store";
import { createNode } from "@/lib/outline/edit";

const reset = () => useOutlineStore.getState().reset();

describe("outline-store", () => {
  beforeEach(reset);

  it("load は baseline を入れ dirty を立てない", () => {
    const base = [createNode({ title: "A", sourceId: "S", sourceIndex: 0 })];
    useOutlineStore.getState().load(base, "S");
    const s = useOutlineStore.getState();
    expect(s.loaded).toBe(true);
    expect(s.docKey).toBe("S");
    expect(s.dirty).toBe(false);
    expect(s.nodes).toHaveLength(1);
  });

  it("編集（追加・リネーム・削除）は dirty を立てる", () => {
    const { load } = useOutlineStore.getState();
    load([], "S");
    const id = useOutlineStore
      .getState()
      .addBookmark(null, { title: "新規", sourceId: "S", sourceIndex: 2 });
    expect(useOutlineStore.getState().dirty).toBe(true);
    expect(useOutlineStore.getState().nodes[0]!.title).toBe("新規");

    useOutlineStore.getState().rename(id, "改名");
    expect(useOutlineStore.getState().nodes[0]!.title).toBe("改名");

    useOutlineStore.getState().remove(id);
    expect(useOutlineStore.getState().nodes).toHaveLength(0);
  });

  it("addSubBookmark は親の子へ追加する", () => {
    const parent = createNode({ title: "P", sourceId: "S", sourceIndex: 0 });
    useOutlineStore.getState().load([parent], "S");
    useOutlineStore.getState().addSubBookmark(parent.id, {
      title: "子",
      sourceId: "S",
      sourceIndex: 1,
    });
    expect(useOutlineStore.getState().nodes[0]!.children[0]!.title).toBe("子");
  });

  it("markSaved は dirty をクリア（ツリーは保持）", () => {
    useOutlineStore.getState().load([], "S");
    useOutlineStore
      .getState()
      .addBookmark(null, { title: "X", sourceId: "S", sourceIndex: 0 });
    expect(useOutlineStore.getState().dirty).toBe(true);
    useOutlineStore.getState().markSaved();
    expect(useOutlineStore.getState().dirty).toBe(false);
    expect(useOutlineStore.getState().nodes).toHaveLength(1);
  });

  it("reset は初期化する", () => {
    useOutlineStore
      .getState()
      .load([createNode({ title: "A", sourceId: "S", sourceIndex: 0 })], "S");
    useOutlineStore.getState().reset();
    const s = useOutlineStore.getState();
    expect(s.loaded).toBe(false);
    expect(s.docKey).toBeNull();
    expect(s.nodes).toEqual([]);
  });

  it("docKeyFromSourceIds は順序付きで連結する", () => {
    expect(docKeyFromSourceIds(["a", "b"])).toBe("a|b");
    expect(docKeyFromSourceIds(["b", "a"])).toBe("b|a");
  });
});
