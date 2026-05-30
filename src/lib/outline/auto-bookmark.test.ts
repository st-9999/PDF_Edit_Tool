import { describe, it, expect } from "vitest";
import {
  DEFAULT_PATTERNS,
  SequenceTracker,
  buildBookmarkTree,
  compilePatterns,
  detectHeadings,
  matchHeading,
  mergeStoredPatterns,
  normalizeDigits,
  normalizeTitle,
  reconstructLines,
  type HeadingMatch,
  type LineItem,
} from "./auto-bookmark";
import type { HeadingPattern } from "@/types/heading-pattern";

describe("normalizeDigits", () => {
  it("全角数字を半角へ変換する", () => {
    expect(normalizeDigits("第１２章")).toBe("第12章");
    expect(normalizeDigits("１.２.３")).toBe("1.2.3");
  });
  it("数字以外はそのまま", () => {
    expect(normalizeDigits("第1章 総則")).toBe("第1章 総則");
  });
});

describe("normalizeTitle", () => {
  it("番号内・第N章のスペースを除去する", () => {
    expect(normalizeTitle("第 1 章 総則")).toBe("第1章 総則");
    expect(normalizeTitle("1. 1. 1 一般事項")).toBe("1.1.1 一般事項");
    expect(normalizeTitle("1. 1 適用範囲")).toBe("1.1 適用範囲");
  });
  it("CJK 文字間の単一スペースを除去する", () => {
    expect(normalizeTitle("第1章 総 則")).toBe("第1章 総則");
  });
  it("番号とタイトルの境界スペースを復元する", () => {
    expect(normalizeTitle("第1章総則")).toBe("第1章 総則");
    expect(normalizeTitle("1.1適用範囲")).toBe("1.1 適用範囲");
  });
  it("全角数字を半角へ正規化する", () => {
    expect(normalizeTitle("第１章 総則")).toBe("第1章 総則");
  });
});

describe("compilePatterns", () => {
  it("有効パターンのみを level 降順（項→節→章）で返す", () => {
    const compiled = compilePatterns(DEFAULT_PATTERNS);
    expect(compiled.map((c) => c.level)).toEqual([3, 2, 1]);
  });
  it("無効パターンを除外する", () => {
    const patterns = DEFAULT_PATTERNS.map((p) =>
      p.id === "builtin-section" ? { ...p, enabled: false } : p,
    );
    expect(compilePatterns(patterns).map((c) => c.level)).toEqual([3, 1]);
  });
  it("不正な正規表現はスキップする", () => {
    const bad: HeadingPattern = {
      id: "x",
      label: "bad",
      level: 1,
      enabled: true,
      builtin: false,
      pattern: "(unclosed",
    };
    expect(compilePatterns([bad])).toEqual([]);
  });
});

describe("matchHeading", () => {
  const compiled = compilePatterns(DEFAULT_PATTERNS);

  it("章・節・項をそれぞれ正しいレベルで検出する", () => {
    expect(matchHeading("第1章 総則", compiled)).toEqual({
      title: "第1章 総則",
      level: 1,
    });
    expect(matchHeading("1.1 適用範囲", compiled)).toEqual({
      title: "1.1 適用範囲",
      level: 2,
    });
    expect(matchHeading("1.1.1 一般事項", compiled)).toEqual({
      title: "1.1.1 一般事項",
      level: 3,
    });
  });

  it("項（N.N.N）を節（N.N）として誤検出しない", () => {
    expect(matchHeading("1.1.1 一般事項", compiled)?.level).toBe(3);
  });

  it("全角数字の章を検出する", () => {
    expect(matchHeading("第１章 総則", compiled)).toEqual({
      title: "第1章 総則",
      level: 1,
    });
  });

  it("タイトル無しの章（第1章）も検出する", () => {
    expect(matchHeading("第1章", compiled)).toEqual({
      title: "第1章",
      level: 1,
    });
  });

  it("数字のみの行（表データ）は節/項として検出しない", () => {
    expect(matchHeading("1.1 2.3 4.5", compiled)).toBeNull();
    expect(matchHeading("12.5", compiled)).toBeNull();
  });

  it("目次のリーダー線を含む行は除外する", () => {
    expect(matchHeading("第1章 総則 ..... 3", compiled)).toBeNull();
    expect(matchHeading("1.1 適用範囲 ------ 5", compiled)).toBeNull();
  });

  it("見出しでない本文行は null", () => {
    expect(matchHeading("これは本文です。", compiled)).toBeNull();
    expect(matchHeading("", compiled)).toBeNull();
  });
});

