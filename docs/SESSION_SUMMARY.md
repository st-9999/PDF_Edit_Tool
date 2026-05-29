# Session Summary

セッションごとの作業サマリを **新しいものを上に** 追記します。各エントリは以下のセクションを必ず含めます。

- **実施内容** — 何を実装・変更したか
- **作成ファイル** — 新規作成したファイル一覧
- **変更ファイル** — 既存ファイルへの変更（ある場合）
- **計測結果** — ビルド結果、テスト通過数、マイグレーション結果など数値で報告
- **Risks/TODO** — 既知の制約事項、未対応事項、本番デプロイ前に必要な作業、環境変数の設定要件など。なければ「なし」と明記
- **次ステップ** — 次に着手すべき作業

関連: [`docs/SPEC.md`](./SPEC.md) / [`docs/TODO.md`](./TODO.md) / [`docs/CHANGELOG.md`](./CHANGELOG.md)

---

## 2026-05-29 — P7 性能・大規模対策（基礎）

### 実施内容

- **計測基盤**: `lib/perf/metrics.ts`（`measure(label, fn)` で所要時間、`readMemory()` で Chromium `performance.memory` をガード付き取得）。簡易ベンチは `build.perf.test`（200p ビルドの ms を記録）。
- **推奨上限・警告**: `lib/perf/limits.ts`（`RECOMMENDED_MAX_PAGES=500` / `RECOMMENDED_MAX_BYTES=50MB`、`checkLimits` 純関数）。空状態に上限を明示し、読込（ページ数/サイズ）・結合（合計ページ）で超過時に警告トースト。
- **仮想化**: `useVisible`（双方向 IntersectionObserver、rootMargin で前後バッファ）に切替。連続表示ページとサムネは可視範囲＋前後のみ描画し、離れると canvas をアンマウントして破棄（メモリ抑制）。旧 `useInView`（一度きり）は削除。
- **Worker 隔離**: `workers/pdf-build.worker.ts` で保存用 `buildPdf` を UI スレッドから隔離（進捗通知、結果は Transferable）。`lib/pdf/build-runner.ts` の `runBuild` が Worker を試行し、非対応/失敗時は本スレッド `buildPdf` にフォールバック。`buildPdf` に `onProgress`/`signal`（Abort）を追加。
- **進捗＋キャンセル**: `progress-store` + `ProgressOverlay`（バー＋キャンセル）を保存ビルドに配線。キャンセルは AbortController（本スレッド）/ worker 終了で実現。

### 作成ファイル

- `src/lib/perf/{metrics,limits}.ts` + `metrics.test.ts`、`src/lib/editor/build.perf.test.ts`
- `src/lib/hooks/use-visible.ts`、`src/workers/pdf-build.worker.ts`、`src/lib/pdf/build-runner.ts`
- `src/store/progress-store.ts`、`src/features/progress/progress-overlay.tsx`

### 変更ファイル

- `src/lib/editor/build.ts`（`BuildOptions` onProgress/signal）、`src/features/save/use-save.ts`（runBuild + 進捗 + Abort 処理）
- `src/features/viewer/{thumbnail,page-viewer}.tsx`（`useVisible` 仮想化）、`viewer-layout.tsx`（ProgressOverlay・超過警告）、`empty-state.tsx`（上限明示）、`features/editor/use-edit-actions.ts`（結合時警告）
- `src/lib/hooks/use-in-view.ts` を削除（`use-visible` に置換）
- `docs/CHANGELOG.md` / `docs/TODO.md`

### 計測結果

- **ベンチ**: buildPdf 200 ページ ≈ **70ms**（node）。500 ページでも数百 ms 想定 → 推奨上限「約500ページ」は build 面で十分快適。
- **テスト**: Vitest **100 件**全通過（16 ファイル。perf/limits 6・build.perf 2 を追加）。Playwright E2E（Chromium）**8 件**全通過（仮想化下でも描画・保存＝Worker 経路が機能）。`lint`/`tsc`/`prettier --check` クリーン。
- **ビルド**: 静的エクスポート成功。**Worker チャンクが out/\_next に emit**（Turbopack が `new Worker(new URL(...))` をバンドル）。初期 JS raw 697.1KB / gzip 208.7KB（ほぼ横ばい）。

