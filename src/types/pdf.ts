/** アップロードされたPDFファイルのメタ情報 */
export interface PdfFileInfo {
  /** 一意なファイルID */
  id: string;
  /** ファイル名 */
  name: string;
  /** ファイルサイズ（バイト） */
  size: number;
  /** 総ページ数 */
  pageCount: number;
  /** PDFデータ（ArrayBuffer） */
  data: ArrayBuffer;
}

/** 個別ページの情報 */
export interface PageInfo {
  /** 一意なページID */
  id: string;
  /** ページ番号（1始まり） */
  pageNumber: number;
  /** サムネイル画像のData URL */
  thumbnailUrl: string;
  /** 元ファイルのID */
  fileId: string;
  /** 回転角度（0, 90, 180, 270） */
  rotation: PageRotation;
  /** 選択状態 */
  selected: boolean;
}

/** ページの回転角度 */
export type PageRotation = 0 | 90 | 180 | 270;

/** しおりツリーのノード */
export interface BookmarkNode {
  /** 一意なしおりID */
  id: string;
  /** しおりのタイトル */
  title: string;
  /** リンク先ページ番号（1始まり） */
  pageNumber: number;
  /** 子しおり */
  children: BookmarkNode[];
}

/** PDF操作の種別 */
export type PdfOperationType =
  | "reorder"
  | "merge"
  | "delete"
  | "extract"
  | "rotate"
  | "bookmark";

/** PDF操作の定義 */
export interface PdfOperation {
  /** 操作種別 */
  type: PdfOperationType;
  /** 操作対象のファイルID */
  fileIds: string[];
  /** 操作パラメータ */
  params: PdfOperationParams;
}

/** 操作パラメータの型（操作種別ごとに異なる） */
export type PdfOperationParams =
  | ReorderParams
  | MergeParams
  | DeleteParams
  | ExtractParams
  | RotateParams
  | BookmarkParams;

/** ページ並び替えのパラメータ */
export interface ReorderParams {
  type: "reorder";
  /** 新しいページ順序（ページIDの配列） */
  pageOrder: string[];
}

/** PDF結合のパラメータ */
export interface MergeParams {
  type: "merge";
  /** 結合するファイルとページの順序 */
  sources: Array<{
    fileId: string;
    pageNumbers: number[];
  }>;
}

/** ページ削除のパラメータ */
export interface DeleteParams {
  type: "delete";
  /** 削除するページ番号（1始まり） */
  pageNumbers: number[];
}

/** ページ抽出のパラメータ */
export interface ExtractParams {
  type: "extract";
  /** 抽出するページ番号（1始まり） */
  pageNumbers: number[];
}

/** ページ回転のパラメータ */
export interface RotateParams {
  type: "rotate";
  /** ページ番号→回転角度のマップ */
  rotations: Record<number, PageRotation>;
}

/** しおり設定のパラメータ */
export interface BookmarkParams {
  type: "bookmark";
  /** しおりツリー */
  bookmarks: BookmarkNode[];
}
