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
| 8 | テスト & ドキュメント | `843254c` docs: add documentation and test results |
| 9 | テスト基盤修正 | `8d578c6` vitest パスエイリアス修正、未コミット変更の整理 |
| 10 | テストカバレッジ拡充 | `353cf17` コンポーネント47件 + E2E 4件 + 統合8件 |
| 11 | 品質改善 & デプロイ | デプロイワークフロー修正、モバイル対応、アーキテクチャ文書化 |

## 技術的な意思決定

### クライアントサイド完結（API Routes 不採用の理由）
- pdf-lib はブラウザで動作するため API Routes 不使用
- ファイルがサーバーに送信されないためプライバシー面で有利
- 大容量ファイルはブラウザメモリに依存（100MB制限を設定）
- デプロイが `output: "export"` による静的ファイルのみで完結 → サーバー運用コスト0

### `output: "export"` 採用理由
- GitHub Pages など静的ホスティングへのデプロイを可能にする
- サーバーサイド処理がないため SSR/ISR は不要
- `basePath: "/PDF_Edit_Tool"` でサブディレクトリ配信に対応
- Node.js ランタイム不要 → CDN 配信で高速・安価

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

### デプロイワークフロー
- GitHub Actions (`.github/workflows/deploy.yml`) で `main` ブランチ push 時に自動デプロイ
- `next build` → `out/` を GitHub Pages Artifact としてアップロード → deploy-pages で公開
- URL: `https://<user>.github.io/PDF_Edit_Tool/`

## パフォーマンス特性

| 項目 | 状況 |
|---|---|
| サムネイル生成 | プログレッシブ（1ページずつコールバック通知） |
| 仮想スクロール | 未実装（全ページをDOMに配置） |
| 遅延レンダリング | 未実装（初回読み込み時に全ページ生成） |
| メモリ使用量 | ページ数に比例（各ページのData URL保持） |
| 大容量PDF目安 | 50〜100ページは実用的、数百ページではメモリ注意 |
| Ctrl+ホイール拡大 | サムネイル・ページビューアの両方で対応 |

## 既知の制限事項

- パスワード付きPDFは非対応（pdf-lib の制限）
- 非常に大きなPDF（数百ページ、数百MB）ではメモリ不足の可能性
- しおりの読み取りは Dest 配列形式のみ対応（Action 形式は未対応）

## 将来の拡張 (v2)

- ~~しおり自動作成~~ → **実装済み**（auto-bookmark.ts + AutoBookmarkDialog.tsx）
- PDFレビュー（矩形描画 + コメント指摘）
