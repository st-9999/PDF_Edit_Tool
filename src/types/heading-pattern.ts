/**
 * 報告書しおり自動作成（Auto-Bookmark）の見出しパターン型。
 * 章 / 節 / 項を正規表現で検出するルールを表す。ユーザーは組み込みパターンの
 * 有効/無効切り替えや、独自パターンの追加ができる。
 */
export interface HeadingPattern {
  /** 一意 ID（組み込みは "builtin-chapter" 等、カスタムは生成 ID）。 */
  id: string;
  /** UI 表示名（例: "章（第N章）"）。 */
  label: string;
  /** 正規表現文字列。名前付きグループ `(?<title>...)` でタイトル部を抽出する。 */
  pattern: string;
  /** しおり階層レベル（1=章, 2=節, 3=項）。 */
  level: 1 | 2 | 3;
  /** 有効/無効。 */
  enabled: boolean;
  /** 組み込みパターンか（true は削除不可、無効化のみ）。 */
  builtin: boolean;
}

/** 抽出処理の進捗（ダイアログのプログレス表示用）。 */
export interface ExtractionProgress {
  /** 現在解析中のページ（表示位置・1 始まり）。 */
  currentPage: number;
  /** 総ページ数。 */
  totalPages: number;
  /** ここまでに検出した見出し件数。 */
  foundCount: number;
}
