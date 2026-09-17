import { PDFDocument } from "pdf-lib";
import { decryptPdfIfNeeded } from "@/lib/pdf/decrypt";
import {
  GlyphResolver,
  type GlyphResolverOptions,
} from "@/lib/pdf/content/glyph-resolver";
import { extractPageText } from "@/lib/pdf/content/page-text";
import {
  replacePageText,
  rewritePageContent,
  type RewriteFailure,
  type RewriteResult,
} from "@/lib/pdf/content/rewrite";
import type { TextEdit } from "./operations";

export type { TextEdit } from "./operations";

/**
 * ページのテキスト書き換え（本物の書き換え）を、編集モデルから使うための入口。
 *
 * 書き換えは「元の PDF 全体を読み、そのページに書き換え履歴を順に適用する」ことで再現する。
 * 文書全体を使うのは、同じ書体の別フォント（他のページのフォント）で文字を補えるようにするため。
 * プレビューと保存の両方がこの関数を通るため、画面と保存結果は常に一致する。
 */

export type TextEditOptions = GlyphResolverOptions;

/** 書き換えを適用できなかった（利用者向けの日本語メッセージを持つ）。 */
export class TextEditError extends Error {
  constructor(
    message: string,
    readonly failures: RewriteFailure[],
  ) {
    super(message);
    this.name = "TextEditError";
  }
}

const UNSUPPORTED_FONT: Record<string, string> = {
  vertical: "縦書きの文字",
  encoding: "対応していない文字コード方式のフォントの文字",
  metrics: "文字幅の情報が無いフォントの文字",
  type3: "Type3 フォントの文字",
};

/** 失敗の理由を利用者向けの日本語にする。 */
export function describeRewriteFailures(failures: RewriteFailure[]): string {
  const reasons = failures.map((f) => {
    switch (f.kind) {
      case "invalid-range":
        return "書き換える範囲が正しくありません";
      case "overlap":
        return "書き換える範囲が重なっています";
      case "spans-operations":
        return "選んだ範囲は PDF 内で別々の行・書式に分かれているため、まとめて書き換えられません";
      case "unsupported-font":
        return `${UNSUPPORTED_FONT[f.reason] ?? "このフォントの文字"}は書き換えられません`;
      case "missing-glyphs":
        return `「${f.chars.join("」「")}」を描けるフォントがありません`;
    }
  });
  return [...new Set(reasons)].join("。");
}

/** 元の PDF を読み、指定ページに書き換え履歴を順に適用した文書を返す（ページの位置は変わらない）。 */
export async function loadDocumentWithEdits(
  sourceBytes: Uint8Array,
  pageIndex: number,
  edits: readonly TextEdit[],
  options: TextEditOptions = {},
): Promise<PDFDocument> {
  const doc = await PDFDocument.load(await decryptPdfIfNeeded(sourceBytes), {
    updateMetadata: false,
  });
  for (const edit of edits) {
    const result = replacePageText(doc, pageIndex, edit.replacements, options);
    if (!result.ok) {
      throw new TextEditError(
        `テキストの書き換えを適用できませんでした: ${describeRewriteFailures(result.failures)}`,
        result.failures,
      );
    }
  }
  return doc;
}

/** 書き換え後のページだけを 1 ページの PDF として返す（プレビュー用）。 */
export async function renderEditedPage(
  sourceBytes: Uint8Array,
  pageIndex: number,
  edits: readonly TextEdit[],
  options: TextEditOptions = {},
): Promise<Uint8Array> {
  const doc = await loadDocumentWithEdits(
    sourceBytes,
    pageIndex,
    edits,
    options,
  );
  const out = await PDFDocument.create();
  const [page] = await out.copyPages(doc, [pageIndex]);
  out.addPage(page!);
  return out.save();
}

/**
 * 書き換えを確定する前に、警告（同梱フォントを使う文字など）や失敗を調べる。文書は変更しない。
 * `doc` は `loadDocumentWithEdits` で、それまでの書き換えを適用した文書を渡す。
 */
export function previewTextEdit(
  doc: PDFDocument,
  pageIndex: number,
  edit: TextEdit,
  options: TextEditOptions = {},
): RewriteResult {
  const page = extractPageText(doc, pageIndex);
  const resolver = new GlyphResolver(doc, pageIndex, page, options);
  const result = rewritePageContent(page, edit.replacements, (resource, char) =>
    resolver.resolve(resource, char),
  );
  if (!result.ok) return result;
  return {
    ok: true,
    clipAdjustments: result.clipAdjustments,
    warnings: result.warnings,
  };
}