### Risks/TODO

- 仮想化の **LRU キャッシュは未導入**。可視範囲外へ出た canvas は破棄、再入時は再描画（rootMargin バッファで緩和）。本格 LRU は v2。
- Worker への入力（ソースバイト列）は構造化クローン（コピー）で渡し、**結果のみ Transferable**。入力も Transferable 化するとメインの再保存用バイトが detach されるため意図的にクローン。メモリ最適化（バイトを worker 常駐）は v2。
- 「中規模 PDF の初回**描画**時間・メモリ」（ブラウザ実測）は計測基盤を整備済みだが formal 計測は未実施（render は仮想化で可視分のみ）。`performance.memory` ロガーで今後取得可能。
- 上限超過の警告はトースト。事前見積り（時間/メモリ）提示は未実装（v2）。

### 次ステップ

- TODO P8「仕上げ・公開」: ライト/ダークテーマ、アクセシビリティ（キーボード/フォーカス）、破損/パスワード PDF のエラートースト、Chrome/Firefox の通し E2E、最終バンドル/Lighthouse 計測、README、（公開はユーザー判断）。

---

## 2026-05-29 — P6 しおり表示

### 実施内容

- **アウトライン読取・解決**: `lib/pdf/outline.ts` に `buildOutline(source)` を実装。pdf.js の `getOutline` → 各項目の dest（名前付きは `getDestination`、明示は配列）を `getPageIndex` で 0 始まりページに解決し、`OutlineNode` ツリー（id/title/sourceIndex/children）を構築。テスト容易性のため必要メソッドだけの `OutlineSource` 型で受ける。
- **しおり UI**: `BookmarkPanel` ＋ 再帰 `TreeItem`（開閉トグル）。左ペイン「しおり」タブに表示。元ソース（`editor-store.sourceId`）のアウトラインを読み込み、クリック時に `sourceIndex` を現在の表示ページ列（`pages`）の位置へマップして `requestPage`（編集で並びが変わっても正しいページへ）。解決不能な項目は無効化。
- **空状態**: アウトラインが無い PDF では「しおり（アウトライン）がありません」を表示。

### 作成ファイル

- `src/lib/pdf/outline.ts` + `outline.test.ts`
- `src/features/bookmark/bookmark-panel.tsx`
- `e2e/bookmark.spec.ts`

### 変更ファイル

- `src/features/viewer/left-pane.tsx`（しおりタブに `BookmarkPanel` を配線）
- `docs/CHANGELOG.md` / `docs/TODO.md`

### 計測結果

- **テスト**: Vitest **92 件**全通過（14 ファイル。outline 5 件＝mock のツリー/解決・dest なし・実 PDF のアウトライン有無を含む）。Playwright E2E（Chromium）**8 件**全通過（＋しおりツリー表示・ジャンプ＝ページ番号 3 / 空状態）。`lint`/`tsc`/`prettier --check` クリーン。
- **ビルド**: 静的エクスポート成功。初期 JS raw 696.7KB / gzip 208.4KB（P5 から変化なし＝しおりも遅延ビューアチャンク内）。

### Risks/TODO

- しおりは元ソース（最初に開いた文書）のアウトラインのみ表示。結合した別ソースのしおりは未統合（v2 のしおり編集と併せて検討）。
- ジャンプは `sourceIndex` を現在の表示位置へマップ。該当ページが削除済みなら無効（クリックしても移動しない）。
- v1 は閲覧のみ。しおりの追加・リネーム・階層変更・Outline 書き戻しは v2。

### 次ステップ

- TODO P7「性能・大規模対策（基礎）」: 計測基盤（`performance.memory` ロガー・CI 簡易ベンチ）、ページ/サムネ仮想化、重い処理の Web Worker 隔離、進捗＋キャンセル、推奨上限の UI 明示。

---

## 2026-05-29 — P5 テキスト検索・選択

### 実施内容

