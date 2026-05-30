"use client";

import {
  buildPdf,
  type BuildOutlineNode,
  type SourceBytes,
} from "@/lib/editor/build";
import type { PageRef } from "@/lib/editor/operations";

interface RunOptions {
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
  /** 元ドキュメントのしおり。出力へ再マッピングして書き戻す。 */
  outline?: BuildOutlineNode[];
}

interface WorkerDone {
  type: "done";
  bytes: ArrayBuffer;
}
interface WorkerProgress {
  type: "progress";
  done: number;
  total: number;
}
interface WorkerError {
  type: "error";
  message: string;
}
type WorkerMessage = WorkerDone | WorkerProgress | WorkerError;

function runInWorker(
  sources: SourceBytes,
  pages: PageRef[],
  { onProgress, signal, outline }: RunOptions,
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(
        new URL("../../workers/pdf-build.worker.ts", import.meta.url),
        { type: "module" },
      );
    } catch (err) {
      reject(err instanceof Error ? err : new Error("worker 生成に失敗"));
      return;
    }

    const cleanup = () => {
      worker.terminate();
      signal?.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      cleanup();
      reject(new DOMException("キャンセルされました", "AbortError"));
    };
    if (signal?.aborted) {
      cleanup();
      reject(new DOMException("キャンセルされました", "AbortError"));
      return;
    }
    signal?.addEventListener("abort", onAbort);

    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const message = event.data;
      if (message.type === "progress") {
        onProgress?.(message.done, message.total);
      } else if (message.type === "done") {
        cleanup();
        resolve(new Uint8Array(message.bytes));
      } else {
        cleanup();
        reject(new Error(message.message));
      }
    };
    worker.onerror = () => {
      cleanup();
      reject(new Error("worker error"));
    };

    worker.postMessage({ sources, pages, outline });
  });
}

/**
 * PDF ビルドを Web Worker で実行し、UI スレッドのブロックを避ける。
 * Worker 非対応や生成失敗時は本スレッドの buildPdf にフォールバックする
 * （いずれの経路でも onProgress / signal による進捗・キャンセルは機能する）。
 */
export async function runBuild(
  sources: SourceBytes,
  pages: PageRef[],
  options: RunOptions = {},
): Promise<Uint8Array> {
  if (typeof Worker !== "undefined") {
    try {
      return await runInWorker(sources, pages, options);
    } catch (err) {
      // ユーザーキャンセルはそのまま伝播。それ以外は本スレッドで再試行。
      if (err instanceof DOMException && err.name === "AbortError") throw err;
    }
  }
  return buildPdf(sources, pages, {
    onProgress: options.onProgress,
    signal: options.signal,
    outline: options.outline,
  });
}
