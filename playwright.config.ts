import { defineConfig, devices } from "@playwright/test";

/**
 * E2E は Chrome / Firefox 両系統で実行する（SPEC §4 対象ブラウザ）。
 * webServer は dev サーバを起動し、テスト後に自動停止する。
 * 実行前にブラウザバイナリのインストールが必要: `npx playwright install`
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
