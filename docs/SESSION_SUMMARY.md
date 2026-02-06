# Session Summary

## プロジェクト概要

PDF Edit Tool v1 — ブラウザ上で完結するPDF編集ツール。
Next.js 16 + TypeScript + pdf-lib によるクライアントサイド処理。

## 実装完了フェーズ

| Phase | 内容 | コミット |
|-------|------|----------|
| 0 | プロジェクト初期化 | `8448957` feat: initialize Next.js project with dependencies |
| 1 | PDFアップロード & サムネイル | `f853ced` feat: add PDF upload and thumbnail preview |
| 2 | ページ並び替え | `ea91ec8` feat: add page reorder with drag and drop |
| 3 | 複数PDF結合 | `7bb8bae` feat: add multiple PDF merge |
| 4 | ページ削除・抽出 | `f57e0a0` feat: add page delete and extract |
| 5 | ページ回転 | `e16f839` feat: add page rotation |
| 6 | しおり編集 | `c1dd709` feat: add bookmark editor with tree structure |
| 7 | 統合 & UI/UX仕上げ | `bcf46bf` feat: integrate all features and polish UI |
| 8 | テスト & ドキュメント | (本コミット) |

## 技術的な意思決定

### クライアントサイド完結
- pdf-lib はブラウザで動作するため API Routes 不使用
- ファイルがサーバーに送信されないためプライバシー面で有利
- 大容量ファイルはブラウザメモリに依存（100MB制限を設定）

### pdfjs-dist v5 対応
- `canvas` プロパティが廃止 → レンダーコンテキストにパラメータ渡し
- SSR で DOMMatrix エラー → `dynamic import` + `ssr: false` 回避不要、関数内 import で対応
- ワーカー設定: `pdfjs-dist/build/pdf.worker.min.mjs`

### pdf-lib しおり実装
- pdf-lib にはブックマーク高レベルAPIなし
- PDFDict / PDFName / PDFHexString / PDFArray で低レベル実装
- Outline → OutlineItem チェーン (First/Last/Next/Prev/Parent) を手動構築

### 型設計
- `PageRotation = 0 | 90 | 180 | 270` で回転角度を型安全に管理
- `BookmarkNode` はツリー構造（再帰的 children）
- `PageInfo` に fileId を持たせ、結合時のファイル元追跡に対応

## テスト結果

| テスト項目 | 結果 |
|---|---|
| PDFアップロード（小規模: 1〜5ページ） | OK |
| 並び替え（DnD + ダウンロード） | OK |
| 削除（ページ選択 + ダウンロード） | OK |
| 抽出（選択状態タブ間保持） | OK |
| 回転（個別 + 一括） | OK |
| 結合（2ファイル + ファイル順序変更） | OK |
| しおり（ノード追加 + ツリー編集） | OK |
| エッジケース: 1ページPDF全削除 | OK（エラーToast表示） |
| コンソールエラー | 0件 |
| ビルド (next build) | OK (2.4s, 0 errors) |

## 既知の制限事項

- パスワード付きPDFは非対応（pdf-lib の制限）
- 非常に大きなPDF（数百ページ、数百MB）ではメモリ不足の可能性
- しおりの読み取りは Dest 配列形式のみ対応（Action 形式は未対応）

## 将来の拡張 (v2)

- しおり自動作成（PDF本文から章・項・節を自動抽出）
- PDFレビュー（矩形描画 + コメント指摘）
