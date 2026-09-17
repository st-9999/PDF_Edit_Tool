import {
  decodePDFRawStream,
  PDFArray,
  PDFDict,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  PDFStream,
  type PDFContext,
  type PDFObject,
} from "pdf-lib";

/** 間接参照を解決する（参照でなければそのまま）。 */
export function resolve(
  ctx: PDFContext,
  obj: PDFObject | undefined,
): PDFObject | undefined {
  return obj instanceof PDFRef ? ctx.lookup(obj) : obj;
}

export function getDict(
  ctx: PDFContext,
  dict: PDFDict,
  key: string,
): PDFDict | undefined {
  const v = resolve(ctx, dict.get(PDFName.of(key)));
  return v instanceof PDFDict ? v : undefined;
}

export function getArray(
  ctx: PDFContext,
  dict: PDFDict,
  key: string,
): PDFArray | undefined {
  const v = resolve(ctx, dict.get(PDFName.of(key)));
  return v instanceof PDFArray ? v : undefined;
}

export function getNumber(
  ctx: PDFContext,
  dict: PDFDict | undefined,
  key: string,
): number | undefined {
  if (!dict) return undefined;
  const v = resolve(ctx, dict.get(PDFName.of(key)));
  return v instanceof PDFNumber ? v.asNumber() : undefined;
}

/** 名前の値を `/` なしで返す。 */
export function getName(
  ctx: PDFContext,
  dict: PDFDict | undefined,
  key: string,
): string | undefined {
  if (!dict) return undefined;
  const v = resolve(ctx, dict.get(PDFName.of(key)));
  return v instanceof PDFName ? v.decodeText() : undefined;
}

export function getStream(
  ctx: PDFContext,
  dict: PDFDict,
  key: string,
): PDFStream | undefined {
  const v = resolve(ctx, dict.get(PDFName.of(key)));
  return v instanceof PDFStream ? v : undefined;
}

/** ストリームの中身をフィルタ復号済みのバイト列で返す。 */
export function streamBytes(stream: PDFStream): Uint8Array {
  if (stream instanceof PDFRawStream) {
    return decodePDFRawStream(stream).decode();
  }
  // pdf-lib で新規に作ったストリーム（PDFFlateStream / PDFContentStream）は未圧縮の中身を持つ
  const withUnencoded = stream as PDFStream & {
    getUnencodedContents?: () => Uint8Array;
  };
  if (typeof withUnencoded.getUnencodedContents === "function") {
    return withUnencoded.getUnencodedContents();
  }
  return stream.getContents();
}

/** PDFArray の数値要素を number[] にする（数値以外は NaN）。 */
export function numbers(ctx: PDFContext, arr: PDFArray): number[] {
  return arr.asArray().map((o) => {
    const v = resolve(ctx, o);
    return v instanceof PDFNumber ? v.asNumber() : Number.NaN;
  });
}
