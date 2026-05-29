# Changelog

このプロジェクトのすべての注目すべき変更を記録します。

- 形式は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) に準拠し、変更は [Conventional Commits](https://www.conventionalcommits.org/ja/) 形式で記述します。
- バージョニングは [Semantic Versioning](https://semver.org/lang/ja/) に従います。
- 各エントリは **Added（追加）/ Changed（変更）/ Fixed（修正）/ Removed（削除）** に分類します。

関連: [`docs/SPEC.md`](./SPEC.md)（仕様）/ [`docs/TODO.md`](./TODO.md)（実行計画）/ [`docs/SESSION_SUMMARY.md`](./SESSION_SUMMARY.md)（作業サマリ）

---

## [Unreleased]

### Added

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