describe("SequenceTracker", () => {
  it("番号が後退するマッチを除外する", () => {
    const t = new SequenceTracker();
    expect(t.accept(2, "1.1 a")).toBe(true);
    expect(t.accept(2, "1.2 b")).toBe(true);
    expect(t.accept(2, "1.1 c")).toBe(false); // 後退
  });

  it("前方ジャンプは許可する", () => {
    const t = new SequenceTracker();
    expect(t.accept(1, "第1章 a")).toBe(true);
    expect(t.accept(1, "第3章 c")).toBe(true); // 第2章欠落でも許可
  });

  it("上位レベルが出現したら下位レベルの追跡をリセットする", () => {
    const t = new SequenceTracker();
    expect(t.accept(1, "第1章 a")).toBe(true);
    expect(t.accept(2, "1.2 b")).toBe(true);
    expect(t.accept(1, "第2章 c")).toBe(true); // 新章
    expect(t.accept(2, "2.1 d")).toBe(true); // 節番号が戻っても採用
  });

  it("番号を持たないカスタム見出しは常に採用する", () => {
    const t = new SequenceTracker();
    expect(t.accept(1, "附則")).toBe(true);
    expect(t.accept(1, "附則")).toBe(true);
  });
});

describe("reconstructLines", () => {
  it("同一 y の TextItem を x 昇順で結合して 1 行にする", () => {
    const items: LineItem[] = [
      { str: "総則", x: 50, y: 700, fontSize: 12 },
      { str: "第1章", x: 10, y: 700, fontSize: 12 },
    ];
    expect(reconstructLines(items)).toEqual(["第1章総則"]);
  });

  it("y が離れた TextItem を別行に分ける（y 降順）", () => {
    const items: LineItem[] = [
      { str: "二行目", x: 10, y: 680, fontSize: 12 },
      { str: "一行目", x: 10, y: 700, fontSize: 12 },
    ];
    expect(reconstructLines(items)).toEqual(["一行目", "二行目"]);
  });

  it("大きいフォントの見出しでも微小な y 差を 1 行にまとめる（動的許容差）", () => {
    // フォント 40px → 許容差 = max(2, 40*0.3)=12px。8px の差は同一行。
    const items: LineItem[] = [
      { str: "章", x: 60, y: 692, fontSize: 40 },
      { str: "第1", x: 10, y: 700, fontSize: 40 },
    ];
    expect(reconstructLines(items)).toEqual(["第1章"]);
  });

  it("空配列は空配列", () => {
    expect(reconstructLines([])).toEqual([]);
  });
});

describe("detectHeadings", () => {
  it("複数ページの行から章/節/項を検出し表示ページ番号を付与する", () => {
    const pageLines = [
      ["第1章 総則", "本文テキスト"],
      ["1.1 適用範囲", "1.1.1 一般事項"],
      ["第2章 設計"],
    ];
    const result = detectHeadings(pageLines, DEFAULT_PATTERNS);
    expect(result).toEqual<HeadingMatch[]>([
      { title: "第1章 総則", level: 1, pageNumber: 1 },
      { title: "1.1 適用範囲", level: 2, pageNumber: 2 },
      { title: "1.1.1 一般事項", level: 3, pageNumber: 2 },
      { title: "第2章 設計", level: 1, pageNumber: 3 },
    ]);
  });

  it("本文中の番号後退（偽マッチ）は番号フィルタで除外される", () => {
    const pageLines = [["1.1 適用範囲", "1.2 用語", "1.1 ここは本文の参照"]];
    const result = detectHeadings(pageLines, DEFAULT_PATTERNS);
    expect(result.map((r) => r.title)).toEqual(["1.1 適用範囲", "1.2 用語"]);
  });
});