- **検索エンジン（純関数）**: `findMatches(pageTexts, query)`（大小無視・非重複・ヒット位置）と `getPageText(page)`（テキスト抽出）を `lib/search/search.ts` に実装。
- **テキストレイヤ重畳**: `render.ts` に `renderTextLayer` を追加（pdf.js `TextLayer`、canvas と同一 viewport）。`PdfPageView`（canvas＋テキストレイヤ）を新設しメインビューアの単/連続表示で使用。`--total-scale-factor` を表示スケールに設定し、textLayer CSS を `globals.css` に追加。ネイティブ選択・コピー対応。
- **検索 UI**: `search-store`（open/query/matches/activeIndex）＋ `SearchBar`（Ctrl+F、ヒット件数（現在/総数）、前後移動でページジャンプ、Esc で閉じる）。ハイライトは `applyHighlights`（テキストレイヤ span 内の出現を `<mark class="search-hit">` で囲み、現在位置を強調・スクロール）。
- **全選択**: TopBar に「検索」「全選択」ボタン。全選択はビューアスクロール領域のテキストを Selection API で選択（描画済みページ対象）。

### 作成ファイル

- `src/lib/search/{search.ts,highlight.ts}` + 各 `.test.ts`
- `src/store/search-store.ts`、`src/features/search/search-bar.tsx`、`src/features/viewer/pdf-page-view.tsx`
- `e2e/search.spec.ts`

### 変更ファイル

- `src/lib/pdf/render.ts`（viewport 返却・`renderTextLayer`）、`src/features/viewer/page-viewer.tsx`（`PdfPageView` 採用・検索ハイライト配線・`data-viewer-scroll`）
- `src/features/viewer/viewer-layout.tsx`（SearchBar 配置）、`src/features/viewer/top-bar.tsx`（検索/全選択）、`src/app/globals.css`（textLayer CSS）

### 計測結果

- **テスト**: Vitest **87 件**全通過（13 ファイル。search 4 / highlight 3 を追加）。Playwright E2E（Chromium）**6 件**全通過（＋テキスト選択・全選択・検索ハイライト・前後移動）。`lint`/`tsc`/`prettier --check` クリーン。
- **ビルド**: 静的エクスポート成功。初期 JS raw 696.7KB / gzip 208.4KB（P4 から変化なし＝検索/テキストレイヤも遅延ビューアチャンク内）。

### Risks/TODO

- ハイライトは「1 つのテキスト span 内の出現」のみ対象（item をまたぐ一致は未ハイライト）。検索件数も span 連結後のページ文字列基準のため、稀にハイライトと件数が不一致になりうる。高度化（正規表現・ページ横断・item またぎ）は v2。
- 「全選択」は描画済み（可視）ページのテキストのみ選択（連続表示の遅延描画のため）。全ページ確実な全選択は仮想化方針（P7）と併せて検討。
- テキストレイヤは表示中ページに対して描画。大量ページでの常時重畳コストは P7 の仮想化で最適化。

### 次ステップ

- TODO P6「しおり表示」: pdf.js アウトライン読取、左ペイン「しおり」タブのツリー表示・ジャンプ、空状態。

---

## 2026-05-29 — P4 保存層

### 実施内容

- **保存抽象 `SaveStrategy`**（`lib/save/strategy.ts`）: `kind`/`canOverwrite`/`saveAs`/`overwrite`。`createSaveStrategy()` が `window.showSaveFilePicker` の有無で実装を選択。
  - `FileSystemAccessStrategy`（Chromium）: `showSaveFilePicker` で保存先指定→`createWritable` ストリームへ直接書込。返却ハンドルを保持し `overwrite` で再書込（上書き保存）。
  - `DownloadStrategy`（Firefox 等）: `<a download>` フォールバック。`canOverwrite=false`、`overwrite` は例外。
- **未保存フラグ**: editor-store に `savedAppliedLength`/`fileHandle`/`markSaved` を追加。`isDirty` を「保存時点の適用済み操作数との差」に変更。保存成功で `markSaved`（フラグクリア＋ハンドル保持）。
- **保存 UI**: TopBar に保存メニュー（名前を付けて保存／上書き保存（FS Access かつハンドルあり時のみ活性・無効時は「Chrome/Edge のみ」明示）／分割して保存）。Ctrl/Cmd+S は「ハンドルがあれば上書き、無ければ名前を付けて保存」。
- **統一**: P3 で暫定ダウンロードだった抽出・分割を保存層（能力判定）経由に統一（`useSave` の `saveExtract`/`saveSplit`）。分割は複数ファイルを順次保存（キャンセルで中断）。

