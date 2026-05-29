import { createId } from "@/lib/id";

/**
 * 編集対象の 1 ページ。元バイト列は変更せず、ページの並び・回転は
 * この参照リスト（操作ログから派生）で表現する。
 */
export interface PageRef {
  /** エントリ固有 ID（並び替え・選択の安定キー）。 */
  id: string;
  /** 元ドキュメント識別子（merge で複数ソースを区別）。 */
  sourceId: string;
  /** 元ドキュメント内の 0 始まりページ番号。 */
  sourceIndex: number;
  /** ユーザーが適用した追加回転（時計回り, 0/90/180/270）。 */
  rotation: number;
}

/**
 * 状態を変化させる編集操作。
 * 注: extract / split は「現在の状態を変えず新規 PDF を出力する」エクスポート操作のため、
 * この操作ログ（Undo/Redo 対象）には含めない（P3/P4 で純関数として実装）。
 */
export type EditOperation =
  | { type: "reorder"; ids: string[]; toIndex: number }
  | { type: "rotate"; ids: string[]; delta: number }
  | { type: "delete"; ids: string[] }
  | { type: "merge"; index: number; pages: PageRef[] };

export const ROTATION_STEP = 90;

/** 角度を [0,360) の時計回りに正規化する。 */
export function normalizeRotation(deg: number): number {
  return (
    (((Math.round(deg / ROTATION_STEP) * ROTATION_STEP) % 360) + 360) % 360
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** ロード直後の初期ページ列を生成する。 */
export function createInitialPages(
  sourceId: string,
  numPages: number,
  makeId: () => string = () => createId("page"),
): PageRef[] {
  return Array.from({ length: Math.max(0, numPages) }, (_, i) => ({
    id: makeId(),
    sourceId,
    sourceIndex: i,
    rotation: 0,
  }));
}

/**
 * 1 操作をページ列に適用する純関数（新しい配列を返す）。
 * - reorder: 指定 ID 群を現在の相対順を保って取り除き、除去後配列の `toIndex` に挿入
 * - rotate : 指定 ID の回転に delta を加算（正規化）
 * - delete : 指定 ID を除去
 * - merge  : `index` に新規ページ群を挿入
 */
export function applyOperation(pages: PageRef[], op: EditOperation): PageRef[] {
  switch (op.type) {
    case "reorder": {
      const ids = new Set(op.ids);
      const moving = pages.filter((p) => ids.has(p.id));
      const rest = pages.filter((p) => !ids.has(p.id));
      const at = clamp(op.toIndex, 0, rest.length);
      return [...rest.slice(0, at), ...moving, ...rest.slice(at)];
    }
    case "rotate": {
      const ids = new Set(op.ids);
      return pages.map((p) =>
        ids.has(p.id)
          ? { ...p, rotation: normalizeRotation(p.rotation + op.delta) }
          : p,
      );
    }
    case "delete": {
      const ids = new Set(op.ids);
      return pages.filter((p) => !ids.has(p.id));
    }
    case "merge": {
      const at = clamp(op.index, 0, pages.length);
      return [...pages.slice(0, at), ...op.pages, ...pages.slice(at)];
    }
  }
}

/** 初期ページ列に操作ログを畳み込んで現在のページ列を導出する。 */
export function derivePages(
  initial: PageRef[],
  ops: EditOperation[],
): PageRef[] {
  return ops.reduce(applyOperation, initial);
}
