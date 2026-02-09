import { NextRequest, NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];

    if (files.length < 2) {
      return NextResponse.json(
        { error: "結合するには2つ以上のPDFファイルが必要です" },
        { status: 400 }
      );
    }

    const newDoc = await PDFDocument.create();

    for (const file of files) {
      const data = await file.arrayBuffer();
      const srcDoc = await PDFDocument.load(data, { ignoreEncryption: true });
      const indices = Array.from(
        { length: srcDoc.getPageCount() },
        (_, i) => i
      );
      const copiedPages = await newDoc.copyPages(srcDoc, indices);
      for (const page of copiedPages) {
        newDoc.addPage(page);
      }
    }

    const pdfBytes = await newDoc.save({ updateFieldAppearances: false });

    return new NextResponse(Buffer.from(pdfBytes), {
      headers: { "Content-Type": "application/pdf" },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "サーバーでの結合に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