### 作成ファイル

- `src/lib/save/strategy.ts` + `strategy.test.ts`
- `src/features/save/{use-save.ts,save-menu.tsx}`
- `e2e/save.spec.ts`

### 変更ファイル

- `src/store/editor-store.ts`（保存状態・isDirty）+ `editor-store.test.ts`（markSaved テスト）
- `src/features/editor/use-edit-actions.ts`（抽出/分割を useSave へ委譲）、`src/features/viewer/top-bar.tsx`（保存メニュー）
- `package.json`（`@types/wicg-file-system-access`）、`docs/CHANGELOG.md` / `docs/TODO.md`

### 計測結果

- **テスト**: Vitest **80 件**全通過（11 ファイル。save strategy 6 件＝能力判定分岐・保存バイト再読込妥当性・FS書込/上書き/ダウンロード、editor-store に markSaved 1 件）。Playwright E2E（Chromium）**5 件**全通過（＋Firefox フォールバックのダウンロード発火）。`lint`/`tsc`/`prettier --check` クリーン。
- **ビルド**: 静的エクスポート成功。初期 JS raw 696.7KB / gzip 208.4KB（P3 から変化なし＝保存層も遅延ビューアチャンク内）。

### Risks/TODO

- 「元ファイルへの上書き保存」は、保存/オープンで取得したハンドルがある場合に有効。現状の読込は D&D / `<input>` 経由でハンドルを持たないため、初回は「名前を付けて保存」が必要（その後は上書き可）。showOpenFilePicker / DataTransfer ハンドル取得での「開いた元ファイルへ直接上書き」は将来拡張。
- pdf-lib は全体をシリアライズするため、真のストリーミング書き出しは未対応（出力は一括 write）。大規模は P7/v2（操作ログ＋遅延適用・ページ単位ストリーム）。
- FS Access の保存ダイアログはネイティブ UI のため自動 E2E 不可。Chromium 経路は unit（モック）で担保、ダウンロード経路を E2E で担保。

### 次ステップ

- TODO P5「テキスト検索・選択」: pdf.js テキストレイヤ重畳、部分/全選択・コピー、検索バー（Ctrl+F・ハイライト・ヒット件数・前後移動）。

---

## 2026-05-29 — P3 編集機能

### 実施内容

- **pdf-lib 実出力ビルダ**（`lib/editor/build.ts`）: `buildPdf(sources, pages)` を中核に、`extractPages`（部分集合）・`splitPdf`（境界分割）。各ページを元ドキュメントからコピーし、ユーザー回転を元の回転に加算して `/Rotate` に反映。並び替え・削除・結合はすべて「PageRef 列からのビルド」に帰着。
- **多ソース描画への刷新**: 単一プロキシ前提を廃し、`PdfSourcesContext`（sourceId→pdf.js proxy/bytes、`addSource`）を導入。結合した別ファイルのページも正しく描画。サムネ・メインビューアを editor-store の派生ページ駆動に変更。
- **回転反映**: `renderPageToCanvas` に rotation を追加（`getViewport({rotation: page.rotate + delta})`）。サムネ・メイン双方に反映。回転 90/270 でボックス寸法を入替表示。
- **並び替え**: `@dnd-kit`（core/sortable/utilities）でサムネをドラッグハンドル D&D → `reorder` 操作発行。
- **編集 UI**: ページ操作ツールバー（左右回転・削除・抽出・分割・結合）＋右クリック ContextMenu。回転/削除/抽出/分割は選択時のみ活性、結合は常時。削除は AlertDialog で確定（Undo 可）。
- **抽出/分割**: 生成 PDF を `downloadBytes`（暫定）でダウンロード。**結合**は別ファイルをソース追加し `merge` 操作で取り込み（順序はサムネ D&D で調整）。

### 作成ファイル

- `src/lib/editor/build.ts` + `build.test.ts`、`src/lib/download.ts`
- `src/features/viewer/pdf-sources-context.tsx`
- `src/features/editor/{use-edit-actions.ts,edit-toolbar.tsx}`
- `e2e/edit.spec.ts`

### 変更ファイル

