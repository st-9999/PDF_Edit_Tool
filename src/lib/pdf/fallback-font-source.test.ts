import { describe, it, expect, vi } from "vitest";
import {
  FALLBACK_FONT_PATH,
  createFallbackFontLoader,
  needsFallbackFont,
} from "./fallback-font-source";
import type { PageRef } from "@/lib/editor/operations";

const okResponse = (bytes: number[]) =>
  ({
    ok: true,
    status: 200,
    arrayBuffer: async () => Uint8Array.from(bytes).buffer,
  }) as Response;

describe("createFallbackFontLoader（同梱フォントの遅延取得）", () => {
  it("basePath 付きの URL から取得し、2 回目以降は同じ結果を使う", async () => {
    const fetcher = vi.fn(async () => okResponse([1, 2, 3]));
    const load = createFallbackFontLoader(fetcher, "/PDF_Edit_Tool");
    const [a, b] = await Promise.all([load(), load()]);
    expect(Array.from(a)).toEqual([1, 2, 3]);
    expect(b).toBe(a);
    expect(await load()).toBe(a);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(`/PDF_Edit_Tool${FALLBACK_FONT_PATH}`);
  });

  it("取得に失敗したら日本語のエラーで失敗し、次回は取得し直す", async () => {
    const fetcher = vi
      .fn<(url: string) => Promise<Response>>()
      .mockResolvedValueOnce({ ok: false, status: 404 } as Response)
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(okResponse([9]));
    const load = createFallbackFontLoader(fetcher, "");
    await expect(load()).rejects.toThrow(
      "書き換え用のフォントを読み込めませんでした",
    );
    await expect(load()).rejects.toThrow(
      "書き換え用のフォントを読み込めませんでした",
    );
    expect(Array.from(await load())).toEqual([9]);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});

describe("needsFallbackFont", () => {
  const page = (textEdits?: PageRef["textEdits"]): PageRef => ({
    id: "p",
    sourceId: "s",
    sourceIndex: 0,
    rotation: 0,
    ...(textEdits ? { textEdits } : {}),
  });

  it("テキストの書き換えがあるページを含むときだけ true", () => {
    expect(needsFallbackFont([page(), page()])).toBe(false);
    expect(needsFallbackFont([page([])])).toBe(false);
    expect(
      needsFallbackFont([
        page(),
        page([
          { replacements: [{ start: 0, end: 1, text: "9", align: "left" }] },
        ]),
      ]),
    ).toBe(true);
  });
});
