"use client";

import { useViewerStore } from "@/store/viewer-store";
import { useIsDirty } from "@/lib/hooks/use-is-dirty";
import { formatFileSize } from "@/lib/format";

const STATUS_LABEL: Record<string, string> = {
  idle: "待機中",
  loading: "読み込み中…",
  ready: "準備完了",
  error: "エラー",
};

/** 総ページ数・ファイルサイズ・処理状況を表示するステータスバー。 */
export function StatusBar() {
  const numPages = useViewerStore((s) => s.numPages);
  const fileSize = useViewerStore((s) => s.fileSize);
  const status = useViewerStore((s) => s.status);
  const error = useViewerStore((s) => s.error);
  const dirty = useIsDirty();

  return (
    <footer
      role="status"
      className="text-muted-foreground flex items-center gap-4 border-t px-4 py-1.5 text-xs"
    >
      <span>{numPages > 0 ? `${numPages} ページ` : "—"}</span>
      <span aria-hidden>·</span>
      <span>{fileSize != null ? formatFileSize(fileSize) : "—"}</span>
      <span aria-hidden>·</span>
      <span className={status === "error" ? "text-destructive" : undefined}>
        {status === "error" && error ? error : (STATUS_LABEL[status] ?? status)}
      </span>
      {dirty && (
        <>
          <span aria-hidden>·</span>
          <span className="text-amber-600 dark:text-amber-500">
            <span aria-hidden>●</span> 未保存
          </span>
        </>
      )}
    </footer>
  );
}
