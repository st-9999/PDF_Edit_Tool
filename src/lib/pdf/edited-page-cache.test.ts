import { describe, it, expect, vi } from "vitest";
import type { TextEdit } from "@/lib/editor/text-edit";
import type { FallbackFonts, FontStyle } from "@/lib/pdf/content/font-style";
import { EditedPageCache } from "./edited-page-cache";

const edit = (text: string, fallbackStyles?: FontStyle[]): TextEdit => ({
  replacements: [{ start: 0, end: 1, text, align: "left" }],
  ...(fallbackStyles ? { fallbackStyles } : {}),
});

interface FakeProxy {
  bytes: Uint8Array;
  destroy: ReturnType<typeof vi.fn>;
}

/** render は入力を識別できるバイト列を返し、load はそれを包んだ偽のプロキシを返す。 */
function setup(
  opts: {
    capacity?: number;
    render?: (
      bytes: Uint8Array,
      pageIndex: number,
      edits: readonly TextEdit[],
      options: { fallbackFonts?: FallbackFonts },
    ) => Promise<Uint8Array>;
    loadFallbackFonts?: (styles: Iterable<FontStyle>) => Promise<FallbackFonts>;
  } = {},
) {
  const render = vi.fn(
    opts.render ??
      (async (_bytes: Uint8Array, pageIndex: number) =>
        Uint8Array.of(pageIndex)),
  );
  const load = vi.fn(
    async (bytes: Uint8Array): Promise<FakeProxy> => ({
      bytes,
      destroy: vi.fn(),
    }),
  );
  const loadFallbackFonts = vi.fn(
    opts.loadFallbackFonts ??
      (async (styles: Iterable<FontStyle>) =>
        Object.fromEntries(
          [...styles].map((style) => [
            style,
            Uint8Array.of(style === "serif" ? 0xfe : 0xff),
          ]),
        ) as FallbackFonts),
  );
  const cache = new EditedPageCache<FakeProxy>({
    render,
    load,
    loadFallbackFonts,
    capacity: opts.capacity,
  });
  return { cache, render, load, loadFallbackFonts };
}

const SOURCE = Uint8Array.of(1, 2, 3);

