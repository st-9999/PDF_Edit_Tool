# 実行計画 / TODO リスト — PDFビューア＆エディタ

> 元仕様: [`docs/SPEC.md`](./SPEC.md)（ドラフト v0.1）
> 最終更新: 2026-05-29
> 進め方: 各フェーズは **最小コミット（Conventional Commits）** で積み上げる。フェーズ完了ごとに計測値を記録し、`docs/CHANGELOG.md` / `docs/SESSION_SUMMARY.md` を更新する。
>
> 凡例: `[ ]` 未着手 / `[~]` 進行中 / `[x]` 完了 ／ **(v1)** MVP対象、**(v2)(v3)** 後続

---

## マイルストーン概要

| Phase | 目的                     | 主要成果物                                                |
| ----- | ------------------------ | --------------------------------------------------------- |
| P0    | プロジェクト基盤         | Next.js静的エクスポート + Tailwind + shadcn/ui + Pages CI |
| P1    | ビューア基盤             | PDF読込・描画・サムネ・ズーム・ページ送り                 |
| P2    | 編集コア + Undo/Redo     | 操作ログ方式の状態管理                                    |
| P3    | 編集機能                 | 並び替え・回転・削除・抽出/分割・結合                     |
| P4    | 保存層                   | 保存場所指定・上書き保存（能力判定フォールバック）        |
| P5    | テキスト検索・選択       | 検索ハイライト・部分/全選択・コピー                       |
| P6    | しおり表示               | 既存アウトラインのツリー表示・ジャンプ                    |
| P7    | 性能・大規模対策（基礎） | 計測基盤・ページ仮想化・Worker隔離                        |
| P8    | 仕上げ・公開             | E2E・アクセシビリティ・本番デプロイ確認                   |

---

## P0. プロジェクト基盤構築

- [x] Next.js（App Router, TypeScript）プロジェクト作成（Next 16.2.6 / React 19.2.4）
- [x] `next.config` で `output: 'export'`、`images.unoptimized: true`、`basePath`/`assetPrefix`（`NEXT_PUBLIC_BASE_PATH` 環境変数で注入）を設定
- [x] Tailwind CSS 導入・設定（v4）
- [x] shadcn/ui 初期化（`Button` `Tabs` `Dialog` `DropdownMenu` `Tooltip` `Slider` `ContextMenu` `Sonner` `Resizable` `AlertDialog` を追加）
- [x] ESLint / Prettier / TypeScript strict 設定
- [x] テスト基盤導入（Vitest + React Testing Library、E2EはPlaywright）
- [x] ディレクトリ設計（`features/`（viewer/editor/search/bookmark/save）、`lib/pdf/`、`store/`、`workers/`、`components/ui/`）
- [~] GitHub リポジトリ作成・初期 push（feature ブランチ運用） — **ローカル git 初期化・コミット済み。GitHub への push はユーザー判断で保留**
- [x] **GitHub Actions**: ビルド→`out/` を GitHub Pages へデプロイするワークフロー（`.github/workflows/deploy.yml` 作成・未 push）
- [x] `.guardrails/config.yaml` にデプロイ先・ヘルス確認を定義
- [x] `docs/CHANGELOG.md` / `docs/SESSION_SUMMARY.md` 雛形作成
- [x] **計測**: 初期バンドルサイズ（JS total）と Lighthouse（LCP/CLS）のベースライン取得 — JS 612KB(raw)/181KB(gzip)、Perf 97 / LCP 2.5s / CLS 0
- [~] **動作確認**: Pages にデプロイした空アプリが表示される（ヘルス確認） — **ローカル `serve out` で表示・Lighthouse 確認済み。Pages 公開は保留**

## P1. ビューア基盤 (v1)

- [x] `pdf.js`（pdfjs-dist 直接利用）導入、Worker/CMap/標準フォントを `public/pdfjs/` 配信（basePath 経由）で静的エクスポート対応
- [x] ファイル読込: D&Dゾーン + ファイル選択（初期の空状態UI）
- [x] PDFドキュメントのロード・解析（ページ数・メタ情報取得）
- [x] メインビューア: 選択ページの描画、ページ送り（◀ N/Total ▶）
- [x] ズーム（スライダー＋％入力＋幅合わせ/全体表示）
- [x] 連続スクロール / 単ページ送りの切替
- [x] 左ペイン: サムネイル一覧の描画（低解像度・遅延生成＝IntersectionObserver）
- [x] 左ペイン `Tabs`（サムネイル / しおり）の枠組み
- [x] ステータスバー（ページ数・ファイルサイズ・処理状況）
- [x] **テスト**: PDFロードでページ数が正しく取得される（pdf.js node 統合）/ ページ送り境界（先頭/末尾）/ ズーム値クランプ（store unit）/ 実描画 E2E（Chromium）
- [~] **計測**: 中規模PDF（数百ページ/数十MB）の初回描画時間・メモリ — **基本パイプラインは E2E(5p) で確認。formal な中規模計測は P7「計測基盤（performance.memory ロガー）」で実施予定**

