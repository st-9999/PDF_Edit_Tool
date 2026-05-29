import { buildPdf, type SourceBytes } from "@/lib/editor/build";
import type { PageRef } from "@/lib/editor/operations";

interface BuildMessage {
  sources: SourceBytes;
  pages: PageRef[];
}

const ctx = self as unknown as {
  onmessage: ((event: MessageEvent<BuildMessage>) => void) | null;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
};

// 重い PDF ビルドを UI スレッドから隔離する。進捗を逐次通知し、結果は Transferable で返す。
ctx.onmessage = (event) => {
  const { sources, pages } = event.data;
  buildPdf(sources, pages, {
    onProgress: (done, total) =>
      ctx.postMessage({ type: "progress", done, total }),
  })
    .then((bytes) => {
      ctx.postMessage({ type: "done", bytes }, [bytes.buffer]);
    })
    .catch((err: unknown) => {
      ctx.postMessage({
        type: "error",
        message: err instanceof Error ? err.message : "ビルドに失敗しました",
      });
    });
};

export {};