describe("EditedPageCache（書き換えたページのプレビュー用 PDF のキャッシュ）", () => {
  it("同じページ・同じ履歴には同じキーを返し、履歴が違えば別のキーになる", () => {
    const a = EditedPageCache.keyOf("src", 0, [edit("9")]);
    expect(EditedPageCache.keyOf("src", 0, [edit("9")])).toBe(a);
    expect(EditedPageCache.keyOf("src", 0, [edit("8")])).not.toBe(a);
    expect(EditedPageCache.keyOf("src", 1, [edit("9")])).not.toBe(a);
    expect(EditedPageCache.keyOf("other", 0, [edit("9")])).not.toBe(a);
  });

  it("作成した文書を返し、作成済みなら作り直さない（同時の要求も 1 回にまとめる）", async () => {
    const { cache, render, load } = setup();
    const key = EditedPageCache.keyOf("src", 2, [edit("9")]);
    expect(cache.get(key)).toBeUndefined();

    const [a, b] = await Promise.all([
      cache.ensure(key, SOURCE, 2, [edit("9")]),
      cache.ensure(key, SOURCE, 2, [edit("9")]),
    ]);
    expect(a).toBe(b);
    expect(Array.from(a.bytes)).toEqual([2]);
    expect(await cache.ensure(key, SOURCE, 2, [edit("9")])).toBe(a);
    expect(cache.get(key)).toBe(a);
    expect(render).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledWith(SOURCE, 2, [edit("9")], {});
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("書き換え履歴が同梱フォントを使うときだけ、その書体のフォントを読み込んで作る", async () => {
    const { cache, render, loadFallbackFonts } = setup();
    const plain = [edit("9")];
    await cache.ensure(
      EditedPageCache.keyOf("src", 0, plain),
      SOURCE,
      0,
      plain,
    );
    expect(loadFallbackFonts).not.toHaveBeenCalled();
    expect(render).toHaveBeenLastCalledWith(SOURCE, 0, plain, {});

    const withFonts = [edit("9"), edit("鷗", ["serif"])];
    await cache.ensure(
      EditedPageCache.keyOf("src", 0, withFonts),
      SOURCE,
      0,
      withFonts,
    );
    expect(loadFallbackFonts).toHaveBeenCalledTimes(1);
    expect([...loadFallbackFonts.mock.calls[0]![0]]).toEqual(["serif"]);
    expect(render).toHaveBeenLastCalledWith(SOURCE, 0, withFonts, {
      fallbackFonts: { serif: Uint8Array.of(0xfe) },
    });
  });

  it("同梱フォントを読み込めなければ、作成の失敗として記録する", async () => {
    const { cache, render } = setup({
      loadFallbackFonts: async () => {
        throw new Error("書き換え用のフォントを読み込めませんでした");
      },
    });
    const edits = [edit("鷗", ["sans"])];
    const key = EditedPageCache.keyOf("src", 0, edits);
    await expect(cache.ensure(key, SOURCE, 0, edits)).rejects.toThrow(
      "書き換え用のフォントを読み込めませんでした",
    );
    expect(cache.failed(key)?.message).toBe(
      "書き換え用のフォントを読み込めませんでした",
    );
    expect(render).not.toHaveBeenCalled();
  });

  it("作成に失敗したら記録して失敗を返す（次の要求では再試行する）", async () => {
    let attempts = 0;
    const { cache, loadFallbackFonts } = setup({
      render: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("壊れた PDF");
        return Uint8Array.of(1);
      },
    });
    const key = EditedPageCache.keyOf("src", 0, [edit("9")]);
    await expect(cache.ensure(key, SOURCE, 0, [edit("9")])).rejects.toThrow(
      "壊れた PDF",
    );
    expect(cache.failed(key)?.message).toBe("壊れた PDF");
    expect(loadFallbackFonts).not.toHaveBeenCalled();

    await cache.ensure(key, SOURCE, 0, [edit("9")]);
    expect(cache.failed(key)).toBeUndefined();
    expect(cache.get(key)).toBeDefined();
  });

  it("上限を超えたら最も長く使われていない文書を破棄する（get で使用とみなす）", async () => {
    const { cache } = setup({ capacity: 2 });
    const keys = [0, 1, 2].map((i) =>
      EditedPageCache.keyOf("src", i, [edit("9")]),
    );
    const first = await cache.ensure(keys[0]!, SOURCE, 0, [edit("9")]);
    const second = await cache.ensure(keys[1]!, SOURCE, 1, [edit("9")]);
    cache.get(keys[0]!); // 1 件目を使う → 2 件目が最も古くなる
    await cache.ensure(keys[2]!, SOURCE, 2, [edit("9")]);

    expect(cache.get(keys[1]!)).toBeUndefined();
    expect(second.destroy).toHaveBeenCalledTimes(1);
    expect(cache.get(keys[0]!)).toBe(first);
    expect(first.destroy).not.toHaveBeenCalled();
  });

  it("状態が変わる（作成完了・失敗・破棄）たびに購読者へ通知する", async () => {
    const { cache } = setup({ capacity: 1 });
    const listener = vi.fn();
    const unsubscribe = cache.subscribe(listener);
    await cache.ensure(EditedPageCache.keyOf("s", 0, []), SOURCE, 0, []);
    expect(listener).toHaveBeenCalledTimes(1);
    await cache.ensure(EditedPageCache.keyOf("s", 1, []), SOURCE, 1, []);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    await cache.ensure(EditedPageCache.keyOf("s", 2, []), SOURCE, 2, []);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("clear で全文書を破棄し、作成中だった文書も完成しだい破棄する", async () => {
    let finish: (bytes: Uint8Array) => void = () => {};
    const { cache, load } = setup({
      render: (_b, pageIndex) =>
        pageIndex === 9
          ? new Promise<Uint8Array>((resolve) => {
              finish = resolve;
            })
          : Promise.resolve(Uint8Array.of(pageIndex)),
    });
    const readyKey = EditedPageCache.keyOf("s", 0, []);
    const ready = await cache.ensure(readyKey, SOURCE, 0, []);
    const pending = cache.ensure(
      EditedPageCache.keyOf("s", 9, []),
      SOURCE,
      9,
      [],
    );

    cache.clear();
    expect(ready.destroy).toHaveBeenCalledTimes(1);
    expect(cache.get(readyKey)).toBeUndefined();

    finish(Uint8Array.of(9));
    await expect(pending).rejects.toThrow();
    const late = await load.mock.results[1]!.value;
    expect(late.destroy).toHaveBeenCalledTimes(1);
  });
});
