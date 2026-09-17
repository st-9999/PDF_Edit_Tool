import type { TextEdit } from "@/lib/editor/operations";
import type { RewriteFailure } from "@/lib/pdf/content/rewrite";

/**
 * テキストを書き換えたページのプレビュー用 PDF（1 ページ）と、その読み込み結果（pdf.js のプロキシ）のキャッシュ。
 *
 * - キーは「元ソース・元ページ・書き換え履歴」。同じ内容なら作り直さず、同時の要求は 1 回にまとめる。
 * - 同梱フォント（5.5MB）はまず使わずに作り、元のフォントで描けない文字があったときだけ読み込んで作り直す。
 * - 上限を超えたら最も長く使われていないものを破棄する（pdf.js のプロキシはメモリを持つため）。
 */

export interface Destroyable {
  destroy(): unknown;
}

export interface EditedPageCacheDeps<P extends Destroyable> {
  render: (
    sourceBytes: Uint8Array,
    pageIndex: number,
    edits: readonly TextEdit[],
    options: { fallbackFont?: Uint8Array },
  ) => Promise<Uint8Array>;
  load: (bytes: Uint8Array) => Promise<P>;
  loadFallbackFont: () => Promise<Uint8Array>;
  /** 保持する文書数の上限。 */
  capacity?: number;
}

const DEFAULT_CAPACITY = 24;

export class EditedPageCache<P extends Destroyable> {
  /** 作成済み（挿入順＝使用順。末尾が最近使ったもの）。 */
  private readonly ready = new Map<string, P>();
  private readonly pending = new Map<string, Promise<P>>();
  private readonly failures = new Map<string, Error>();
  private readonly listeners = new Set<() => void>();
  /** clear のたびに進め、それ以前に始まった作成結果を捨てる。 */
  private generation = 0;

  constructor(private readonly deps: EditedPageCacheDeps<P>) {}

  static keyOf(
    sourceId: string,
    sourceIndex: number,
    edits: readonly TextEdit[],
  ): string {
    return JSON.stringify([sourceId, sourceIndex, edits]);
  }

  /** 作成済みなら返す（使用したものとして扱う）。 */
  get(key: string): P | undefined {
    const value = this.ready.get(key);
    if (value) {
      this.ready.delete(key);
      this.ready.set(key, value);
    }
    return value;
  }

  /** 直近の作成に失敗していればそのエラー。 */
  failed(key: string): Error | undefined {
    return this.failures.get(key);
  }

  /** 作成済みなら返し、無ければ作成する。 */
  ensure(
    key: string,
    sourceBytes: Uint8Array,
    pageIndex: number,
    edits: readonly TextEdit[],
  ): Promise<P> {
    const existing = this.get(key);
    if (existing) return Promise.resolve(existing);
    const inFlight = this.pending.get(key);
    if (inFlight) return inFlight;

    const generation = this.generation;
    const task = (async () => {
      try {
        const bytes = await this.renderWithFallback(
          sourceBytes,
          pageIndex,
          edits,
        );
        const proxy = await this.deps.load(bytes);
        if (generation !== this.generation) {
          void proxy.destroy();
          throw new Error("プレビューは破棄されました");
        }
        this.failures.delete(key);
        this.ready.set(key, proxy);
        this.evict();
        return proxy;
      } catch (err) {
        if (generation === this.generation) {
          this.failures.set(
            key,
            err instanceof Error ? err : new Error(String(err)),
          );
        }
        throw err;
      } finally {
        if (generation === this.generation) {
          this.pending.delete(key);
          this.notify();
        }
      }
    })();
    this.pending.set(key, task);
    return task;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** すべての文書を破棄する。作成中のものは完成しだい破棄する。 */
  clear(): void {
    this.generation += 1;
    for (const proxy of this.ready.values()) void proxy.destroy();
    this.ready.clear();
    this.pending.clear();
    this.failures.clear();
    this.notify();
  }

  private async renderWithFallback(
    sourceBytes: Uint8Array,
    pageIndex: number,
    edits: readonly TextEdit[],
  ): Promise<Uint8Array> {
    try {
      return await this.deps.render(sourceBytes, pageIndex, edits, {});
    } catch (err) {
      // TextEditError（lib/editor/text-edit）を名前で判定する。型の import だけにして、
      // pdf-lib を含むモジュールを書き換えが現れるまで読み込まないため。
      const failures =
        err instanceof Error && err.name === "TextEditError"
          ? (err as Error & { failures?: RewriteFailure[] }).failures
          : undefined;
      const needsFallback =
        failures?.some((f) => f.kind === "missing-glyphs") ?? false;
      if (!needsFallback) throw err;
      const fallbackFont = await this.deps.loadFallbackFont();
      return this.deps.render(sourceBytes, pageIndex, edits, { fallbackFont });
    }
  }

  private evict(): void {
    const capacity = this.deps.capacity ?? DEFAULT_CAPACITY;
    while (this.ready.size > capacity) {
      const [oldestKey, oldest] = this.ready.entries().next().value as [
        string,
        P,
      ];
      this.ready.delete(oldestKey);
      void oldest.destroy();
    }
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}
