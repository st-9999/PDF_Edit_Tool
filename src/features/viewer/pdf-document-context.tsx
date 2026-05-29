"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

const PdfDocumentContext = createContext<PDFDocumentProxy | null>(null);

export function PdfDocumentProvider({
  pdf,
  children,
}: {
  pdf: PDFDocumentProxy;
  children: ReactNode;
}) {
  return (
    <PdfDocumentContext.Provider value={pdf}>
      {children}
    </PdfDocumentContext.Provider>
  );
}

/** ロード済みの PDF を取得する（未ロードなら例外）。 */
export function usePdfDocument(): PDFDocumentProxy {
  const pdf = useContext(PdfDocumentContext);
  if (!pdf) {
    throw new Error("PdfDocumentProvider の外で PDF を参照しています");
  }
  return pdf;
}
