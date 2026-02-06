"use client";

import { useCallback, useState } from "react";
import { nanoid } from "nanoid";
import type { PdfFileInfo, PageInfo } from "@/types/pdf";
import { loadPdfDocument, renderAllThumbnails } from "@/lib/pdf/thumbnail";

export interface UsePdfReturn {
  /** 読み込み済みファイル一覧 */
  files: PdfFileInfo[];
  /** 全ファイルのページ一覧（統合） */
  pages: PageInfo[];
  /** 読み込み中フラグ */
  loading: boolean;
  /** 読み込み進捗（0〜1） */
  progress: number;
  /** エラーメッセージ */
  error: string | null;
  /** PDFファイルを追加読み込み */
  addFiles: (fileList: File[]) => Promise<void>;
  /** ファイルを削除 */
  removeFile: (fileId: string) => void;
  /** 全ファイルをクリア */
  clearAll: () => void;
  /** ページの選択状態をトグル */
  togglePageSelection: (pageId: string) => void;
  /** 全ページを選択 */
  selectAllPages: () => void;
  /** 全ページの選択を解除 */
  deselectAllPages: () => void;
  /** ページの順序を更新 */
  reorderPages: (newPages: PageInfo[]) => void;
}

export function usePdf(): UsePdfReturn {
  const [files, setFiles] = useState<PdfFileInfo[]>([]);
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const addFiles = useCallback(async (fileList: File[]) => {
    setLoading(true);
    setError(null);
    setProgress(0);

    try {
      const totalPages = fileList.length;
      let processedFiles = 0;

      for (const file of fileList) {
        if (file.type !== "application/pdf") {
          throw new Error(`"${file.name}" はPDFファイルではありません`);
        }

        const fileId = nanoid();
        const arrayBuffer = await file.arrayBuffer();
        const pdfDoc = await loadPdfDocument(arrayBuffer);
        const pageCount = pdfDoc.numPages;

        const fileInfo: PdfFileInfo = {
          id: fileId,
          name: file.name,
          size: file.size,
          pageCount,
          data: arrayBuffer,
        };

        const newPages: PageInfo[] = [];

        await renderAllThumbnails(pdfDoc, (pageNumber, thumbnailUrl) => {
          newPages.push({
            id: nanoid(),
            pageNumber,
            thumbnailUrl,
            fileId,
            rotation: 0,
            selected: false,
          });
        });

        pdfDoc.destroy();

        setFiles((prev) => [...prev, fileInfo]);
        setPages((prev) => [...prev, ...newPages]);

        processedFiles++;
        setProgress(processedFiles / totalPages);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "PDFの読み込みに失敗しました";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const removeFile = useCallback((fileId: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
    setPages((prev) => prev.filter((p) => p.fileId !== fileId));
  }, []);

  const clearAll = useCallback(() => {
    setFiles([]);
    setPages([]);
    setError(null);
  }, []);

  const togglePageSelection = useCallback((pageId: string) => {
    setPages((prev) =>
      prev.map((p) =>
        p.id === pageId ? { ...p, selected: !p.selected } : p
      )
    );
  }, []);

  const selectAllPages = useCallback(() => {
    setPages((prev) => prev.map((p) => ({ ...p, selected: true })));
  }, []);

  const deselectAllPages = useCallback(() => {
    setPages((prev) => prev.map((p) => ({ ...p, selected: false })));
  }, []);

  const reorderPages = useCallback((newPages: PageInfo[]) => {
    setPages(newPages);
  }, []);

  return {
    files,
    pages,
    loading,
    progress,
    error,
    addFiles,
    removeFile,
    clearAll,
    togglePageSelection,
    selectAllPages,
    deselectAllPages,
    reorderPages,
  };
}
