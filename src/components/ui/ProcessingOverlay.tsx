"use client";

interface ProcessingOverlayProps {
  visible: boolean;
  message?: string;
}

export function ProcessingOverlay({
  visible,
  message = "処理中...",
}: ProcessingOverlayProps) {
  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={message}
    >
      <div className="flex flex-col items-center gap-3 rounded-xl bg-white px-8 py-6 shadow-xl dark:bg-zinc-800">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-300 border-t-blue-500" />
        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {message}
        </p>
      </div>
    </div>
  );
}
