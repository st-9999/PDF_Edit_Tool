/**
 * テスト専用: 描画命令とフォントを直接指定した PDF を pdf-lib で生成する。
 * フォント実体は埋め込まない（位置計算は /W・/Widths、文字は ToUnicode・WinAnsi で決まる）。
 */
import {
  PDFDocument,
  PDFHexString,
  PDFName,
  type PDFContext,
  type PDFRef,
} from "pdf-lib";

export const enc = (s: string) => new TextEncoder().encode(s);

/** 埋め込みなしの単純 TrueType フォント（WinAnsi・Widths 付き）。 */
export function addSimpleFont(ctx: PDFContext): PDFRef {
  const widths = Array.from({ length: 95 }, (_, i) => 400 + ((i * 37) % 300));
  return ctx.register(
    ctx.obj({
      Type: "Font",
      Subtype: "TrueType",
      BaseFont: "TestSans",
      FirstChar: 32,
      LastChar: 126,
      Widths: widths,
      Encoding: "WinAnsiEncoding",
      FontDescriptor: ctx.register(
        ctx.obj({
          Type: "FontDescriptor",
          FontName: "TestSans",
          Flags: 32,
          FontBBox: [0, -200, 1000, 800],
          ItalicAngle: 0,
          Ascent: 800,
          Descent: -200,
          CapHeight: 700,
          StemV: 80,
          MissingWidth: 500,
        }),
      ),
    }),
  );
}

/**
 * Excel / Print to PDF 相当の Type0（Identity-H）フォント。
 * 文字コード（CID）は 0x3E00 台に割り当て、ToUnicode と W で文字・幅を与える。
 */
export const CID_CHARS: [number, string, number][] = [
  [0x3ed4, "0", 507],
  [0x3ed5, "1", 507],
  [0x3ed6, "2", 507],
  [0x3ed7, "3", 507],
  [0x3ed8, "4", 507],
  [0x3ed9, "5", 507],
  [0x3edc, "8", 507],
  [0x3edd, "9", 507],
  [0x46b7, ".", 313],
  [0x0f95, "号", 1000],
  [0x27a8, "第", 1000],
  [0x3ecc, "*", 507],
  [0x0003, " ", 250],
];

export function addCidFont(ctx: PDFContext, encoding = "Identity-H"): PDFRef {
  const bfchar = CID_CHARS.map(
    ([code, ch]) =>
      `<${code.toString(16).padStart(4, "0")}> <${ch.charCodeAt(0).toString(16).padStart(4, "0")}>`,
  ).join("\n");
  const toUnicode = ctx.register(
    ctx.flateStream(
      enc(
        `/CIDInit /ProcSet findresource begin 12 dict begin begincmap\n1 begincodespacerange <0000> <FFFF> endcodespacerange\n${CID_CHARS.length} beginbfchar\n${bfchar}\nendbfchar endcmap end end`,
      ),
    ),
  );
  const w = CID_CHARS.flatMap(([code, , width]) => [code, [width]]);
  const descendant = ctx.register(
    ctx.obj({
      Type: "Font",
      Subtype: "CIDFontType2",
      BaseFont: "CIDFont+F1",
      CIDSystemInfo: {
        Registry: PDFHexString.fromText("Adobe"),
        Ordering: PDFHexString.fromText("Identity"),
        Supplement: 0,
      },
      FontDescriptor: ctx.register(
        ctx.obj({
          Type: "FontDescriptor",
          FontName: "CIDFont+F1",
          Flags: 32,
          FontBBox: [0, -140, 1000, 859],
          ItalicAngle: 0,
          Ascent: 859,
          Descent: -140,
          CapHeight: 700,
          StemV: 80,
        }),
      ),
      DW: 1000,
      W: w,
      CIDToGIDMap: "Identity",
    }),
  );
  return ctx.register(
    ctx.obj({
      Type: "Font",
      Subtype: "Type0",
      BaseFont: "CIDFont+F1",
      Encoding: encoding,
      DescendantFonts: [descendant],
      ToUnicode: toUnicode,
    }),
  );
}

/**
 * 指定したコンテンツストリーム（複数可）とフォントでページを 1 枚作る。
 * フォント: F1 = Type0 / Identity-H（CID_CHARS）、F2 = 単純 TrueType（WinAnsi）、F3 = Type0 / Identity-V（縦書き）。
 */
export async function buildPdf(
  streams: string[],
  size: [number, number] = [842, 595],
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const ctx = doc.context;
  const page = doc.addPage(size);
  const fonts = ctx.obj({
    F1: addCidFont(ctx),
    F2: addSimpleFont(ctx),
    F3: addCidFont(ctx, "Identity-V"),
  });
  page.node.set(PDFName.of("Resources"), ctx.obj({ Font: fonts }));
  const refs = streams.map((s) => ctx.register(ctx.flateStream(enc(s))));
  page.node.set(
    PDFName.of("Contents"),
    refs.length === 1 ? refs[0]! : ctx.obj(refs),
  );
  return doc.save();
}