- `src/lib/pdf/render.ts`（rotation）、`src/features/viewer/{pdf-page-canvas,thumbnail,thumbnail-list,page-viewer,viewer-layout}.tsx`（多ソース＋回転＋D&D＋ContextMenu）
- `src/features/viewer/pdf-document-context.tsx` を削除（`pdf-sources-context` に置換）
- `package.json`（@dnd-kit 追加）、`e2e/editor.spec.ts`（exact 指定）、`docs/CHANGELOG.md` / `docs/TODO.md`

### 計測結果

- **テスト**: Vitest **73 件**全通過（10 ファイル、うち build 8 件は pdf-lib 実出力をページ幅・`/Rotate`・ページ数で検証）。Playwright E2E（Chromium）**4 件**全通過（空状態 / ビューア / 選択・Undo / 回転・削除・Undo）。`lint`/`tsc`/`prettier --check` クリーン。
- **ビルド**: 静的エクスポート成功。初期 JS raw 696.7KB / gzip 208.4KB（P2 から実質変化なし＝編集・pdf-lib・dnd-kit は遅延ビューアチャンク内）。全 `_next` チャンク raw 約 1847KB。

### Risks/TODO

- **保存層は P4**: 抽出/分割は暫定で `<a download>`。File System Access API による保存先指定／上書き保存は P4 で `SaveStrategy` 抽象として実装し、置き換える。
- 「半透明プレビュー→確定」は簡略化（選択ハイライト＋AlertDialog 確認、Undo で復帰）。本格的なプレビュー表示は将来検討。
- 連続表示のページ寸法は先頭ページ基準の均一近似（回転は入替反映）。サイズ可変 PDF・仮想化は P7。
- D&D は単一ページ移動（複数選択の一括移動は将来）。E2E は D&D を含めず（unit reorder + store で担保）。
- パスワード保護 PDF 等の異常系トーストは P8 で拡充。

### 次ステップ

- TODO P4「保存層」: `SaveStrategy` 抽象、`window.showSaveFilePicker` 能力判定、Chromium の File System Access（名前を付けて保存／上書き）、Firefox ダウンロードフォールバック、分割の順次保存、保存後の未保存フラグクリア。

---

## 2026-05-29 — P2 編集コア + Undo/Redo（★設計の要）

### 実施内容

- **操作ログ（コマンド）方式の編集モデル**を設計・実装。元バイト列は変更せず、ページ状態を `PageRef`（id/sourceId/sourceIndex/rotation）の列で表現。`EditOperation`＝`reorder`/`rotate`/`delete`/`merge`。
- **派生計算** `derivePages(initial, ops)`：初期ページ列に操作ログを畳み込んで現在状態を導出（純関数）。
- **Undo/Redo**：履歴を `{initial, applied, undone}` で保持し、毎回 initial+applied から replay する可逆設計（per-command inverse 不要）。
- **複数選択モデル**（純関数 `selection.ts`）：単一 / Ctrl トグル / Shift 範囲 / 全選択 / クリア。anchor 管理。
- **editor-store（Zustand）**：document/history/selection を統合。`initDocument`/`reset`、`reorder`/`rotateSelected`/`deleteSelected`/`mergePages`、`undo`/`redo`、選択アクション、セレクタ（canUndo/canRedo/isDirty/selectedCount）。
- **配線**：TopBar に Undo/Redo ボタン、StatusBar に未保存 ● 表示、`beforeunload` ガード、Ctrl/Cmd+Z・Ctrl+Y/Shift+Z ショートカット（入力中は無効）。サムネイルをクリック/Ctrl/Shift で複数選択＋ハイライト。読み込み時に `initDocument`、クローズ時に `reset`。
- **設計判断**：`extract`/`split` は「現在状態を変えず新規 PDF を出力する」エクスポート操作のため、Undo/Redo 対象の操作ログには含めず P3/P4 で純関数実装する。

### 作成ファイル

- `src/lib/editor/{operations,history,selection}.ts` + 各 `.test.ts`
- `src/store/editor-store.ts` + `editor-store.test.ts`
- `src/lib/id.ts`、`src/lib/hooks/{use-unsaved-guard,use-editor-shortcuts}.ts`
- `e2e/editor.spec.ts`

### 変更ファイル

