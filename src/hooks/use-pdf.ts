"use client";

import { useCallback, useState } from "react";
import { nanoid } from "nanoid";
import type { PdfFileInfo, PageInfo, PageRotation } from "@/types/pdf";
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
  /** ファイルの順序を移動（結合用） */
  moveFile: (fileId: string, direction: "up" | "down") => void;
  /** 全ファイルをクリア */
  clearAll: () => void;
  /** ページの選択状態をトグル */
  togglePageSelection: (pageId: string) => void;
  /** 全ページを選択 */
  selectAllPages: () => void;
  /** 全ページの選択を解除 */
  deselectAllPages: () => void;
  /** ページ番号配列で選択する（範囲選択用） */
  selectByPageNumbers: (pageNumbers: number[]) => void;
  /** 個別ページを回転（CSSプレビュー用） */
  rotatePage: (pageId: string, angle: PageRotation) => void;
  /** 選択中ページを一括回転（CSSプレビュー用） */
  rotateSelectedPages: (angle: PageRotation) => void;
  /** ページを削除（UI上から即時削除） */
  deletePage: (pageId: string) => void;
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
          sourceFile: file,
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

  const moveFile = useCallback(
    (fileId: string, direction: "up" | "down") => {
      setFiles((prev) => {
        const idx = prev.findIndex((f) => f.id === fileId);
        if (idx === -1) return prev;
        const targetIdx = direction === "up" ? idx - 1 : idx + 1;
        if (targetIdx < 0 || targetIdx >= prev.length) return prev;
        const newFiles = [...prev];
        [newFiles[idx], newFiles[targetIdx]] = [newFiles[targetIdx], newFiles[idx]];
        return newFiles;
      });
    },
    []
  );

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

  const selectByPageNumbers = useCallback((pageNumbers: number[]) => {
    const numSet = new Set(pageNumbers);
    setPages((prev) =>
      prev.map((p) => ({ ...p, selected: numSet.has(p.pageNumber) }))
    );
  }, []);

  const nextRotation = (current: PageRotation, add: PageRotation): PageRotation =>
    ((current + add) % 360) as PageRotation;

  const rotatePage = useCallback((pageId: string, angle: PageRotation) => {
    setPages((prev) =>
      prev.map((p) =>
        p.id === pageId
          ? { ...p, rotation: nextRotation(p.rotation, angle) }
          : p
      )
    );
  }, []);

  const rotateSelectedPages = useCallback((angle: PageRotation) => {
    setPages((prev) =>
      prev.map((p) =>
        p.selected
          ? { ...p, rotation: nextRotation(p.rotation, angle) }
          : p
      )
    );
  }, []);

  const deletePage = useCallback((pageId: string) => {
    setPages((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((p) => p.id !== pageId);
    });
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
    moveFile,
    clearAll,
    togglePageSelection,
    selectAllPages,
    deselectAllPages,
    selectByPageNumbers,
    rotatePage,
    rotateSelectedPages,
    deletePage,
    reorderPages,
  };
}
