import { PDFArray, PDFDict, PDFStream, type PDFDocument } from "pdf-lib";
import { loadFontModel, type FontModel } from "./font";
import { parseOperations, type ContentOperation } from "./operations";
import { getDict, resolve, streamBytes } from "./pdf-objects";
import { layoutText, type TextLayout } from "./text-layout";

/** 連結したバイト列のうち、1 つのコンテンツストリームが占める範囲。 */
export interface ContentSegment {
  /** ページの /Contents 内での順番。 */
  streamIndex: number;
  start: number;
  end: number;
}

export interface PageContent {
  /** 全コンテンツストリームを改行で連結した復号済みバイト列。 */
  bytes: Uint8Array;
  segments: ContentSegment[];
  operations: ContentOperation[];
}

export interface PageText extends TextLayout {
  content: PageContent;
  /** 解釈中に参照したフォント（リソース名 → モデル）。 */
  fonts: Map<string, FontModel>;
}

const NEWLINE = 0x0a;

/**
 * ページの描画命令を読む。/Contents が配列の場合は仕様どおり連結して 1 つのストリームとして扱う
 * （トークンはストリーム境界をまたがないため、改行で区切って連結してよい）。
 */
export function readPageContent(
  doc: PDFDocument,
  pageIndex: number,
): PageContent {
  const ctx = doc.context;
  const page = doc.getPage(pageIndex);
  const contents = resolve(ctx, page.node.Contents());
  const streams: PDFStream[] =
    contents instanceof PDFArray
      ? contents.asArray().flatMap((o) => {
          const s = resolve(ctx, o);
          return s instanceof PDFStream ? [s] : [];
        })
      : contents instanceof PDFStream
        ? [contents]
        : [];

  const parts = streams.map(streamBytes);
  const total =
    parts.reduce((n, p) => n + p.length, 0) + Math.max(0, parts.length - 1);
  const bytes = new Uint8Array(total);
  const segments: ContentSegment[] = [];
  let pos = 0;
  parts.forEach((part, streamIndex) => {
    if (streamIndex > 0) {
      bytes[pos] = NEWLINE;
      pos += 1;
    }
    bytes.set(part, pos);
    segments.push({ streamIndex, start: pos, end: pos + part.length });
    pos += part.length;
  });

  return { bytes, segments, operations: parseOperations(bytes) };
}

/** ページ内のテキストをグリフ単位で解析する。 */
export function extractPageText(doc: PDFDocument, pageIndex: number): PageText {
  const ctx = doc.context;
  const content = readPageContent(doc, pageIndex);
  const resources = resolve(ctx, doc.getPage(pageIndex).node.Resources());
  const fontDict =
    resources instanceof PDFDict ? getDict(ctx, resources, "Font") : undefined;

  const fonts = new Map<string, FontModel>();
  const fontFor = (name: string): FontModel | null => {
    const cached = fonts.get(name);
    if (cached) return cached;
    const dict = fontDict ? getDict(ctx, fontDict, name) : undefined;
    if (!dict) return null;
    const model = loadFontModel(ctx, name, dict);
    fonts.set(name, model);
    return model;
  };

  return { ...layoutText(content.operations, fontFor), content, fonts };
}
