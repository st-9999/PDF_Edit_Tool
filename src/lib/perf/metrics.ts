export interface MeasureResult<T> {
  value: T;
  ms: number;
}

/** 処理の所要時間（ms）を計測して結果とともに返す（label は計測ログに使用）。 */
export async function measure<T>(
  label: string,
  fn: () => Promise<T> | T,
): Promise<MeasureResult<T>> {
  const start = performance.now();
  const value = await fn();
  const ms = performance.now() - start;
  if (typeof console !== "undefined") {
    console.debug(`[perf] ${label}: ${ms.toFixed(1)}ms`);
  }
  return { value, ms };
}

export interface MemoryInfo {
  usedMB: number;
  totalMB: number;
  limitMB: number;
}

interface ChromeMemory {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

/** Chromium の `performance.memory` を MB で返す。非対応ブラウザは null。 */
export function readMemory(): MemoryInfo | null {
  const memory = (performance as Performance & { memory?: ChromeMemory })
    .memory;
  if (!memory) return null;
  const toMB = (bytes: number) => Math.round((bytes / 1024 / 1024) * 10) / 10;
  return {
    usedMB: toMB(memory.usedJSHeapSize),
    totalMB: toMB(memory.totalJSHeapSize),
    limitMB: toMB(memory.jsHeapSizeLimit),
  };
}
