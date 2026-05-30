import { describe, it, expect } from "vitest";
import { applyHighlights } from "./highlight";

function makeLayer(spanTexts: string[]): HTMLElement {
  const container = document.createElement("div");
  for (const t of spanTexts) {
    const span = document.createElement("span");
    span.textContent = t;
    container.appendChild(span);
  }
  return container;
}

describe("applyHighlights", () => {
  it("出現箇所を mark で囲み、現在位置に data-current を付ける", () => {
    const layer = makeLayer(["Hello hello", "world"]);
    applyHighlights(layer, "hello", 1);
    const marks = layer.querySelectorAll("mark.search-hit");
    expect(marks).toHaveLength(2);
    expect(marks[0]!.hasAttribute("data-current")).toBe(false);
    expect(marks[1]!.getAttribute("data-current")).toBe("true");
    expect(marks[1]!.textContent).toBe("hello");
  });

  it("大文字小文字を無視し、元テキストは保持する", () => {
    const layer = makeLayer(["FOO bar foo"]);
    applyHighlights(layer, "foo", null);
    expect(layer.querySelectorAll("mark.search-hit")).toHaveLength(2);
    expect(layer.textContent).toBe("FOO bar foo");
  });

  it("空クエリや再適用で前のマークを解除する（冪等）", () => {
    const layer = makeLayer(["abc abc"]);
    applyHighlights(layer, "abc", null);
    expect(layer.querySelectorAll("mark").length).toBe(2);
    applyHighlights(layer, "", null);
    expect(layer.querySelectorAll("mark").length).toBe(0);
    expect(layer.textContent).toBe("abc abc");
  });

  it("regex オプションで可変長一致を強調する", () => {
    const layer = makeLayer(["order 12 and 345"]);
    applyHighlights(layer, "\\d+", null, { regex: true });
    const marks = layer.querySelectorAll("mark.search-hit");
    expect([...marks].map((m) => m.textContent)).toEqual(["12", "345"]);
    expect(layer.textContent).toBe("order 12 and 345"); // 元テキスト保持
  });

  it("caseSensitive オプションで大小を区別する", () => {
    const layer = makeLayer(["Cat cat"]);
    applyHighlights(layer, "cat", null, { caseSensitive: true });
    const marks = layer.querySelectorAll("mark.search-hit");
    expect(marks).toHaveLength(1);
    expect(marks[0]!.textContent).toBe("cat");
  });

  it("不正な正規表現はマークを付けない", () => {
    const layer = makeLayer(["abc"]);
    applyHighlights(layer, "(", null, { regex: true });
    expect(layer.querySelectorAll("mark").length).toBe(0);
    expect(layer.textContent).toBe("abc");
  });

  it("data-current は span をまたいだ通し番号で付く", () => {
    const layer = makeLayer(["foo foo", "foo"]);
    applyHighlights(layer, "foo", 2); // 3 件目（2 番目の span）
    const marks = layer.querySelectorAll("mark.search-hit");
    expect(marks).toHaveLength(3);
    expect(marks[2]!.getAttribute("data-current")).toBe("true");
  });
});
