import { describe, it, expect } from "vitest";
import { parseToUnicodeCMap, writeToUnicodeCMap } from "./cmap";

const enc = (s: string) => new TextEncoder().encode(s);

/** Excel / Print to PDF が出力する ToUnicode に近い形の CMap。 */
const IDENTITY_STYLE = `/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def
/CMapName /Adobe-Identity-UCS def
/CMapType 2 def
1 begincodespacerange
<0000> <FFFF>
endcodespacerange
3 beginbfchar
<0F95> <53F7>
<3ECC> <002A>
<46B7> <002E>
endbfchar
2 beginbfrange
<3ED4> <3EDD> <0030>
<1000> <1002> [<0041> <0042> <D842DFB7>]
endbfrange
endcmap
CMapName currentdict /CMap defineresource pop
end
end`;

describe("parseToUnicodeCMap", () => {
  it("bfchar の対応を読む", () => {
    const cmap = parseToUnicodeCMap(enc(IDENTITY_STYLE));
    expect(cmap.lookup(0x0f95)).toBe("号");
    expect(cmap.lookup(0x3ecc)).toBe("*");
    expect(cmap.lookup(0x46b7)).toBe(".");
  });

  it("bfrange（16 進の開始値）を範囲内で 1 ずつ増やして対応させる", () => {
    const cmap = parseToUnicodeCMap(enc(IDENTITY_STYLE));
    expect(cmap.lookup(0x3ed4)).toBe("0");
    expect(cmap.lookup(0x3ed9)).toBe("5");
    expect(cmap.lookup(0x3edd)).toBe("9");
    expect(cmap.lookup(0x3ede)).toBeNull();
  });

  it("bfrange（配列）とサロゲートペアを扱う", () => {
    const cmap = parseToUnicodeCMap(enc(IDENTITY_STYLE));
    expect(cmap.lookup(0x1000)).toBe("A");
    expect(cmap.lookup(0x1001)).toBe("B");
    expect(cmap.lookup(0x1002)).toBe("𠮷");
  });

  it("複数文字（合字など）への対応を保持する", () => {
    const src = `1 begincodespacerange <00> <FF> endcodespacerange
1 beginbfchar <01> <00660069> endbfchar`;
    expect(parseToUnicodeCMap(enc(src)).lookup(0x01)).toBe("fi");
  });

  it("コード空間の範囲からコードのバイト長を返す", () => {
    expect(parseToUnicodeCMap(enc(IDENTITY_STYLE)).codeLengths).toEqual([2]);
    const oneByte = `1 begincodespacerange <00> <FF> endcodespacerange`;
    expect(parseToUnicodeCMap(enc(oneByte)).codeLengths).toEqual([1]);
    const mixed = `2 begincodespacerange <00> <80> <8140> <9FFC> endcodespacerange`;
    expect(parseToUnicodeCMap(enc(mixed)).codeLengths).toEqual([1, 2]);
  });

  it("同じ文字に対応する複数のコードのうち、最初に定義されたコードを逆引きで返す", () => {
    const src = `1 beginbfchar <0010> <0031> endbfchar
1 beginbfchar <0020> <0031> endbfchar`;
    const cmap = parseToUnicodeCMap(enc(src));
    expect(cmap.codesFor("1")).toEqual([0x10, 0x20]);
    expect(cmap.codesFor("2")).toEqual([]);
  });

  it("壊れた入力や空入力では空の対応表になる", () => {
    const empty = parseToUnicodeCMap(enc(""));
    expect(empty.lookup(0x41)).toBeNull();
    expect(empty.codeLengths).toEqual([]);
    const broken = parseToUnicodeCMap(enc("2 beginbfchar <0041> endbfchar"));
    expect(broken.lookup(0x41)).toBeNull();
  });
});

describe("writeToUnicodeCMap", () => {
  const SURROGATE_PAIR = String.fromCodePoint(0x20bb7);

  it("書き出した CMap を解析すると同じ対応になる（サロゲートペア・複数文字を含む）", () => {
    const entries: [number, string][] = [
      [0x0001, "鷗"],
      [0x3ed4, "0"],
      [0x0f95, SURROGATE_PAIR],
      [0x0020, "fi"],
    ];
    const cmap = parseToUnicodeCMap(writeToUnicodeCMap(entries, 2));
    expect([...cmap.entries()].sort((a, b) => a[0] - b[0])).toEqual(
      [...entries].sort((a, b) => a[0] - b[0]),
    );
    expect(cmap.codeLengths).toEqual([2]);
  });

  it("1 バイトコードのコード空間で書き出す", () => {
    const cmap = parseToUnicodeCMap(writeToUnicodeCMap([[0x41, "A"]], 1));
    expect(cmap.codeLengths).toEqual([1]);
    expect(cmap.lookup(0x41)).toBe("A");
  });

  it("100 件を超える対応は複数の beginbfchar に分けて書き出す（仕様上の上限）", () => {
    const entries: [number, string][] = Array.from({ length: 250 }, (_, i) => [
      i + 1,
      String.fromCharCode(0x4e00 + i),
    ]);
    const bytes = writeToUnicodeCMap(entries, 2);
    const text = new TextDecoder().decode(bytes);
    expect(text.match(/beginbfchar/g)).toHaveLength(3);
    expect(text).toContain("100 beginbfchar");
    expect(text).toContain("50 beginbfchar");
    expect([...parseToUnicodeCMap(bytes).entries()]).toHaveLength(250);
  });
});
