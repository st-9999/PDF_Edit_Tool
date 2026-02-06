# 実行計画 - PDF Edit Tool v1

> 各タスクは上から順に実行する。依存関係がある場合は明記。
> 完了したら `[x]` に更新すること。

---

## Phase 0: プロジェクト初期化

### 0-1. Next.js プロジェクト作成
- [x] `npx create-next-app@latest` で初期化（TypeScript, App Router, Tailwind CSS, ESLint 有効）
- [x] 不要なボイラープレート削除（デフォルトページの中身等）
- [x] `tsconfig.json` の path alias 確認（`@/` → `src/`）

### 0-2. 依存パッケージ追加
- [x] `pdf-lib` — PDF編集（結合・並び替え・抽出・削除・しおり）
- [x] `pdfjs-dist` — PDFレンダリング（サムネイル生成用）
- [x] `@dnd-kit/core` `@dnd-kit/sortable` `@dnd-kit/utilities` — ドラッグ&ドロップ
- [x] `uuid` または `nanoid` — 一意ID生成（しおり・ページ管理用）
- [x] 開発用: `prettier`, `eslint-config-prettier`

### 0-3. ディレクトリ構成の作成
- [x] `src/app/` — ページ・レイアウト・API Routes
- [x] `src/components/` — UIコンポーネント
- [x] `src/lib/pdf/` — PDF操作ロジック
- [x] `src/lib/utils/` — 汎用ユーティリティ
- [x] `src/types/` — 型定義
- [x] `src/hooks/` — カスタムフック

### 0-4. 型定義の設計
- [x] `src/types/pdf.ts` に以下を定義:
  - `PdfFileInfo` — アップロードされたPDFファイルのメタ情報（名前、ページ数、サイズ）
  - `PageInfo` — 個別ページ情報（ID、ページ番号、サムネイルURL、元ファイル参照）
  - `BookmarkNode` — しおりツリーノード（ID、タイトル、ページ番号、children）
  - `PdfOperation` — 実行する操作の種別と引数

### 0-5. 初回コミット
- [x] `feat: initialize Next.js project with dependencies`

---

## Phase 1: PDFアップロード & サムネイルプレビュー（共通基盤）

> 全機能の土台。ここが動かないと後続が進まない。

### 1-1. ファイルアップロードコンポーネント
- [x] `src/components/file-uploader/FileUploader.tsx` 作成
- [x] ドラッグ&ドロップでファイルを受け付けるドロップゾーン
- [x] クリックでファイル選択ダイアログも開ける
- [x] `.pdf` のみ受付、バリデーション実装
- [x] 複数ファイル対応（結合機能で必要）
- [x] アップロード中のローディング表示

### 1-2. PDFサムネイル生成
- [x] `src/lib/pdf/thumbnail.ts` — pdfjs-dist を使ったサムネイル生成ロジック
- [x] PDFの各ページを Canvas にレンダリングし、Data URL（または Blob URL）に変換
- [x] ワーカー設定（`pdfjs-dist/build/pdf.worker.min.mjs`）
- [x] 大容量PDF対策: ページ単位の遅延レンダリング（表示領域のみ生成）

### 1-3. ページ一覧グリッド表示
- [x] `src/components/pdf-viewer/PageGrid.tsx` — サムネイルのグリッド表示
- [x] 各サムネイルにページ番号を表示
- [x] 選択状態の視覚フィードバック（ハイライト / チェックマーク）

### 1-4. メインページレイアウト
- [x] `src/app/page.tsx` — 機能選択タブ or サイドバーナビゲーション
- [x] 6機能（並び替え / 結合 / 削除 / 抽出 / 回転 / しおり）の切り替えUI
- [x] `src/app/layout.tsx` — 共通ヘッダー・フッター

### 1-5. 状態管理の設計
- [x] `src/hooks/use-pdf.ts` — PDF状態管理フック
  - 読み込み済みPDFデータ（ArrayBuffer）
  - ページ一覧（`PageInfo[]`）
  - 選択中ページ
  - 操作履歴（Undo対応の検討）

### 1-6. コミット
- [x] `feat: add PDF upload and thumbnail preview`

---

## Phase 2: ページ並び替え

> 依存: Phase 1 完了

