import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    // ユニット/コンポーネントテストのみ対象。E2E（Playwright）は除外。
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules/**", "e2e/**", ".next/**", "out/**"],
    css: true,
    coverage: {
      provider: "v8",
      reportsDirectory: "./coverage",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.{test,spec}.{ts,tsx}", "src/**/*.d.ts"],
    },
  },
});
