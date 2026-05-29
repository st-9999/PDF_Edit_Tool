import { describe, it, expect, vi } from "vitest";
import { measure, readMemory } from "./metrics";
import { checkLimits, RECOMMENDED_MAX_PAGES } from "./limits";

describe("measure", () => {
  it("関数の戻り値と所要時間を返す", async () => {
    vi.spyOn(console, "debug").mockImplementation(() => {});
    const result = await measure("test", () => 42);
    expect(result.value).toBe(42);
    expect(result.ms).toBeGreaterThanOrEqual(0);
  });

  it("非同期関数も計測できる", async () => {
    vi.spyOn(console, "debug").mockImplementation(() => {});
    const result = await measure("async", async () => {
      await Promise.resolve();
      return "done";
    });
    expect(result.value).toBe("done");
  });
});

describe("readMemory", () => {
  it("performance.memory 非対応環境では null", () => {
    // jsdom には performance.memory が無い
    expect(readMemory()).toBeNull();
  });
});

describe("checkLimits", () => {
  it("ページ数超過を検知", () => {
    const r = checkLimits(RECOMMENDED_MAX_PAGES + 1, 1000);
    expect(r.exceedsPages).toBe(true);
    expect(r.exceeded).toBe(true);
  });

  it("バイト超過を検知", () => {
    const r = checkLimits(10, 60 * 1024 * 1024);
    expect(r.exceedsBytes).toBe(true);
    expect(r.exceeded).toBe(true);
  });

  it("上限内なら exceeded=false", () => {
    const r = checkLimits(100, 10 * 1024 * 1024);
    expect(r.exceeded).toBe(false);
  });
});
