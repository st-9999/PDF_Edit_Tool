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
});