describe("buildBookmarkTree", () => {
  const pages = [
    { sourceId: "A", sourceIndex: 0 },
    { sourceId: "A", sourceIndex: 1 },
    { sourceId: "B", sourceIndex: 0 },
  ];

  it("章 > 節 > 項の階層を構築し、宛先をページから解決する", () => {
    const headings: HeadingMatch[] = [
      { title: "第1章 総則", level: 1, pageNumber: 1 },
      { title: "1.1 適用範囲", level: 2, pageNumber: 2 },
      { title: "1.1.1 一般事項", level: 3, pageNumber: 2 },
      { title: "第2章 設計", level: 1, pageNumber: 3 },
    ];
    const tree = buildBookmarkTree(headings, pages);

    expect(tree.map((n) => n.title)).toEqual(["第1章 総則", "第2章 設計"]);
    expect(tree[0]!.sourceId).toBe("A");
    expect(tree[0]!.sourceIndex).toBe(0);
    expect(tree[0]!.children.map((c) => c.title)).toEqual(["1.1 適用範囲"]);
    expect(tree[0]!.children[0]!.children.map((c) => c.title)).toEqual([
      "1.1.1 一般事項",
    ]);
    // 第2章は別ソース B のページ
    expect(tree[1]!.sourceId).toBe("B");
    expect(tree[1]!.sourceIndex).toBe(0);
  });

  it("親レベルが欠落していても破綻せず出現順を保つ", () => {
    const headings: HeadingMatch[] = [
      { title: "1.1 いきなり節", level: 2, pageNumber: 1 },
      { title: "1.1.1 さらに項", level: 3, pageNumber: 1 },
    ];
    const tree = buildBookmarkTree(headings, pages);
    expect(tree.map((n) => n.title)).toEqual(["1.1 いきなり節"]);
    expect(tree[0]!.children.map((c) => c.title)).toEqual(["1.1.1 さらに項"]);
  });

  it("宛先ページが存在しない見出しはスキップする", () => {
    const headings: HeadingMatch[] = [
      { title: "範囲外", level: 1, pageNumber: 99 },
    ];
    expect(buildBookmarkTree(headings, pages)).toEqual([]);
  });
});

describe("mergeStoredPatterns", () => {
  it("保存が無ければ既定パターンを返す", () => {
    expect(mergeStoredPatterns(null).map((p) => p.id)).toEqual(
      DEFAULT_PATTERNS.map((p) => p.id),
    );
  });

  it("組み込みの enabled を保存値で上書きする", () => {
    const stored = [{ ...DEFAULT_PATTERNS[1]!, enabled: false }];
    const merged = mergeStoredPatterns(stored);
    expect(merged.find((p) => p.id === "builtin-section")!.enabled).toBe(false);
    expect(merged.find((p) => p.id === "builtin-chapter")!.enabled).toBe(true);
  });

  it("カスタムパターンを末尾に追加する", () => {
    const custom: HeadingPattern = {
      id: "custom-1",
      label: "附則",
      level: 1,
      enabled: true,
      builtin: false,
      pattern: "^\\s*(?<title>附則.*)$",
    };
    const merged = mergeStoredPatterns([custom]);
    expect(merged).toHaveLength(DEFAULT_PATTERNS.length + 1);
    expect(merged[merged.length - 1]!.id).toBe("custom-1");
    expect(merged[merged.length - 1]!.builtin).toBe(false);
  });

  it("不正な保存値は既定パターンへフォールバック", () => {
    expect(mergeStoredPatterns("garbage").map((p) => p.id)).toEqual(
      DEFAULT_PATTERNS.map((p) => p.id),
    );
  });
});
