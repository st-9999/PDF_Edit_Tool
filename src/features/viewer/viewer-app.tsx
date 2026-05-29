"use client";

import dynamic from "next/dynamic";
import { useViewerStore } from "@/store/viewer-store";
import { EmptyState } from "./empty-state";

// ビューア本体（base-ui コンポーネントや pdf 関連）はファイルを開くまで不要なため
// 動的 import で初期バンドルから分離する。
const ViewerLayout = dynamic(
  () => import("./viewer-layout").then((m) => m.ViewerLayout),
  {
    ssr: false,
    loading: () => (
      <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">
        読み込み中…
      </div>
    ),
  },
);

/** 最上位の切替: 未読込なら空状態、ファイルがあればビューア。 */
export function ViewerApp() {
  const file = useViewerStore((s) => s.file);
  return file ? <ViewerLayout /> : <EmptyState />;
}
