import { describe, it, expect, vi } from "vitest";
import {
  FALLBACK_FONT_PATHS,
  createFallbackFontLoader,
  fallbackStylesOfEdits,
  fallbackStylesOfPages,
  fallbackStylesOfResult,
} from "./fallback-font-source";
import type { PageRef, TextEdit } from "@/lib/editor/operations";

const okResponse = (bytes: number[]) =>
  ({
    ok: true,
    status: 200,
    arrayBuffer: async () => Uint8Array.from(bytes).buffer,
  }) as Response;

describe("createFallbackFontLoader（同梱フォントの遅延取得）", () => {
  it("指定した書体のフォントだけを basePath 付きの URL から取得し、2 回目以降は同じ結果を使う", async () => {
    const fetcher = vi.fn(async (url: string) =>
      okResponse(url.includes("Serif") ? [2] : [1]),
    );
    const load = createFallbackFontLoader(fetcher, "/PDF_Edit_Tool");

    const [a, b] = await Promise.all([load(["serif"]), load(["serif"])]);
    expect(Object.keys(a)).toEqual(["serif"]);
    expect(Array.from(a.serif!)).toEqual([2]);
    expect(b.serif).toBe(a.serif);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(
      `/PDF_Edit_Tool${FALLBACK_FONT_PATHS.serif}`,
    );

    const both = await load(["sans", "serif"]);
    expect(Array.from(both.sans!)).toEqual([1]);
    expect(both.serif).toBe(a.serif);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenLastCalledWith(
      `/PDF_Edit_Tool${FALLBACK_FONT_PATHS.sans}`,
    );
  });

  it("書体を指定しなければ何も取得しない", async () => {
    const fetcher = vi.fn(async () => okResponse([1]));
    const load = createFallbackFontLoader(fetcher, "");
    expect(await load([])).toEqual({});
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("取得に失敗したら日本語のエラーで失敗し、次回は取得し直す", async () => {
    const fetcher = vi
      .fn<(url: string) => Promise<Response>>()
      .mockResolvedValueOnce({ ok: false, status: 404 } as Response)
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(okResponse([9]));
    const load = createFallbackFontLoader(fetcher, "");
    await expect(load(["sans"])).rejects.toThrow(
      "書き換え用のフォントを読み込めませんでした",
    );
    await expect(load(["sans"])).rejects.toThrow(
      "書き換え用のフォントを読み込めませんでした",
    );
    expect(Array.from((await load(["sans"])).sans!)).toEqual([9]);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});

describe("書き換えに必要な同梱フォントの書体", () => {
  const edit = (fallbackStyles?: TextEdit["fallbackStyles"]): TextEdit => ({
    replacements: [{ start: 0, end: 1, text: "9", align: "left" }],
    ...(fallbackStyles ? { fallbackStyles } : {}),
  });
  const page = (textEdits?: PageRef["textEdits"]): PageRef => ({
    id: "p",
    sourceId: "s",
    sourceIndex: 0,
    rotation: 0,
    ...(textEdits ? { textEdits } : {}),
  });

  it("fallbackStylesOfEdits: 書き換え履歴が使う書体を重複なく決まった順（sans → serif）で返す", () => {
    expect(fallbackStylesOfEdits([])).toEqual([]);
    expect(fallbackStylesOfEdits([edit(), edit([])])).toEqual([]);
    expect(
      fallbackStylesOfEdits([edit(["serif"]), edit(["sans", "serif"])]),
    ).toEqual(["sans", "serif"]);
  });

  it("fallbackStylesOfPages: 全ページの書き換え履歴をまとめる（書き換えが無ければ空）", () => {
    expect(fallbackStylesOfPages([page(), page([])])).toEqual([]);
    expect(fallbackStylesOfPages([page([edit()])])).toEqual([]);
    expect(
      fallbackStylesOfPages([
        page([edit(["serif"])]),
        page(),
        page([edit(["serif"])]),
      ]),
    ).toEqual(["serif"]);
  });

  it("fallbackStylesOfResult: 成功なら同梱フォントを使った書体、失敗なら描けない文字の補完に必要な書体", () => {
    expect(
      fallbackStylesOfResult({ ok: true, clipAdjustments: 0, warnings: [] }),
    ).toEqual([]);
    expect(
      fallbackStylesOfResult({
        ok: true,
        clipAdjustments: 0,
        warnings: [
          { kind: "clip-not-adjusted", replacement: 0 },
          {
            kind: "fallback-font",
            replacement: 1,
            chars: ["鷗"],
            style: "serif",
          },
        ],
      }),
    ).toEqual(["serif"]);
    expect(
      fallbackStylesOfResult({
        ok: false,
        failures: [
          { kind: "overlap", replacement: 0 },
          {
            kind: "missing-glyphs",
            replacement: 1,
            chars: ["鷗"],
            style: "serif",
          },
          {
            kind: "missing-glyphs",
            replacement: 2,
            chars: ["鷗"],
            style: "sans",
          },
        ],
      }),
    ).toEqual(["sans", "serif"]);
  });
});
