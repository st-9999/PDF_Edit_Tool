"use client";

import { useViewerStore } from "@/store/viewer-store";
import { usePdfDocument } from "./pdf-document-context";
import { Thumbnail } from "./thumbnail";

/** サムネイル一覧。クリックで該当ページへナビゲートする。 */
export function ThumbnailList() {
  const pdf = usePdfDocument();
  const numPages = useViewerStore((s) => s.numPages);
  const currentPage = useViewerStore((s) => s.currentPage);
  const requestPage = useViewerStore((s) => s.requestPage);

  return (
    <div className="flex flex-col items-center gap-1 p-2">
      {Array.from({ length: numPages }, (_, i) => i + 1).map((page) => (
        <Thumbnail
          key={page}
          pdf={pdf}
          pageNumber={page}
          active={page === currentPage}
          onSelect={requestPage}
        />
      ))}
    </div>
  );
}
