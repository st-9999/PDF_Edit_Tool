import type { NextConfig } from "next";

/**
 * GitHub Pages はリポジトリ名のサブパス配信になるため、`basePath` / `assetPrefix`
 * を合わせる必要がある。環境依存値はハードコードせず環境変数で注入する
 * （CLAUDE.md「ハードコード禁止」）。
 *
 * 例) ローカル開発: 未設定（ルート配信）
 *     GitHub Pages: NEXT_PUBLIC_BASE_PATH=/pdf-edit-tool
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  // GitHub Pages は静的ホスティング専用のため静的エクスポート
  output: "export",
  // 静的エクスポートでは Image Optimization API が使えないため無効化
  images: { unoptimized: true },
  // サブパス配信対応（空文字なら undefined にしてルート配信）
  basePath: basePath || undefined,
  assetPrefix: basePath || undefined,
  // `/page` -> `/page/index.html` にして GitHub Pages の静的ルーティングと整合させる
  trailingSlash: true,
  // クライアント側でアセットパスを組み立てる用途のため公開（値はビルド時に確定）
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};

export default nextConfig;
