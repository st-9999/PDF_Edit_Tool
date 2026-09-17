import { describe, it, expect } from "vitest";
import { fontStyleOf, SERIF_FLAG } from "./font-style";

describe("fontStyleOf（同梱フォントの書体を選ぶための、元のフォントの書体の判定）", () => {
  it("名前に明朝・セリフ体を表す語があれば serif（Flags に Serif が無くても。実サンプルの MS-Mincho は Flags 32）", () => {
    for (const name of [
      "MS-Mincho",
      "MS-PMincho",
      "YuMincho-Regular",
      "HiraMinProN-W3",
      "NotoSerifJP-Regular",
      "SourceHanSerif-Regular",
      "TimesNewRomanPSMT",
      "Century",
      "ＭＳ 明朝",
      "SimSun",
      "MingLiU",
      "Batang",
    ]) {
      expect(fontStyleOf({ flags: 32, names: [name] }), name).toBe("serif");
    }
  });

  it("名前にゴシック・サンセリフ体を表す語があれば、Flags に Serif があっても sans", () => {
    for (const name of [
      "MS-Gothic",
      "ＭＳ ゴシック",
      "NotoSansJP-Regular",
      "Microsoft Sans Serif",
      "Meiryo",
      "HiraKakuProN-W3",
    ]) {
      expect(fontStyleOf({ flags: SERIF_FLAG, names: [name] }), name).toBe(
        "sans",
      );
    }
  });

  it("名前で決まらなければ Flags の Serif（bit 2）で判定する（実サンプルの CIDFont+F1 は Flags 6）", () => {
    expect(fontStyleOf({ flags: 6, names: ["CIDFont+F1"] })).toBe("serif");
    expect(fontStyleOf({ flags: 4, names: ["CIDFont+F1"] })).toBe("sans");
    expect(fontStyleOf({ flags: 32, names: [] })).toBe("sans");
  });

  it("複数の名前（ベースフォント名・埋め込みフォントのファミリー名）のうち、判定できる最初の名前を使う", () => {
    expect(fontStyleOf({ flags: 4, names: ["CIDFont+F1", "MS Mincho"] })).toBe(
      "serif",
    );
    expect(
      fontStyleOf({ flags: 6, names: [null, "MS Gothic", "MS Mincho"] }),
    ).toBe("sans");
  });

  it("手掛かりが無ければ sans（ゴシック体）", () => {
    expect(fontStyleOf({ flags: undefined, names: [null] })).toBe("sans");
  });
});
