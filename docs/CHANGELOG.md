# Changelog

このプロジェクトのすべての注目すべき変更を記録します。

- 形式は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) に準拠し、変更は [Conventional Commits](https://www.conventionalcommits.org/ja/) 形式で記述します。
- バージョニングは [Semantic Versioning](https://semver.org/lang/ja/) に従います。
- 各エントリは **Added（追加）/ Changed（変更）/ Fixed（修正）/ Removed（削除）** に分類します。

関連: [`docs/SPEC.md`](./SPEC.md)（仕様）/ [`docs/TODO.md`](./TODO.md)（実行計画）/ [`docs/SESSION_SUMMARY.md`](./SESSION_SUMMARY.md)（作業サマリ）

---

## [Unreleased]

### Added

- feat(thumbnail): 左ペインのサムネイルを独立して拡大縮小できるズームバー（−／％表示／＋、80〜280px・20px 刻み）を追加。ビュアーのページ表示ズーム・ブラウザ自体の拡大率とは独立に動作する。ファイル切替後も設定を保持。
- feat(zoom): Ctrl/⌘ + マウスホイールによるズームをカーソル位置でスコープ。左ペイン上ならサムネ幅、ビュアー上ならページ表示ズームが変化する（`useCtrlWheelZoom`：`{ passive: false }` のネイティブ wheel リスナでブラウザ標準ズームを抑止）。両領域外では従来どおりブラウザのページズームが効く。
- feat(thumbnail): ビュアーの現在ページに追従してサムネ一覧が自動スクロール（`block: "nearest"`）。同期を `ThumbnailList` 側に集約し、ページ要素の ref マップで確実に追従。

### Changed

- feat(thumbnail): サムネの状態表示を刷新し「閲覧中ページ」と「選択中ページ（編集対象）」を視覚的に区別。閲覧中は青いリング（`ring-sky-500` + オフセット）＋ページ番号を青バッジで強調、選択中は primary の塗り＋枠＋右上のチェックアイコンで明示（従来は両者がともにリング表現で紛らわしかった）。
- feat(thumbnail): ビュアーのページ追従スクロールをスムーズスクロール（`scrollTo({ behavior: "smooth" })`）に変更。`prefers-reduced-motion: reduce` 設定時は即時スクロールにフォールバック。
- feat(zoom): ビュアーの Ctrl+ホイールズームを**カーソル位置中心**に変更（従来は左上基準で拡大縮小していた）。ズーム前のカーソル位置のコンテンツ内比率を記録し、再レイアウト直後（`useLayoutEffect`）に `scrollLeft/Top` を補正してカーソル下の点を固定する。
- feat(thumbnail): サムネイルの拡大縮小範囲を **50%〜300%**（70〜420px、既定 140px=100%）に変更（従来 ~57%〜200%）。
- feat(viewer): PDF 読込直後の初期表示倍率を**等倍（100%）**に変更（既定 `fitMode` を `width`→`actual`）。従来は幅フィットのため小さめのページで ~350% 表示になっていた。フィット表示は操作で切替可能。
- feat(thumbnail): ビュアーのページ位置へのサムネ追従を、表示範囲外なら中央へ寄せ・可視時は動かさない方式へ堅牢化（純関数 `followScrollDelta` で算出。`scrollIntoView({block:"nearest"})` の無動作ケースを解消）。

### Fixed

- fix(viewer): 連続表示でビュアーをスクロールしても現在ページ番号が更新されない不具合を修正。`baseDims` 解決後にマウントされるページ枠が IntersectionObserver に観測されていなかった（observer 生成 effect が再実行されず空観測のままだった）。observer を一度だけ生成し、各ページの ref コールバックで `observe`/`unobserve` する方式に変更（後からマウントするページも確実に観測）。Playwright で再現→修正を確認。
- fix(layout): PDF 読込後に編集ツールバー等のクリックが妨害される不具合を修正。pdf.js の TextLayer が計測用 `<canvas class="hiddenCanvasElement">` を `document.body` へ append するため、`<body>` を flex/overflow コンテナにしていると当該 canvas がアプリの flex 兄弟となりレイアウトを乱していた。アプリを専用ラッパ div に閉じ込め、`<body>` は単純なブロック（はみ出しは clip）にして解消。
- fix(zoom): 左ペインのサムネ上で Ctrl+ホイールするとブラウザ画面全体が拡大縮小されていた問題を修正。`useCtrlWheelZoom` を **ref コールバック方式**に変更し、遅延マウントされる base-ui `Tabs.Panel`（`keepMounted=false` 既定）内でも要素マウント時に確実に非 passive リスナを張るようにした（従来は `useEffect` 実行時に `ref.current` が未確定でリスナ未登録だった）。
- fix(layout): 左ペイン（サムネイル／しおり）とビュアーのスクロールを完全に独立化。`<body>` が `min-h-full`（最小高）でコンテンツに応じて伸び、ページ全体が一体スクロールしていた問題を、`h-full overflow-hidden` でビューポート高に固定して解消。各ペインの `min-h-0 flex-1 overflow-auto` が個別に効くようになった。

### Added

<!-- P8 仕上げ・公開 -->

- feat(theme): ライト/ダーク/システム追従テーマ（next-themes）。TopBar・空状態にトグル、Sonner と連動。
- feat(a11y): 主要領域の aria-label、フォーカスリング、ショートカット中心のキーボード操作。
- feat(error): 破損 PDF・パスワード保護 PDF を読込時にトースト通知し空状態へ復帰（非対応操作は UI で無効化）。
- docs: README（使い方・ショートカット・ブラウザ別対応表・既知の制限・計測値）を整備。
- test(e2e): 通しシナリオ（読込→回転→削除→保存→ダウンロードを pdf-lib で再読込検証）を **Chrome / Firefox** で実行。破損 PDF のエラートースト E2E を追加。

<!-- P7 性能・大規模対策（基礎） -->

- feat(perf): 計測基盤（`measure`／`readMemory`）と推奨上限 `limits`（約500ページ/約50MB）を追加。空状態に上限を明示し、読込/結合で超過時に警告トースト。
- feat(perf): ページ/サムネの仮想化（`useVisible` 双方向 IntersectionObserver）。可視範囲＋前後のみ描画し、離れた canvas をアンマウントして破棄。
- feat(perf): 重い保存ビルドを Web Worker（`pdf-build.worker` + `runBuild`、Transferable 返却）へ隔離。非対応時は本スレッドへフォールバック。`buildPdf` に `onProgress`/`signal` を追加。
- feat(perf): 進捗オーバーレイ（`ProgressOverlay` + `progress-store`）とキャンセルを保存処理に配線。
- test(perf): metrics/limits の unit、200p ビルドの簡易ベンチ（≈70ms・進捗・Abort）を追加。

<!-- P6 しおり表示 -->

- feat(bookmark): pdf.js のアウトラインを解決済みツリーへ変換する `buildOutline`（名前付き/明示 dest → ページ解決）を追加。
- feat(bookmark): 左ペイン「しおり」タブに再帰ツリー（開閉）と空状態を実装。クリックで該当ページへジャンプ（sourceIndex→現在の表示位置にマップ）。
- test(bookmark): ツリー構造・dest 解決（mock）、実 PDF のアウトライン有/無（node 統合）と、ツリー表示・ジャンプ・空状態の Chromium E2E を追加。

<!-- P5 テキスト検索・選択 -->

- feat(search): pdf.js テキストレイヤをメインビューアに重畳（`renderTextLayer`・`PdfPageView`）。ネイティブ選択・コピーと「全選択」ボタンに対応。
- feat(search): 検索バー（Ctrl+F）を追加。純関数 `findMatches`／`getPageText` でヒット件数（現在/総数）・前後移動・ページジャンプ、テキストレイヤへの `<mark>` ハイライト。
- feat(search): TopBar に「検索」「全選択」、`search-store`（Zustand）を追加。
- test(search): ヒット件数・位置・全文抽出（node 統合）、ハイライト DOM（jsdom）の unit と、選択・検索の Chromium E2E を追加。

<!-- P4 保存層 -->

- feat(save): `SaveStrategy` 抽象と能力判定（`createSaveStrategy`/`isFileSystemAccessSupported`）を追加。Chromium は File System Access（名前を付けて保存・上書き保存）、Firefox は `<a download>` フォールバック。
- feat(save): TopBar に保存メニュー（名前を付けて保存 / 上書き保存（能力依存・無効化明示）/ 分割して保存）と Ctrl/Cmd+S を追加。
- feat(editor): `fileHandle` / `savedAppliedLength` / `markSaved` を追加し、保存後に未保存フラグをクリア（`isDirty` を保存時点との比較に変更）。
- refactor(editor): 抽出・分割の出力を保存層（能力判定）経由に統一（P3 の暫定ダウンロードを置換）。
- test(save): 能力判定の分岐・保存バイトの再読込妥当性・FS Access 書込/上書き・ダウンロード経路の unit と、Firefox フォールバックでのダウンロード発火 E2E を追加。

<!-- P3 編集機能 -->

- feat(editor): pdf-lib 実出力ビルダ `buildPdf` / `extractPages` / `splitPdf`（並び替え・回転・削除・抽出・分割・結合の実バイト生成）を実装。
- feat(editor): 編集ツールバー（回転左右・削除・抽出・分割・結合）と右クリック ContextMenu を追加。選択時のみ活性。削除は AlertDialog で確定（Undo 可）。
- feat(editor): `@dnd-kit` によるサムネイル D&D 並び替え（ドラッグハンドル）→ `reorder` 操作。
- feat(viewer): 複数ソース描画（`PdfSourcesContext`: sourceId→proxy/bytes）と回転反映（`renderPageToCanvas` に rotation）。サムネ・メインビューアを派生ページ駆動に刷新。
- feat(editor): 抽出/分割は生成 PDF をダウンロード（P4 で保存層へ置換予定）。結合は別ファイルをソース追加し `merge` 操作で取り込み。
- test(editor): pdf-lib 実出力の検証 unit（並び順・回転角・ページ数・抽出・分割境界・結合、計 8 件、ページ幅で同定）と、回転/削除/Undo の Chromium E2E を追加。

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

- chore(deps): `@types/wicg-file-system-access`（File System Access の型）を追加。
- chore(deps): `@dnd-kit/core` / `@dnd-kit/sortable` / `@dnd-kit/utilities` を追加。
- refactor(viewer): 単一プロキシ前提を廃止し、複数ソース（sourceId→proxy）描画へ刷新（`pdf-document-context` を `pdf-sources-context` に置換）。
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
