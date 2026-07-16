import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { decryptPdfIfNeeded } from "@/lib/pdf/decrypt";
import {
  PdfPasswordRequiredError,
  internals,
} from "@/lib/pdf/decrypt/standard-security";
import { md5 } from "@/lib/pdf/decrypt/md5";
import { rc4 } from "@/lib/pdf/decrypt/rc4";
import { scanObjects } from "@/lib/pdf/decrypt/scanner";

const latin1 = new TextDecoder("latin1");

function bytes(text: string): Uint8Array {
  return Uint8Array.from(text, (ch) => ch.charCodeAt(0));
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

function toHex(data: Uint8Array): string {
  return Array.from(data)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** PDF のテキスト文字列表現（UTF-16BE + BOM）。非 ASCII を含む場合の実際の形式。 */
function pdfTextString(text: string): Uint8Array {
  const out = [0xfe, 0xff];
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    out.push((code >> 8) & 0xff, code & 0xff);
  }
  return Uint8Array.from(out);
}

/**
 * テスト用に RC4-128 / R4 の暗号化 PDF を組み立てる（logo.pdf と同じ方式）。
 * `/O` と `/U` は ISO 32000-1 の Algorithm 3 / 5 に従って生成するため、
 * 復号側の鍵導出・検証が仕様どおりでなければテストは失敗する。
 */
function buildEncryptedPdf(options: {
  /** ページ内容として埋め込む文字列（コンテンツストリームの復号確認用）。 */
  content: string;
  /** /Info /Title に入れる文字列（文字列の復号確認用）。 */
  title: string;
  id0: Uint8Array;
}): Uint8Array {
  const { content, title, id0 } = options;
  const PAD = internals.PAD;
  const p = -1340;
  const keyLenBytes = 16;

  // Algorithm 3: 空のオーナーパスワード → /O
  let ownerHash = md5(PAD);
  for (let i = 0; i < 50; i += 1) ownerHash = md5(ownerHash);
  const ownerKey = ownerHash.subarray(0, keyLenBytes);
  let o = rc4(ownerKey, PAD);
  for (let i = 1; i <= 19; i += 1) {
    o = rc4(
      ownerKey.map((b) => b ^ i),
      o,
    );
  }

  const params = {
    v: 4,
    r: 4,
    lengthBits: 128,
    o,
    u: new Uint8Array(32),
    ue: null,
    p,
    encryptMetadata: true,
    stmF: "V2" as const,
    strF: "V2" as const,
  };

  const fileKey = internals.computeLegacyKey(params, id0);

  // Algorithm 5: /U（前半 16 バイトが検証対象、後半は任意）
  let u = rc4(fileKey, md5(concat(PAD, id0)));
  for (let i = 1; i <= 19; i += 1) {
    u = rc4(
      fileKey.map((b) => b ^ i),
      u,
    );
  }
  const uFull = concat(u, new Uint8Array(16));

  const encryptObject = (data: Uint8Array, num: number, gen: number) =>
    rc4(internals.objectKey(fileKey, num, gen, false), data);

  const stream = bytes(content);
  const encStream = encryptObject(stream, 4, 0);
  const encTitle = encryptObject(pdfTextString(title), 5, 0);

  // オブジェクトを組み立てつつオフセットを記録する
  const chunks: Uint8Array[] = [];
  const offsets = new Map<number, number>();
  let offset = 0;
  const push = (chunk: Uint8Array) => {
    chunks.push(chunk);
    offset += chunk.length;
  };
  const addObject = (num: number, body: Uint8Array) => {
    offsets.set(num, offset);
    push(bytes(`${num} 0 obj\n`));
    push(body);
    push(bytes(`\nendobj\n`));
  };

  push(bytes("%PDF-1.5\n%\xE2\xE3\xCF\xD3\n"));
  addObject(1, bytes("<< /Type /Catalog /Pages 2 0 R >>"));
  addObject(2, bytes("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"));
  addObject(
    3,
    bytes(
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Contents 4 0 R /Resources << >> >>",
    ),
  );
  addObject(
    4,
    concat(
      bytes(`<< /Length ${encStream.length} >>\nstream\n`),
      encStream,
      bytes("\nendstream"),
    ),
  );
  addObject(5, bytes(`<< /Title <${toHex(encTitle)}> >>`));
  addObject(
    6,
    bytes(
      `<< /Filter /Standard /V 4 /R 4 /Length 128 /P ${p} ` +
        `/CF << /StdCF << /CFM /V2 /AuthEvent /DocOpen /Length 16 >> >> ` +
        `/StmF /StdCF /StrF /StdCF ` +
        `/O <${toHex(o)}> /U <${toHex(uFull)}> >>`,
    ),
  );

  const xrefOffset = offset;
  let table = "xref\n0 7\n0000000000 65535 f\r\n";
  for (let i = 1; i <= 6; i += 1) {
    table += `${String(offsets.get(i)).padStart(10, "0")} 00000 n\r\n`;
  }
  push(bytes(table));
  push(
    bytes(
      `trailer\n<< /Size 7 /Root 1 0 R /Info 5 0 R /Encrypt 6 0 R ` +
        `/ID [<${toHex(id0)}> <${toHex(id0)}>] >>\n` +
        `startxref\n${xrefOffset}\n%%EOF\n`,
    ),
  );
  return concat(...chunks);
}

describe("decryptPdfIfNeeded", () => {
  const id0 = Uint8Array.from({ length: 16 }, (_, i) => i * 7 + 1);

  it("暗号化されていない PDF は変更せずそのまま返す", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([200, 100]);
    const plain = await doc.save();
    const out = await decryptPdfIfNeeded(plain);
    expect(out).toBe(plain); // 同一参照＝コピーすらしない
  });

  it("RC4-128 の暗号化 PDF を復号し、pdf-lib で読み込めるようにする", async () => {
    const encrypted = buildEncryptedPdf({
      content: "BT /F1 12 Tf (secret) Tj ET",
      title: "機密資料",
      id0,
    });

    // 前提確認: 元データは pdf-lib では読めない
    await expect(PDFDocument.load(encrypted)).rejects.toThrow(/encrypted/i);

    const decrypted = await decryptPdfIfNeeded(encrypted);
    const doc = await PDFDocument.load(decrypted);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getPage(0).getWidth()).toBe(200);
  });

  it("コンテンツストリームが平文に戻る", async () => {
    const content = "BT /F1 12 Tf (secret) Tj ET";
    const encrypted = buildEncryptedPdf({ content, title: "t", id0 });
    const decrypted = await decryptPdfIfNeeded(encrypted);
    expect(latin1.decode(decrypted)).toContain(content);
  });

  it("文字列（/Info /Title）が平文に戻る", async () => {
    const encrypted = buildEncryptedPdf({
      content: "x",
      title: "機密資料",
      id0,
    });
    const decrypted = await decryptPdfIfNeeded(encrypted);
    const doc = await PDFDocument.load(decrypted);
    expect(doc.getTitle()).toBe("機密資料");
  });

  it("出力から /Encrypt が取り除かれる", async () => {
    const encrypted = buildEncryptedPdf({ content: "x", title: "t", id0 });
    expect(latin1.decode(encrypted)).toContain("/Encrypt");
    const decrypted = await decryptPdfIfNeeded(encrypted);
    expect(latin1.decode(decrypted)).not.toContain("/Encrypt");
  });

  it("空パスワードで開けない（/U が一致しない）PDF は明示的に失敗する", async () => {
    const encrypted = buildEncryptedPdf({ content: "x", title: "t", id0 });
    // /U を壊す＝実パスワードが必要な文書と同じ状態にする
    const text = latin1.decode(encrypted);
    const at = text.indexOf("/U <");
    const broken = encrypted.slice();
    broken[at + 4] = "0".charCodeAt(0);
    broken[at + 5] = "0".charCodeAt(0);
    broken[at + 6] = "0".charCodeAt(0);
    broken[at + 7] = "0".charCodeAt(0);
    await expect(decryptPdfIfNeeded(broken)).rejects.toBeInstanceOf(
      PdfPasswordRequiredError,
    );
  });
});

