import { describe, it, expect } from "vitest";
import { joinBasePath, withBasePath, BASE_PATH } from "./config";

describe("joinBasePath", () => {
  it("ルート配信（base 空文字）ではパスをそのまま返す", () => {
    expect(joinBasePath("", "/pdf.worker.min.mjs")).toBe("/pdf.worker.min.mjs");
  });

  it("base を先頭に連結する", () => {
    expect(joinBasePath("/pdf-edit-tool", "/pdf.worker.min.mjs")).toBe(
      "/pdf-edit-tool/pdf.worker.min.mjs",
    );
  });

  it("path に先頭スラッシュが無くても補う", () => {
    expect(joinBasePath("/pdf-edit-tool", "pdf.worker.min.mjs")).toBe(
      "/pdf-edit-tool/pdf.worker.min.mjs",
    );
  });

  it("base の末尾スラッシュを除去して二重スラッシュを防ぐ", () => {
    expect(joinBasePath("/pdf-edit-tool/", "/assets/x.png")).toBe(
      "/pdf-edit-tool/assets/x.png",
    );
  });

  it("base 空文字かつ path にスラッシュ無しでも先頭スラッシュを補う", () => {
    expect(joinBasePath("", "favicon.ico")).toBe("/favicon.ico");
  });
});

describe("withBasePath", () => {
  it("テスト環境（NEXT_PUBLIC_BASE_PATH 未設定）では BASE_PATH は空文字", () => {
    expect(BASE_PATH).toBe("");
  });

  it("BASE_PATH を前置した絶対パスを返す", () => {
    expect(withBasePath("/robots.txt")).toBe(`${BASE_PATH}/robots.txt`);
  });
});
