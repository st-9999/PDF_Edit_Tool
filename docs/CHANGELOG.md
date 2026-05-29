# Changelog

このプロジェクトのすべての注目すべき変更を記録します。

- 形式は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) に準拠し、変更は [Conventional Commits](https://www.conventionalcommits.org/ja/) 形式で記述します。
- バージョニングは [Semantic Versioning](https://semver.org/lang/ja/) に従います。
- 各エントリは **Added（追加）/ Changed（変更）/ Fixed（修正）/ Removed（削除）** に分類します。

関連: [`docs/SPEC.md`](./SPEC.md)（仕様）/ [`docs/TODO.md`](./TODO.md)（実行計画）/ [`docs/SESSION_SUMMARY.md`](./SESSION_SUMMARY.md)（作業サマリ）

---

## [Unreleased]

### Added

<!-- P2 編集コア + Undo/Redo -->

- feat(editor): 操作ログ方式の編集エンジンを実装。`PageRef` と `EditOperation`（reorder/rotate/delete/merge）、`applyOperation` / `derivePages`、replay 方式の Undo/Redo 履歴（`history.ts`）。
- feat(editor): 複数選択モデル（`selection.ts`: 単一/Ctrl トグル/Shift 範囲/全選択）と `editor-store`（Zustand）を追加。
- feat(editor): TopBar に Undo/Redo ボタン、StatusBar に未保存インジケータ（●）、`beforeunload` ガード、Ctrl/Cmd+Z・Ctrl+Y/Shift+Z ショートカットを配線。
- feat(editor): サムネイル一覧をクリック/Ctrl/Shift で複数選択（ハイライト）対応。
- test(editor): 操作/派生/履歴/選択/ストアの unit（合計 65 件）と、選択・Undo 配線の Chromium E2E を追加。

<!-- P1 ビューア基盤 -->

- feat(viewer): pdfjs-dist を導入し、worker / CMap / 標準フォント / wasm を `public/pdfjs/` へ配置（`scripts/copy-pdfjs-assets.mjs`）して basePath 経由で配信。
- feat(viewer): D&D + ファイル選択の空状態 UI、3 ペイン（トップバー / 左ペイン / メインビューア）+ ステータスバーを実装。
- feat(viewer): ページ描画（HiDPI 対応・レンダータスクキャンセル）、ページ送り、ズーム（スライダー / % 入力 / 幅合わせ / 全体表示）、単ページ / 連続スクロール切替を実装。
- feat(viewer): サムネイル一覧（IntersectionObserver による遅延・低解像度生成）と `Tabs`（サムネイル / しおり枠）を実装。
- feat(store): Zustand の viewer ストア（ページ・ズーム・表示モード・状態・ナビ要求）と純関数 `clampPage` / `clampZoom` を追加。
- perf(viewer): ビューア本体を `next/dynamic` で遅延ロードし、初期バンドルを削減（初期 JS gzip 243KB→208KB）。
- test(viewer): store 境界/ズームの unit、pdf.js による PDF ロードの node 統合、`EmptyState` の RTL、Chromium での実描画 E2E を追加（unit 31 件 + E2E 2 件）。
- `docs/CHANGELOG.md` / `docs/SESSION_SUMMARY.md` の雛形を作成（TODO P0）。
- build: Next.js 16.2.6（App Router / TypeScript）プロジェクトを静的エクスポート構成で作成。
- feat: `next.config.ts` に静的エクスポート設定（`output: 'export'`、`images.unoptimized`、`trailingSlash`）と、`NEXT_PUBLIC_BASE_PATH` による `basePath`/`assetPrefix` の環境変数注入を実装。
- feat: `src/lib/config.ts` に basePath 連結ユーティリティ（`joinBasePath` / `withBasePath`）を追加。
- feat: Tailwind CSS v4 + shadcn/ui（base-nova）を初期化し、`Button` `Tabs` `Dialog` `DropdownMenu` `Tooltip` `Slider` `ContextMenu` `Sonner` `Resizable` `AlertDialog` を追加。
- feat: トップページを日本語の空状態 UI（ドロップゾーン枠）に差し替え。
- chore: ESLint（+ `eslint-config-prettier`）/ Prettier（+ tailwindcss プラグイン）/ TypeScript strict を整備。
- test: Vitest + React Testing Library（jsdom）基盤を導入し、`config` のユニットテストと `page` のコンポーネントテストを追加（10 件）。Playwright E2E 設定とスモークテストを追加。
- ci: GitHub Pages デプロイ用 GitHub Actions ワークフロー（`.github/workflows/deploy.yml`）を作成。
- chore: `.guardrails/config.yaml` にデプロイ先・ヘルス確認を定義。
- chore: ディレクトリ設計（`features/`・`lib/pdf/`・`store/`・`workers/`）を作成。

### Changed

- chore(deps): `pdfjs-dist` / `zustand` / `pdf-lib` を追加。`build`/`dev` 前に `copy:pdfjs` を実行。
- chore: `.gitignore` に `/public/pdfjs`（生成アセット）を追加。ESLint で `public/**` を除外。

- chore: `.gitignore` に `tmp/`・Playwright 成果物を追加。

### Fixed

- なし

### Removed

- なし

---

> エントリ追記の例:
>
> ```
> ## [Unreleased]
>
> ### Added
> - feat(viewer): PDF の D&D 読み込みとページ描画を実装
>
> ### Fixed
> - fix(editor): Undo 後にページ回転状態が復元されない不具合を修正
> ```