- `src/features/viewer/{top-bar,status-bar,thumbnail,thumbnail-list,viewer-layout}.tsx`（Undo/Redo・未保存・選択・初期化配線）
- `docs/CHANGELOG.md` / `docs/TODO.md`

### 計測結果

- **テスト**: Vitest **65 件**全通過（9 ファイル：operations 13 / history 6 / selection 8 / editor-store 7 / 既存 31）。Playwright E2E（Chromium）**3 件**全通過（空状態 / 実 PDF ビューア / 選択・Undo 配線）。`lint` / `tsc` / `prettier --check` クリーン。
- **ビルド**: 静的エクスポート成功。初期 JS raw 696KB / gzip 208KB（P1 から変化なし＝編集ロジックは遅延ビューアチャンク内）。

### Risks/TODO

- 編集操作を発行する UI（回転/削除ボタン・D&D 並び替え・コンテキストメニュー・半透明削除プレビュー）と pdf-lib による実出力は **P3**。本フェーズはエンジン＋配線まで。
- ビューア本体（メイン描画）はまだ派生ページ（並び替え/回転/削除）を反映しない。P3 で derivePages を描画にも適用する。
- 未保存判定は `applied.length>0`。保存（P4）後にクリアする「保存済みマーカー」は P4 で追加。
- 連続表示はページ均一サイズ近似のまま（仮想化は P7）。

### 次ステップ

- TODO P3「編集機能」: `dnd-kit` 並び替え、回転/削除 UI（サムネ反映）、pdf-lib による抽出/分割/結合の実出力と検証テスト、ContextMenu、選択時のツールバー活性制御。

---

## 2026-05-29 — P1 ビューア基盤

### 実施内容

- **pdf.js 基盤**: `pdfjs-dist` を直接利用。worker / CMap / 標準フォント / wasm を `scripts/copy-pdfjs-assets.mjs` で `public/pdfjs/` にコピーし、`withBasePath` 経由で参照（静的エクスポート + basePath 対応）。pdfjs は SSR 回避のためクライアントで遅延 import。
- **状態管理**: Zustand の viewer ストアを構築（file/numPages/currentPage/zoom/fitMode/viewMode/status/leftTab + スクロール要求 navSeq）。純関数 `clampPage` / `clampZoom` を分離。
- **読込**: D&D + ファイル選択の空状態 UI、PDF バイト列からのロード・メタ（ページ数/タイトル）取得、破損/パスワード PDF のトースト通知。
- **ビューア**: メインページ描画（HiDPI・レンダータスクキャンセル）、ページ送り（◀ N/Total ▶・番号入力ジャンプ）、ズーム（スライダー + % 入力 + 幅合わせ/全体表示）、単ページ / 連続スクロール切替。連続表示は IntersectionObserver で遅延描画＋スクロール↔現在ページ同期。
- **左ペイン**: `Tabs`（サムネイル / しおり枠）、サムネイル一覧（遅延・低解像度生成、クリックでジャンプ、選択ハイライト）。`Resizable` で幅可変。
- **ステータスバー**: 総ページ数・ファイルサイズ・処理状況。
- **最適化**: ビューア本体を `next/dynamic` で分離し初期バンドル削減。

### 作成ファイル

- `scripts/copy-pdfjs-assets.mjs`
- `src/lib/pdf/{constants,pdfjs,document,render}.ts`、`src/lib/format.ts`、`src/lib/hooks/{use-in-view,use-element-size}.ts`
- `src/store/viewer-store.ts`
- `src/features/viewer/{pdf-document-context,pdf-page-canvas,empty-state,top-bar,status-bar,zoom 関連を含む page-viewer,thumbnail,thumbnail-list,left-pane,viewer-layout,viewer-app}.tsx`
- テスト: `src/store/viewer-store.test.ts`、`src/lib/format.test.ts`、`src/lib/pdf/document.node.test.ts`、`src/features/viewer/empty-state.test.tsx`、`e2e/viewer.spec.ts`
- shadcn 追加: `input` / `toggle` / `scroll-area` / `separator`

### 変更ファイル

