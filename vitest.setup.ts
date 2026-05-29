import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// 各テスト後に React Testing Library のレンダリング結果を破棄してリークを防ぐ
afterEach(() => {
  cleanup();
});
