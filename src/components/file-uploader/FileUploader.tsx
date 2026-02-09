"use client";

import { useCallback, useRef, useState } from "react";
import { useToast } from "@/components/ui/Toast";

const MAX_FILE_SIZE_MB = 500;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

interface FileUploaderProps {
  onFilesSelected: (files: File[]) => void;
  multiple?: boolean;
  loading?: boolean;
  progress?: number;
}

export function FileUploader({
  onFilesSelected,
  multiple = true,
  loading = false,
  progress = 0,
}: FileUploaderProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;

      const pdfFiles: File[] = [];
      const invalidFiles: string[] = [];
      const oversizedFiles: string[] = [];

      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        if (!(file.type === "application/pdf" || file.name.endsWith(".pdf"))) {
          invalidFiles.push(file.name);
        } else if (file.size > MAX_FILE_SIZE_BYTES) {
          oversizedFiles.push(file.name);
        } else {
          pdfFiles.push(file);
        }
      }

      if (invalidFiles.length > 0) {
        showToast(
          `PDFではないためスキップ: ${invalidFiles.join(", ")}`,
          "error"
        );
      }
      if (oversizedFiles.length > 0) {
        showToast(
          `${MAX_FILE_SIZE_MB}MBを超えるためスキップ: ${oversizedFiles.join(", ")}`,
          "error"
        );
      }

      if (pdfFiles.length > 0) {
        onFilesSelected(multiple ? pdfFiles : pdfFiles.slice(0, 1));
      }
    },
    [onFilesSelected, showToast]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleFiles(e.target.files);
      // 同じファイルを再選択可能にするためリセット
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    },
    [handleFiles]
  );

  return (
    <div className="w-full">
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={handleClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleClick(); } }}
        aria-label={`PDFファイルをアップロード${multiple ? "（複数可）" : ""}`}
        className={`
          flex cursor-pointer flex-col items-center justify-center
          rounded-lg border-2 border-dashed p-8 transition-colors
          ${
            isDragOver
              ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20"
              : "border-zinc-300 hover:border-zinc-400 dark:border-zinc-600 dark:hover:border-zinc-500"
          }
          ${loading ? "pointer-events-none opacity-60" : ""}
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,application/pdf"
          multiple={multiple}
          onChange={handleInputChange}
          className="hidden"
        />

        {loading ? (
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-300 border-t-blue-500" />
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              PDF を読み込み中... {Math.round(progress * 100)}%
            </p>
            <div className="h-2 w-48 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
              <div
                className="h-full rounded-full bg-blue-500 transition-all"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <svg
              className="h-10 w-10 text-zinc-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 16V4m0 0L8 8m4-4l4 4M4 14v4a2 2 0 002 2h12a2 2 0 002-2v-4"
              />
            </svg>
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              ここにPDFファイルをドラッグ&ドロップ
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              またはクリックしてファイルを選択（{multiple ? "複数可" : "1ファイル"}）
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
