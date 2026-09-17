import { describe, it, expect } from "vitest";
import { parseOperations, type Operand } from "./operations";

const enc = (s: string) => new TextEncoder().encode(s);

/** 演算子と、引数を読みやすい形にした配列を返す。 */
function summarize(src: string) {
  const plain = (o: Operand): unknown => {
    switch (o.kind) {
      case "number":
      case "name":
      case "boolean":
        return o.value;
      case "null":
        return null;
      case "string":
        return `${o.hex ? "hex" : "str"}:${Array.from(o.bytes).join(",")}`;
      case "array":
        return o.items.map(plain);
      case "dict":
        return Object.fromEntries(o.entries.map(([k, v]) => [k, plain(v)]));
    }
  };
  return parseOperations(enc(src)).map((op) => [
    op.operator,
    op.operands.map(plain),
  ]);
}

describe("parseOperations（引数と演算子の組み立て）", () => {
  it("演算子の前に並んだ値をその演算子の引数にする", () => {
    expect(
      summarize("BT /F1 9.84 Tf 1 0 0 1 244.85 442.78 Tm [<0F95>] TJ ET"),
    ).toEqual([
      ["BT", []],
      ["Tf", ["F1", 9.84]],
      ["Tm", [1, 0, 0, 1, 244.85, 442.78]],
      ["TJ", [["hex:15,149"]]],
      ["ET", []],
    ]);
  });

  it("TJ 配列の数値要素と文字列要素を順序どおりに保持する", () => {
    expect(summarize("[<3ECC>-0.6875(a)10] TJ")).toEqual([
      ["TJ", [["hex:62,204", -0.6875, "str:97", 10]]],
    ]);
  });

  it("辞書・入れ子配列・true/false/null を引数として扱う", () => {
    expect(summarize("/P <</MCID 3 /A [1 [2]] /B true /C null>> BDC")).toEqual([
      ["BDC", ["P", { MCID: 3, A: [1, [2]], B: true, C: null }]],
    ]);
  });

  it("インライン画像は BI 〜 EI を 1 命令（演算子 BI）にまとめる", () => {
    const ops = parseOperations(
      enc("q BI /W 1 /H 1 /BPC 8 /CS /G ID \u0001 EI Q"),
    );
    expect(ops.map((o) => o.operator)).toEqual(["q", "BI", "Q"]);
    const bi = ops[1]!;
    expect(bi.operands).toEqual([]);
  });

  it("各命令の start / end が引数の先頭から演算子の末尾までを指す", () => {
    const src = "q 0 g BT /F2 9.84 Tf [(1)] TJ ET Q";
    const ops = parseOperations(enc(src));
    const tf = ops.find((o) => o.operator === "Tf")!;
    expect(src.slice(tf.start, tf.end)).toBe("/F2 9.84 Tf");
    const tj = ops.find((o) => o.operator === "TJ")!;
    expect(src.slice(tj.start, tj.end)).toBe("[(1)] TJ");
    const arr = tj.operands[0]!;
    expect(arr.kind).toBe("array");
    if (arr.kind === "array") {
      const s = arr.items[0]!;
      expect(src.slice(s.start, s.end)).toBe("(1)");
    }
    // 引数を持たない演算子は演算子自身の範囲
    const g0 = ops.find((o) => o.operator === "q")!;
    expect(src.slice(g0.start, g0.end)).toBe("q");
  });

  it("各命令に出現順の index を振る", () => {
    const ops = parseOperations(enc("q Q BT ET"));
    expect(ops.map((o) => o.index)).toEqual([0, 1, 2, 3]);
  });

  it("閉じていない配列・余分な ] があっても例外にせず続きを解釈する", () => {
    expect(summarize("[1 2 TJ ] BT ET")).toEqual([
      ["TJ", [[1, 2]]],
      ["BT", []],
      ["ET", []],
    ]);
  });

  it("末尾に演算子の無い値は捨てる", () => {
    expect(summarize("BT 1 2")).toEqual([["BT", []]]);
  });
});