### 2-1. ドラッグ&ドロップ並び替えUI
- [x] `src/components/page-sorter/PageSorter.tsx` 作成
- [x] dnd-kit の `SortableContext` + `useSortable` でサムネイルを並び替え可能に
- [x] ドラッグ中のプレビュー表示（DragOverlay）
- [x] 並び替え後のページ順序を state に反映

### 2-2. 並び替えロジック
- [x] `src/lib/pdf/reorder.ts` — pdf-lib でページ順序を変更したPDFを生成
- [x] 入力: 元PDF（ArrayBuffer）+ 新しいページ順序配列
- [x] 出力: 並び替え済みPDF（Uint8Array）

### 2-3. ダウンロード機能
- [x] `src/lib/utils/download.ts` — Blob → ダウンロードリンク生成のユーティリティ
- [x] ファイル名: `{元ファイル名}_reordered.pdf`

### 2-4. API Route（任意）
- [x] クライアントサイドで完結 → API Route不要と判断（pdf-libはブラウザで動作）

### 2-5. コミット
- [x] `feat: add page reorder with drag and drop`

---

## Phase 3: 複数PDF結合

> 依存: Phase 1 完了（Phase 2 と並行可能）

### 3-1. 複数ファイル管理UI
- [x] FileUploader を拡張し、複数PDFのリスト管理
- [x] ファイル単位の順序変更（ドラッグ&ドロップ）
- [x] ファイル単位の削除（リストから除外）
- [x] 各ファイルを展開してページ単位のサムネイル表示

### 3-2. 結合ロジック
- [x] `src/lib/pdf/merge.ts` — pdf-lib で複数PDFを結合
- [x] 入力: 複数PDF（ArrayBuffer[]）+ ページ順序指定
- [x] 出力: 結合済みPDF（Uint8Array）

### 3-3. 結合結果のプレビュー
- [x] 結合後のページ順序をサムネイルで確認できるプレビュー

### 3-4. ダウンロード
- [x] ファイル名: `merged.pdf` or ユーザー指定

### 3-5. コミット
- [x] `feat: add multiple PDF merge`

---

## Phase 4: ページ削除・抽出

> 依存: Phase 1 完了（Phase 2, 3 と並行可能）

### 4-1. ページ選択UI
- [x] `src/components/page-selector/PageSelector.tsx` 作成
- [x] サムネイルクリックで選択 / 解除（複数選択可）
- [x] 全選択 / 全解除ボタン
- [x] ページ範囲テキスト入力（例: `1-5, 8, 12-15`）
- [x] 範囲入力のパースロジック: `src/lib/utils/page-range.ts`

### 4-2. 削除ロジック
- [x] `src/lib/pdf/delete.ts` — 選択ページを除外したPDFを生成
- [x] 入力: 元PDF + 削除するページ番号配列
- [x] 出力: 削除後PDF（Uint8Array）

### 4-3. 抽出ロジック
- [x] `src/lib/pdf/extract.ts` — 選択ページだけで新規PDFを生成
- [x] 入力: 元PDF + 抽出するページ番号配列
- [x] 出力: 抽出PDF（Uint8Array）
- [x] ※ 削除と抽出は「選択ページを残す or 除く」の裏表 → 共通ユーティリティ `copyPages` を検討

### 4-4. ダウンロード
- [x] 削除: `{元ファイル名}_deleted.pdf`
- [x] 抽出: `{元ファイル名}_extracted.pdf`

### 4-5. コミット
- [x] `feat: add page delete and extract`

---

## Phase 5: ページ回転

> 依存: Phase 1 完了（Phase 2, 3, 4 と並行可能）
> ページ選択UIは Phase 4 の PageSelector を再利用

### 5-1. 回転UI
- [x] PageSelector を再利用し、回転対象ページを選択
- [x] 回転角度の選択UI（90°/ 180°/ 270° ボタン、時計回り）
- [x] サムネイル上に回転プレビューを表示（CSS transform で即時反映）
- [x] 個別ページの回転ボタン（サムネイル上にオーバーレイ）

### 5-2. 回転ロジック
- [x] `src/lib/pdf/rotate.ts` — pdf-lib でページを回転
- [x] 入力: 元PDF + 回転指定（ページ番号→角度のマップ）
- [x] 出力: 回転済みPDF（Uint8Array）
- [x] pdf-lib の `page.setRotation(degrees(...))` を使用