- `src/app/page.tsx`（ViewerApp 表示）、`src/app/layout.tsx`（Sonner Toaster 追加）
- `package.json`（deps 追加・`copy:pdfjs`/`predev`/`prebuild`）、`.gitignore`（`/public/pdfjs`）、`eslint.config.mjs`（`public/**` 除外）
- `e2e/home.spec.ts`（空状態に合わせ更新）、`docs/CHANGELOG.md` / `docs/TODO.md`

### 計測結果

- **ビルド**: `next build`（静的エクスポート）成功、4 ページ静的生成。コンパイル 2.3s + 型チェック 2.5s。
- **バンドル**: 初期 JS（index.html 参照分）raw 696KB / gzip 208KB（P0 比 +約 27KB gzip）。全 `_next` チャンク raw 約 1238KB。pdf.js（約 434KB チャンク）とビューア本体は遅延ロードで初期非搭載。
- **テスト**: Vitest 31 件すべて通過（5 ファイル）。Playwright E2E（Chromium）2 件通過（空状態表示 / 実 PDF 5p をロード→描画→ページ送り→番号ジャンプ）。`lint` / `tsc` / `prettier --check` エラーなし。
- pdf.js による PDF ロード解析を Node 統合テストで検証（ページ数・メタ取得）。

### Risks/TODO

- **中規模 PDF（数百ページ/数十MB）の formal な初回描画時間・メモリ計測は未実施** → P7「計測基盤（`performance.memory` ロガー）」で実施予定。基本描画パイプラインは E2E(5p) で確認済み。
- 連続表示はページサイズ均一を仮定（1 ページ目基準でボックス寸法を算出）。サイズ可変 PDF では概算。仮想化（離れた canvas 破棄/LRU）は P7。
- パスワード保護 PDF は P1 では未対応（トースト表示のみ）。本格対応は P8。
- Playwright は Chromium のみ実行（Firefox 系は browser 未インストール）。`npx playwright install firefox` で追加可能。
- `text-muted-foreground` 等の shadcn テーマトークン使用。ダーク/ライトテーマ切替は P8。

### 次ステップ

- TODO P2「編集コア + Undo/Redo」: 操作ログ（コマンド）方式の編集モデル、派生状態計算、Undo/Redo スタック、複数選択モデル、未保存ガード、ショートカット。

---

## 2026-05-29 — P0 プロジェクト基盤構築

### 実施内容

- Next.js 16.2.6（App Router / TypeScript / `src/`）プロジェクトを作成し、既存の `docs/`・`Reference/`・`CLAUDE.md` を保持したままルートへ統合。
- 静的エクスポート設定（`output: 'export'`、`images.unoptimized`、`trailingSlash`）と、`NEXT_PUBLIC_BASE_PATH` 環境変数による `basePath`/`assetPrefix` 注入を実装（環境依存値のハードコード回避）。
- Tailwind CSS v4 + shadcn/ui（base-nova）を初期化し、P0 指定の 10 コンポーネントを追加（Button / Tabs / Dialog / DropdownMenu / Tooltip / Slider / ContextMenu / Sonner / Resizable / AlertDialog）。
- ESLint（+ Prettier 連携）/ Prettier（+ tailwindcss プラグイン）/ TypeScript strict を整備。
- テスト基盤（Vitest + React Testing Library + jsdom）を構築し、`config` のユニットテストと `page` のコンポーネントテストを追加。Playwright（Chromium/Firefox）E2E 設定とスモークテストを用意。
- ディレクトリ設計（`features/{viewer,editor,search,bookmark,save}`・`lib/pdf/`・`store/`・`workers/`）を作成。
- GitHub Pages デプロイ用 GitHub Actions（`.github/workflows/deploy.yml`）と `.guardrails/config.yaml` を作成（**ローカルのみ・未 push**）。
- トップページを日本語の空状態 UI（ドロップゾーン枠）に差し替え。
- ローカル git を初期化しコミット。

### 作成ファイル

- `next.config.ts`（書き換え）, `package.json`（書き換え）, `eslint.config.mjs`（更新）
- `.prettierrc.json`, `.prettierignore`, `vitest.config.ts`, `vitest.setup.ts`, `vitest.d.ts`, `playwright.config.ts`
- `src/lib/config.ts` + `src/lib/config.test.ts`, `src/app/page.test.tsx`
- `src/components/ui/*.tsx`（shadcn: 10 コンポーネント）, `src/lib/utils.ts`, `components.json`
- `src/features/*`・`src/lib/pdf/`・`src/store/`・`src/workers/`（`.gitkeep`）
- `e2e/home.spec.ts`, `.github/workflows/deploy.yml`, `.guardrails/config.yaml`
- `AGENTS.md`（create-next-app 生成）

