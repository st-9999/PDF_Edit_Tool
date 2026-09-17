import { describe, it, expect, beforeEach } from "vitest";
import { useTextEditStore } from "./text-edit-store";

const get = () => useTextEditStore.getState();

beforeEach(() => get().reset());

describe("text-edit-store（文字の書き換えモードと選択）", () => {
  it("既定はモード OFF・選択なし", () => {
    expect(get().active).toBe(false);
    expect(get().selection).toBeNull();
  });

  it("選択はモード ON のときだけでき、1 つだけ保持する（別のページを選ぶと置き換わる）", () => {
    get().select({ pageId: "p1", start: 0, end: 2 });
    expect(get().selection).toBeNull();

    get().setActive(true);
    get().select({ pageId: "p1", start: 0, end: 2 });
    get().select({ pageId: "p2", start: 3, end: 5 });
    expect(get().selection).toEqual({ pageId: "p2", start: 3, end: 5 });
  });

  it("空の範囲は選択しない", () => {
    get().setActive(true);
    get().select({ pageId: "p1", start: 2, end: 2 });
    expect(get().selection).toBeNull();
  });

  it("モードを OFF にすると選択を解除する", () => {
    get().setActive(true);
    get().select({ pageId: "p1", start: 0, end: 1 });
    get().setActive(false);
    expect(get().selection).toBeNull();
  });

  it("clearSelection で選択だけを解除し、モードは維持する", () => {
    get().setActive(true);
    get().select({ pageId: "p1", start: 0, end: 1 });
    get().clearSelection();
    expect(get().selection).toBeNull();
    expect(get().active).toBe(true);
  });
});
