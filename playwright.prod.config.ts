import { defineConfig, devices } from "@playwright/test";

/**
 * 本番ビルド（静的エクスポート）の E2E。GitHub Pages と同じくサブパス（basePath）配下で配信し、
 * 開発サーバーでは確かめられない本番固有の問題（アセットの basePath、Worker のバンドル、
 * 同梱フォントの配信）を確かめる。
 *
 * - `E2E_BASE_PATH`: 配信するサブパス（CI ではリポジトリ名から導出）。未指定なら既定値。
 * - `E2E_PROD_SKIP_BUILD`: 指定するとビルドせず、既存の `out/` を配信する（CI でデプロイ用のビルドを検証する）。
 *   その場合は `out/` を同じ basePath でビルドしておくこと。
 */

/** サブパス配信を確かめるための既定の basePath（GitHub Pages の「/リポジトリ名」に相当）。 */
const DEFAULT_BASE_PATH = "/pdf-edit-tool";
/** 開発サーバー（3000）と衝突しない配信ポート。 */
const DEFAULT_PORT = 4310;

const basePath = process.env.E2E_BASE_PATH ?? DEFAULT_BASE_PATH;
const port = Number(process.env.E2E_PROD_PORT ?? DEFAULT_PORT);
const origin = `http://127.0.0.1:${port}`;
const serve = "node scripts/serve-static.mjs";

export default defineConfig({
  testDir: "./e2e-prod",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "list" : "html",
  use: {
    // 末尾の / が必要（相対パス "./" をサブパス直下に解決するため）
    baseURL: `${origin}${basePath}/`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
  ],
  webServer: {
    command: process.env.E2E_PROD_SKIP_BUILD
      ? serve
      : `npm run build && ${serve}`,
    url: `${origin}${basePath}/`,
    env: {
      NEXT_PUBLIC_BASE_PATH: basePath,
      SERVE_ROOT: "out",
      SERVE_PORT: String(port),
      SERVE_BASE_PATH: basePath,
    },
    // 常に今のソースからビルドした出力を確かめる
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
