# Changelog

All notable changes to this project will be documented in this file.
Format based on [Keep a Changelog](https://keepachangelog.com/).

## [0.1.0] - 2026-02-06

### Added

- **Phase 0**: Next.js プロジェクト初期化 (TypeScript, App Router, Tailwind CSS v4)
  - pdf-lib, pdfjs-dist, @dnd-kit, nanoid 等の依存パッケージ
  - ディレクトリ構成と型定義 (`PdfFileInfo`, `PageInfo`, `BookmarkNode` 等)

- **Phase 1**: PDF アップロード & サムネイルプレビュー
  - ドラッグ&ドロップ対応ファイルアップローダー
  - pdfjs-dist によるサムネイル生成（遅延レンダリング対応）
  - ページ一覧グリッド表示
  - 6機能タブ切り替えUI
  - PDF状態管理フック (`use-pdf.ts`)

- **Phase 2**: ページ並び替え
  - @dnd-kit によるドラッグ&ドロップ並び替え
  - DragOverlay によるドラッグ中プレビュー
  - pdf-lib でページ順序を変更したPDF生成

- **Phase 3**: 複数PDF結合
  - 複数ファイルアップロード・リスト管理
  - ファイル単位の順序変更・削除
  - pdf-lib で複数PDFを結合

- **Phase 4**: ページ削除・抽出
  - ページ選択UI（クリック選択、全選択/全解除、範囲テキスト入力）
  - 選択ページを除外した削除PDF生成
  - 選択ページのみの抽出PDF生成

- **Phase 5**: ページ回転
  - 個別ページの左右回転ボタン
  - 選択ページ一括回転 (90°/180°/270°)
  - CSSプレビュー即時反映
  - pdf-lib で回転済みPDF生成

- **Phase 6**: しおり（ブックマーク）編集
  - ツリー構造エディタ（追加/削除/移動/編集）
  - 既存しおり読み込み（PDF Outline パース）
  - サムネイルクリックでページ番号設定
  - pdf-lib 低レベルAPI でしおり書き込み

- **Phase 7**: 統合 & UI/UX仕上げ
  - Toast通知システム（成功/エラー/情報）
  - 処理中オーバーレイ（ProcessingOverlay）
  - ファイルサイズ上限チェック (100MB)
  - ARIA アクセシビリティ属性
  - ダークモード対応
  - レスポンシブ基本対応

- **Phase 8**: テスト & ドキュメント
  - 全機能の動作テスト確認
  - エッジケーステスト（1ページPDF削除等）
  - README.md、CHANGELOG.md、SESSION_SUMMARY.md 作成
