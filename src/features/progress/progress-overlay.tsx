"use client";

import { Button } from "@/components/ui/button";
import { useProgressStore } from "@/store/progress-store";

/** 重い処理中のオーバーレイ（進捗バー＋キャンセル）。 */
export function ProgressOverlay() {
  const running = useProgressStore((s) => s.running);
  const label = useProgressStore((s) => s.label);
  const done = useProgressStore((s) => s.done);
  const total = useProgressStore((s) => s.total);
  const onCancel = useProgressStore((s) => s.onCancel);

  if (!running) return null;
  const determinate = total > 0;
  const pct = determinate ? Math.round((done / total) * 100) : 0;

  return (
    <div
      role="dialog"
      aria-label="処理中"
      className="bg-background/70 absolute inset-0 z-30 flex items-center justify-center"
    >
      <div className="bg-background w-72 rounded-lg border p-4 shadow-lg">
        <p className="text-sm font-medium">{label}</p>
        <div className="bg-muted mt-3 h-2 w-full overflow-hidden rounded-full">
          <div
            className={
              determinate
                ? "bg-primary h-full"
                : "bg-primary h-full animate-pulse"
            }
            style={{ width: determinate ? `${pct}%` : "100%" }}
          />
        </div>
        <p className="text-muted-foreground mt-2 text-xs">
          {determinate ? `${done} / ${total} ページ (${pct}%)` : "処理中…"}
        </p>
        <div className="mt-3 flex justify-end">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onCancel?.()}
          >
            キャンセル
          </Button>
        </div>
      </div>
    </div>
  );
}