### 変更ファイル

- `src/app/layout.tsx`（メタ情報・`lang="ja"`・フォント変数整合）, `src/app/page.tsx`, `src/app/globals.css`（shadcn）
- `.gitignore`（`tmp/`・Playwright 成果物を追加）, `docs/CHANGELOG.md`, `docs/TODO.md`（P0 チェック）

### 計測結果

- **ビルド**: `next build`（静的エクスポート）成功。コンパイル 1.4s + 型チェック 2.0s、4 ページを静的生成。
- **バンドルサイズ（JS total）**: raw 612.2 KB / gzip 181.0 KB（`out/_next` の JS 9 ファイル）。`out/` 全体 1.1 MB。
- **テスト**: Vitest 10 件すべて通過（2 ファイル）。`tsc --noEmit` / `eslint` / `prettier --check` すべてエラーなし。
- **Lighthouse（ローカル `serve out`）**: Performance 97 / FCP 0.8s / **LCP 2.5s** / **CLS 0** / TBT 30ms / Speed Index 0.8s。

### Risks/TODO

- **GitHub push / Pages 公開は未実施**（ユーザー判断でローカル git 管理のみ）。公開時は (1) リポジトリ作成・push、(2) Pages を「GitHub Actions」ソースに設定、(3) `.guardrails/config.yaml` と公開 URL の確定（リポジトリ名 = `NEXT_PUBLIC_BASE_PATH`）が必要。
- Lighthouse の LCP 2.5s は圧縮・キャッシュ無しのローカル静的配信での値。CDN（Pages）配信後に再計測が必要。
- Playwright のブラウザバイナリ未インストール（`npx playwright install` が必要）。E2E は本セッションでは未実行。
- shadcn base-nova スタイルは `@base-ui/react` と `shadcn` パッケージへ依存（`globals.css` が `@import "shadcn/tailwind.css"`）。バンドルへの影響は P7 計測時に確認。
- 環境変数の秘密情報要件はなし（完全クライアント処理）。`NEXT_PUBLIC_BASE_PATH` のみビルド時に使用。

### 次ステップ

- TODO P1「ビューア基盤」に着手：`pdf.js`（react-pdf 等）導入と pdf.worker の静的配信設定、D&D 読込、ページ描画・送り、ズーム、サムネイル一覧。

---

## 2026-05-29 — ドキュメント雛形の整備

### 実施内容

- CLAUDE.md のドキュメント更新ルールに基づき、`docs/CHANGELOG.md` と `docs/SESSION_SUMMARY.md` の雛形を作成。
- 既存の `docs/SPEC.md`（仕様ドラフト v0.1）・`docs/TODO.md`（実行計画）と相互リンクを設定。
- これにより TODO P0 の「`docs/CHANGELOG.md` / `docs/SESSION_SUMMARY.md` 雛形作成」を完了。

### 作成ファイル

- `docs/CHANGELOG.md` — Keep a Changelog 形式の変更履歴（Added / Changed / Fixed / Removed）
- `docs/SESSION_SUMMARY.md` — 本ファイル（セッション作業サマリ）

### 変更ファイル

- なし

### 計測結果

- ビルド/テストの実装はまだ無いため計測対象なし（プロジェクト雛形は未作成、TODO P0 着手前）。

### Risks/TODO

- Next.js プロジェクト雛形（`output: 'export'`、`basePath`、Tailwind、shadcn/ui）が未作成。
- GitHub リポジトリ・GitHub Actions（Pages デプロイ）・`.guardrails/config.yaml` が未整備。
- 環境変数の設定要件は現時点でなし（完全クライアント処理のため、秘密情報を扱う予定なし）。

### 次ステップ

- TODO P0「プロジェクト基盤構築」に着手：Next.js（App Router / TypeScript）プロジェクト作成、静的エクスポート設定、Tailwind + shadcn/ui 初期化、テスト基盤（Vitest / Playwright）導入。