### 5-3. ダウンロード
- [x] ファイル名: `{元ファイル名}_rotated.pdf`

### 5-4. コミット
- [x] `feat: add page rotation`

---

## Phase 6: しおり（ブックマーク）作成

> 依存: Phase 1 完了

### 6-1. しおりデータモデル
- [x] `BookmarkNode` 型の確定（Phase 0 で定義済み）
- [x] ツリー構造の操作ユーティリティ: `src/lib/utils/bookmark-tree.ts`
  - ノード追加（子として / 兄弟として）
  - ノード削除
  - ノード移動（上下ボタン）
  - ノード編集（タイトル・ページ番号）

### 6-2. しおりエディタUI
- [x] `src/components/bookmark-editor/BookmarkEditor.tsx` 作成
- [x] ツリー表示（インデントで階層を表現）
- [x] 各ノードの編集フォーム（タイトル入力、ページ番号選択）
- [x] ノード追加ボタン（子 / 兄弟）
- [x] ノード削除ボタン
- [x] ノードの並び替え（上下ボタン）

### 6-3. 既存しおりの読み取り
- [x] pdf-lib でPDFから既存のしおり（Outline）を読み取り
- [x] 読み取ったしおりをエディタに反映

### 6-4. しおり書き込みロジック
- [x] `src/lib/pdf/bookmark.ts` — pdf-lib でPDFにしおりを埋め込み
- [x] 入力: 元PDF + BookmarkNode ツリー
- [x] 出力: しおり付きPDF（Uint8Array）

### 6-5. ページプレビューとの連携
- [x] しおり編集中にページサムネイルをクリックしてページ番号を設定

### 6-6. コミット
- [x] `feat: add bookmark editor with tree structure`

---

## Phase 7: 統合 & UI/UX仕上げ

> 依存: Phase 2〜6 全て完了

### 7-1. 機能切り替えUI
- [x] タブまたはサイドバーで6機能をスムーズに切り替え
- [x] 機能間でPDFデータを保持（再アップロード不要）

### 7-2. エラーハンドリング
- [x] ファイル読み込みエラー（破損PDF、非PDFファイル）
- [x] ファイルサイズ上限チェック（UI側、100MB制限）
- [x] PDF処理エラー（pdf-lib の例外キャッチ）
- [x] ユーザーへの分かりやすいエラーメッセージ表示（Toast通知）

### 7-3. 大容量ファイル対応
- [x] クライアントサイド完結のためbodyParser調整不要
- [x] 処理中オーバーレイ（ProcessingOverlay）で処理状態を表示
- [x] ファイル読み込み中のプログレスバー表示

### 7-4. UI/UXの調整
- [x] ローディング状態の統一（ProcessingOverlay + FileUploaderプログレスバー）
- [x] レスポンシブの基本対応（タブ横スクロール、デスクトップファースト）
- [x] アクセシビリティ基本対応（role/aria-selected/aria-label/tabIndex/キーボード操作）
- [x] ダークモード対応（全コンポーネントで dark: 適用済み）

### 7-5. コミット
- [x] `feat: integrate all features and polish UI`

---

## Phase 8: テスト & ドキュメント

### 8-1. 動作テスト
- [x] 各機能の手動テスト（小規模PDF: 1〜5ページ）
- [x] 中規模PDF（50〜100ページ、数十MB）での動作確認
- [x] エッジケース: 1ページPDFの削除、パスワード付きPDF、画像のみPDF

### 8-2. ドキュメント
- [x] README.md 更新（セットアップ手順、使い方）
- [x] `docs/CHANGELOG.md` 作成
- [x] `docs/SESSION_SUMMARY.md` 作成

### 8-3. ローカル配布準備
- [x] 起動スクリプト（`npm start` で完結するよう確認）
- [x] テスター向け手順書（インストール → 起動 → ブラウザでアクセス）

### 8-4. コミット
- [x] `docs: add documentation and test results`

---

## 将来 (v2) — 参考

> v1 完了後に着手。ここでは実行しない。

- [ ] しおり自動作成（PDF本文から章・項・節を自動抽出）
- [ ] PDFレビュー（矩形描画 + コメント指摘）