describe("scanObjects", () => {
  it("オブジェクトの番号・世代・範囲を取り出す", () => {
    const src = bytes(
      "%PDF-1.4\n1 0 obj\n<< /A 1 >>\nendobj\n12 3 obj\n42\nendobj\n",
    );
    const found = scanObjects(src, () => null);
    expect(found.map((o) => [o.num, o.gen])).toEqual([
      [1, 0],
      [12, 3],
    ]);
    expect(found[0].stream).toBeNull();
  });

  it("ストリームの範囲を /Length から決める", () => {
    const src = bytes(
      "1 0 obj\n<< /Length 5 >>\nstream\nHELLO\nendstream\nendobj\n",
    );
    const found = scanObjects(src, () => 5);
    expect(found).toHaveLength(1);
    const { stream } = found[0];
    expect(stream).not.toBeNull();
    expect(latin1.decode(src.subarray(stream!.start, stream!.end))).toBe(
      "HELLO",
    );
  });

  it("/Length が誤っていても endstream を走査して復帰する", () => {
    const src = bytes(
      "1 0 obj\n<< /Length 999 >>\nstream\nHELLO\nendstream\nendobj\n",
    );
    const found = scanObjects(src, () => 999);
    const { stream } = found[0];
    expect(latin1.decode(src.subarray(stream!.start, stream!.end))).toBe(
      "HELLO",
    );
  });

  it("文字列の中に endobj があっても誤検出しない", () => {
    const src = bytes(
      "1 0 obj\n<< /T (endobj fake) >>\nendobj\n2 0 obj\n<< >>\nendobj\n",
    );
    const found = scanObjects(src, () => null);
    expect(found.map((o) => o.num)).toEqual([1, 2]);
  });

  it("バイナリストリーム内の endobj/obj バイト列に誤反応しない", () => {
    const binary = "\x00\x01 endobj 5 0 obj \xff";
    const src = bytes(
      `1 0 obj\n<< /Length ${binary.length} >>\nstream\n${binary}\nendstream\nendobj\n`,
    );
    const found = scanObjects(src, () => binary.length);
    expect(found.map((o) => o.num)).toEqual([1]);
  });
});

// Reference/ はリポジトリ管理外のため、存在する環境でのみ実ファイルで検証する。
const LOGO = "Reference/logo.pdf";
describe.skipIf(!existsSync(LOGO))(
  "logo.pdf（実ファイル・Acrobat 生成）",
  () => {
    it("復号して pdf-lib で保存できる（元は保存できなかった）", async () => {
      const original = new Uint8Array(readFileSync(LOGO));
      await expect(PDFDocument.load(original)).rejects.toThrow(/encrypted/i);

      const decrypted = await decryptPdfIfNeeded(original);
      const doc = await PDFDocument.load(decrypted);
      expect(doc.getPageCount()).toBe(2);
      // Acrobat が付けた /Info /Title が正しく復号できている＝鍵導出が仕様どおり
      expect(doc.getTitle()).toBe("logo");

      const saved = await doc.save();
      expect(saved.length).toBeGreaterThan(1000);
      expect(latin1.decode(saved)).not.toContain("/Encrypt");
    });
  },
);