## P2. 編集コア + Undo/Redo (v1) ★設計の要

- [x] **編集モデルを「操作ログ（コマンド）方式」で設計**（元バイト列は保持、変更は `PageRef` 列＋操作ログで表現）
  - 操作型: `reorder` / `rotate` / `delete` / `merge`（状態変化）。`extract` / `split` は**現状態を変えない出力操作**として P3/P4 で純関数実装
- [x] ページ状態の派生計算（`derivePages`: 操作ログ→現在のページ並び・回転。削除は配列から除去）
- [x] Undo/Redo スタック（initial+applied から都度導出する replay 方式で可逆）
- [x] Zustand ストア構築（`editor-store`: ドキュメント/履歴/選択/未保存）
- [x] 複数選択モデル（クリック / Shift範囲 / Ctrl個別＝純関数 `selection.ts`、サムネに配線）
- [x] 未保存インジケータ（ステータスバー ●）・`beforeunload` ガード
- [x] ショートカット（Ctrl/Cmd+Z = Undo / Ctrl+Y・Shift+Z = Redo、入力中は無効）
- [x] **テスト**: 各操作→Undo→元状態 / Redo→再適用 / 合成順序が派生状態に反映 / 複数選択の集合演算（unit 65 件）/ 選択・Undo配線の E2E

## P3. 編集機能 (v1)

- [x] **並び替え**: `@dnd-kit` でサムネD&D（ドラッグハンドル）→ `reorder` 操作発行
- [x] **回転**: 90度単位（選択ページ一括）→ `rotate` 操作、サムネ＋メインに反映
- [x] **削除**: 選択削除（AlertDialog で確定→ `delete` 操作、Undo 可）。半透明プレビューは簡略化（選択ハイライト＋確認ダイアログ）
- [x] **抽出**: 選択ページを新規PDFとして生成（pdf-lib `buildPdf`/`extractPages`）→ DL
- [x] **分割**: 選択位置（2ページ目以降）で分割し複数PDFを生成（`splitPdf`）→ DL
- [x] **結合**: 別ファイル読込→ソース追加＋`merge` 操作で1つに結合（多ソース描画対応、サムネD&Dで順序調整）
- [x] 右クリック `ContextMenu`（回転/削除/分割/抽出）
- [x] 文脈依存のツールバー活性制御（回転/削除/抽出/分割は選択時のみ有効、結合は常時）
- [x] **テスト（pdf-libで実出力を検証）**: 並び替え後のページ順 / 回転角がページ辞書に反映 / 削除後の総ページ数 / 抽出PDFのページ内容一致 / 分割の境界 / 結合の総ページ数と順序（unit 8 件・幅で同定）/ 回転・削除・Undo の E2E

## P4. 保存層 (v1)

- [x] 保存処理の抽象化（`SaveStrategy` インターフェース＝`lib/save/strategy.ts`）
- [x] **能力判定**（`isFileSystemAccessSupported` = `window.showSaveFilePicker` の有無）
- [x] Chromium経路: File System Access API で「名前を付けて保存」「上書き保存（保存/オープン時のハンドルを保持し再書込）」
- [x] Firefox経路: `<a download>` フォールバック（上書き保存メニューを無効化＋「Chrome/Edge のみ」明示）
- [x] 分割時の複数ファイル順次保存（`saveSplit`、キャンセルで中断）
- [x] 保存後に未保存フラグをクリア（`markSaved` で `savedAppliedLength` を更新、`isDirty` を基準比較に変更）
- [x] 大きな出力を溜め込まない書き出し（FS Access は `createWritable` ストリームへ直接 write）。※pdf-lib は全体シリアライズのため真のストリームは v2
- [x] **テスト**: 能力判定の分岐 / 生成PDFバイト列の妥当性（保存→再読込で構造検証）/ Firefoxフォールバック時のダウンロード発火（E2E）

## P5. テキスト検索・選択 (v1)

