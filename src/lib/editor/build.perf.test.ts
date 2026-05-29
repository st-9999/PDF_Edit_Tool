// @vitest-environment node
import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { buildPdf } from "./build";
import type { PageRef } from "./operations";

async function makeSource(pageCount: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i += 1) doc.addPage([200, 300]);
  return doc.save();
}

const pagesOf = (count: number): PageRef[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    sourceId: "S",
    sourceIndex: i,
    rotation: 0,
  }));

describe("buildPdf 簡易ベンチ（中規模）", () => {
  it("200 ページのビルドが完了し、進捗が逐次通知される", async () => {
    const source = await makeSource(200);
    let lastDone = 0;
    const start = performance.now();
    const bytes = await buildPdf({ S: source }, pagesOf(200), {
      onProgress: (done) => {
        lastDone = done;
      },
    });
    const ms = performance.now() - start;
    // 計測値を記録（簡易ベンチ）
    console.info(`[bench] buildPdf 200p: ${ms.toFixed(0)}ms`);

    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBe(200);
    expect(lastDone).toBe(200);
    expect(ms).toBeLessThan(30000); // 退行検知の緩い上限
  }, 60000);

  it("中断シグナルが立っていれば AbortError で停止する", async () => {
    const source = await makeSource(5);
    const controller = new AbortController();
    controller.abort();
    await expect(
      buildPdf({ S: source }, pagesOf(5), { signal: controller.signal }),
    ).rejects.toThrow();
  });
});
