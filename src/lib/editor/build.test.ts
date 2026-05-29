// @vitest-environment node
import { describe, it, expect } from "vitest";
import { PDFDocument, degrees } from "pdf-lib";
import { buildPdf, extractPages, splitPdf, type SourceBytes } from "./build";
import type { PageRef } from "./operations";

/** 各ページ幅を一意にして「元のどのページか」を出力側から識別できるソースを作る。 */
async function makeSource(
  widths: number[],
  rotations: number[] = [],
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  widths.forEach((w, i) => {
    const page = doc.addPage([w, 400]);
    if (rotations[i]) page.setRotation(degrees(rotations[i]!));
  });
  return doc.save();
}

const mk = (
  sourceId: string,
  sourceIndex: number,
  rotation = 0,
  id = `${sourceId}-${sourceIndex}`,
): PageRef => ({ id, sourceId, sourceIndex, rotation });

async function inspect(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  return {
    count: doc.getPageCount(),
    widths: doc.getPages().map((p) => Math.round(p.getSize().width)),
    rotations: doc.getPages().map((p) => p.getRotation().angle),
  };
}

describe("buildPdf", () => {
  it("PageRef の並び順どおりにページを構築する", async () => {
    const sources: SourceBytes = { A: await makeSource([210, 220, 230]) };
    const out = await buildPdf(sources, [mk("A", 2), mk("A", 0), mk("A", 1)]);
    const { count, widths } = await inspect(out);
    expect(count).toBe(3);
    expect(widths).toEqual([230, 210, 220]);
  });

  it("ユーザー回転を元の回転に加算してページ辞書へ反映する", async () => {
    // 元ページ[1] は既に 90 度回転。ユーザー +90 で 180 になる。
    const sources: SourceBytes = {
      A: await makeSource([210, 220], [0, 90]),
    };
    const out = await buildPdf(sources, [mk("A", 0, 90), mk("A", 1, 90)]);
    const { rotations } = await inspect(out);
    expect(rotations).toEqual([90, 180]);
  });

  it("削除（部分集合のビルド）で総ページ数が減る", async () => {
    const sources: SourceBytes = { A: await makeSource([210, 220, 230]) };
    const out = await buildPdf(sources, [mk("A", 0), mk("A", 2)]);
    const { count, widths } = await inspect(out);
    expect(count).toBe(2);
    expect(widths).toEqual([210, 230]);
  });

  it("空ページ列はエラー", async () => {
    await expect(buildPdf({}, [])).rejects.toThrow();
  });
});

describe("extractPages", () => {
  it("選択 ID のページのみを現在順で抽出する", async () => {
    const sources: SourceBytes = { A: await makeSource([210, 220, 230, 240]) };
    const pages = [mk("A", 0), mk("A", 1), mk("A", 2), mk("A", 3)];
    const out = await extractPages(sources, pages, ["A-1", "A-3"]);
    const { count, widths } = await inspect(out);
    expect(count).toBe(2);
    expect(widths).toEqual([220, 240]);
  });
});

describe("splitPdf", () => {
  it("境界の前で分割し、各セグメントを生成する", async () => {
    const sources: SourceBytes = {
      A: await makeSource([210, 220, 230, 240, 250]),
    };
    const pages = [0, 1, 2, 3, 4].map((i) => mk("A", i));
    const parts = await splitPdf(sources, pages, [3]); // 1-2 と 3-5
    expect(parts).toHaveLength(2);
    expect((await inspect(parts[0]!)).widths).toEqual([210, 220]);
    expect((await inspect(parts[1]!)).widths).toEqual([230, 240, 250]);
  });

  it("複数境界・範囲外は無視して分割", async () => {
    const sources: SourceBytes = {
      A: await makeSource([210, 220, 230, 240, 250]),
    };
    const pages = [0, 1, 2, 3, 4].map((i) => mk("A", i));
    const parts = await splitPdf(sources, pages, [2, 4, 99, 1]);
    expect(parts.map((p) => p)).toHaveLength(3); // 1 / 2-3 / 4-5
    expect((await inspect(parts[0]!)).widths).toEqual([210]);
    expect((await inspect(parts[1]!)).widths).toEqual([220, 230]);
    expect((await inspect(parts[2]!)).widths).toEqual([240, 250]);
  });
});

describe("buildPdf: 複数ソース結合", () => {
  it("2 つのソースを交互に結合して総ページ数・順序が正しい", async () => {
    const sources: SourceBytes = {
      A: await makeSource([210, 220]),
      B: await makeSource([310, 320]),
    };
    const out = await buildPdf(sources, [
      mk("A", 0),
      mk("B", 0),
      mk("A", 1),
      mk("B", 1),
    ]);
    const { count, widths } = await inspect(out);
    expect(count).toBe(4);
    expect(widths).toEqual([210, 310, 220, 320]);
  });
});