- [x] pdf.js テキストレイヤをビューアに重畳（`renderTextLayer` + `PdfPageView`、`--total-scale-factor` 設定、textLayer CSS）
- [x] **部分選択・全選択・コピー**（テキストレイヤ上のネイティブ選択／全選択ボタン＝描画済みページの選択）
- [x] 検索バー（Ctrl+F）: 語句ハイライト（自前 `<mark>`）・ヒット件数（現在/総数）・前後移動（ページジャンプ）
- [x] **テスト**: 既知テキストPDFで検索ヒット件数・位置（node 統合）/ 全選択コピー相当＝全文抽出一致 / ハイライト DOM（unit）/ 選択・検索の E2E

## P6. しおり表示 (v1)

- [x] 既存PDFのアウトライン（Outline）読み取り（pdf.js `getOutline`/`getDestination`/`getPageIndex` → `buildOutline`）
- [x] 左ペイン「しおり」タブにツリー表示（再帰・開閉）、クリックで該当ページへジャンプ（sourceIndex→現在の表示位置にマップ）
- [x] しおりが無い場合の空状態UI
- [x] **テスト**: アウトライン有りPDFのツリー構造・ジャンプ先ページの一致（mock＋実 PDF で pdf.js が解決）/ 無しPDFの空状態（unit＋E2E）

## P7. 性能・大規模対策（基礎）

> SPEC §9 に対応。v1は「中規模で快適」を保証ラインに、基礎のみ導入。

- [x] **計測基盤**: 所要時間ロガー `measure` ＋ `readMemory`（Chromium `performance.memory` ガード）、CI 内の簡易ベンチ（`build.perf.test` で 200p ビルドを計測）
- [x] 代表データでの上限実測 → 推奨上限値を確定し**UIに明示**（`limits` 定数＝約500ページ/約50MB、空状態に明示。buildPdf 200p≈70ms の計測値を根拠に設定）
- [x] サムネ/ページの**仮想化**（`useVisible` 双方向 IntersectionObserver で可視範囲＋前後のみ描画、離れたら canvas をアンマウントして破棄）。※LRU キャッシュは未導入（再入時は再描画、v2）
- [x] 重い編集処理（保存ビルド）の **Web Worker 隔離**（`pdf-build.worker` + `runBuild`、結果は Transferable で返却。Worker 非対応/失敗時は本スレッドへフォールバック）
- [x] 進捗バー＋キャンセル（`ProgressOverlay` + `progress-store`、保存ビルドに配線）、上限超過時の事前警告（読込/結合時にトースト）
- [x] **テスト/計測**: 中規模で快適動作の確認（200p ビルド 70ms・進捗通知・Abort）/ 上限超過判定 `checkLimits`（unit）と警告配線 / 仮想化込みの実描画・保存 E2E

## P8. 仕上げ・公開

- [ ] ライト/ダークテーマ
- [ ] 基本的なキーボード操作・フォーカス管理（アクセシビリティ）
- [ ] エラーハンドリング（破損PDF・パスワード保護PDF・非対応操作）のトースト
- [ ] E2E シナリオ（読込→編集一式→保存→再読込で検証）を Chrome / Firefox で実行
- [ ] **計測**: 最終バンドルサイズ（JS total）・Lighthouse（LCP/CLS）を記録
- [ ] `docs/CHANGELOG.md` / `docs/SESSION_SUMMARY.md` 更新
- [ ] 本番デプロイ（GitHub Pages）→ ヘルス確認まで監視
- [ ] README（使い方・ブラウザ別対応表・既知の制限）

---

## 後続バージョン（参考）

### v2

- [ ] しおり編集（追加・リネーム・階層変更・削除 → Outline書き戻し）
- [ ] 大規模最適化の本命: **操作ログ＋遅延適用**を保存パスに統合、結合のページ単位ストリーム処理
- [ ] テキスト検索の高度化（正規表現・ページ横断ナビ）

### v3

- [ ] しおり**自動生成**（方式の要件定義 → 実装）
- [ ] OCR連携（必要に応じて）
- [ ] さらなる大規模対応（インクリメンタル更新 / WASM系エンジン検討）

---

## 横断的に守る事項

- 各機能は**テストが失敗する状態から実装**（Red→Green→Refactor）。意味のないアサーションやテスト用ハードコードは禁止。
- 境界値・異常系（破損PDF・空ファイル・巨大ファイル・パスワード保護）も必ずテスト。
- 仕様に不明点が出たら仮実装せずユーザーに確認。
- コミットは Conventional Commits、フェーズ単位で計測値を報告。
