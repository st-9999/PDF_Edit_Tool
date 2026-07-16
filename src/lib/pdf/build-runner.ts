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

/**
 * Worker そのものが使えない（生成・読み込みに失敗した）ことを示す。
 * 「ビルド処理自体が失敗した」ケースと区別するために用いる。
 * 前者は本スレッドで再試行する価値があるが、後者は再試行しても同じ結果になる。
 */
class WorkerUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("worker を利用できません");
    this.name = "WorkerUnavailableError";
    this.cause = cause;
  }
}

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
      reject(new WorkerUnavailableError(err));
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
    // ビルド中の例外は worker 側で捕捉して `type: "error"` として通知されるため、
    // ここに来るのはスクリプトの読み込み失敗など worker 自体の問題とみなす。
    worker.onerror = () => {
      cleanup();
      reject(new WorkerUnavailableError());
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
      // worker を用意できなかったときだけ本スレッドで再試行する。
      // ビルド自体の失敗（暗号化 PDF・破損ファイル等）を再試行すると、
      // 同じ例外がもう一度出るうえに UI スレッドを重い処理で塞いでしまう。
      if (!(err instanceof WorkerUnavailableError)) throw err;
    }
  }
  return buildPdf(sources, pages, {
    onProgress: options.onProgress,
    signal: options.signal,
    outline: options.outline,
  });
}
