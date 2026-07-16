/**
 * 暗号化 PDF を復号し、暗号化されていない PDF バイト列へ書き直す。
 *
 * pdf-lib には復号機能が無く、`ignoreEncryption: true` を渡しても中身は暗号文のままで
 * 解析に失敗する。一方 pdf.js は閲覧時に復号できるため「表示はできるのに保存できない」
 * という状態が起きる。ここで復号済みバイト列を作って pdf-lib へ渡すことで解消する。
 *
 * 対象は「空のユーザーパスワードで開ける」文書（＝閲覧は自由だが権限フラグで
 * 編集が制限されている PDF）。出力は暗号化を解除した通常の PDF になる。
 */
import {
  PDFArray,
  PDFContext,
  PDFDict,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFObject,
  PDFObjectParser,
  PDFRef,
  PDFString,
} from "pdf-lib";
import {
  createDecryptor,
  PdfUnsupportedEncryptionError,
  type Cfm,
  type Decryptor,
  type EncryptParams,
} from "./standard-security";
import { indexOfKeyword, scanObjects, type ScannedObject } from "./scanner";

export {
  PdfPasswordRequiredError,
  PdfUnsupportedEncryptionError,
} from "./standard-security";

const latin1 = new TextDecoder("latin1");

function encodeAscii(text: string): Uint8Array {
  return Uint8Array.from(text, (ch) => ch.charCodeAt(0));
}

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

function concatChunks(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/** バイト列を 1 つの PDF オブジェクトとして解析する（失敗時 null）。 */
function parseValue(bytes: Uint8Array, context: PDFContext): PDFObject | null {
  try {
    return PDFObjectParser.forBytes(bytes, context).parseObject();
  } catch {
    return null;
  }
}

function asBytes(obj: PDFObject | undefined): Uint8Array | null {
  if (obj instanceof PDFString || obj instanceof PDFHexString) {
    return obj.asBytes();
  }
  return null;
}

function asNumber(obj: PDFObject | undefined): number | null {
  return obj instanceof PDFNumber ? obj.asNumber() : null;
}

function cfmOf(name: string | null): Cfm {
  switch (name) {
    case "AESV2":
      return "AESV2";
    case "AESV3":
      return "AESV3";
    case "Identity":
      return "Identity";
    default:
      return "V2";
  }
}

/** /Encrypt 辞書から鍵導出パラメータを組み立てる。 */
function readEncryptParams(dict: PDFDict): EncryptParams {
  const filter = dict.get(PDFName.of("Filter"));
  if (filter instanceof PDFName && filter.asString() !== "/Standard") {
    throw new PdfUnsupportedEncryptionError(
      `${filter.asString()}（標準セキュリティハンドラ以外）`,
    );
  }

  const v = asNumber(dict.get(PDFName.of("V"))) ?? 0;
  const r = asNumber(dict.get(PDFName.of("R"))) ?? 0;
  const lengthBits = asNumber(dict.get(PDFName.of("Length"))) ?? 40;
  const p = asNumber(dict.get(PDFName.of("P"))) ?? 0;
  const o = asBytes(dict.get(PDFName.of("O")));
  const u = asBytes(dict.get(PDFName.of("U")));
  const ue = asBytes(dict.get(PDFName.of("UE")));

  if (!o || !u) {
    throw new PdfUnsupportedEncryptionError("/O または /U がありません");
  }

  const encryptMetadataObj = dict.get(PDFName.of("EncryptMetadata"));
  const encryptMetadata = String(encryptMetadataObj ?? "true") !== "false";

  // V4/V5 は /CF の中の名前付きフィルタを /StmF・/StrF で選ぶ
  let stmF: Cfm = "V2";
  let strF: Cfm = "V2";
  if (v >= 4) {
    const cf = dict.get(PDFName.of("CF"));
    const stmName = dict.get(PDFName.of("StmF"));
    const strName = dict.get(PDFName.of("StrF"));

    const resolveCfm = (filterName: PDFObject | undefined): Cfm => {
      if (!(filterName instanceof PDFName)) return "Identity";
      const raw = filterName.asString().replace(/^\//, "");
      if (raw === "Identity") return "Identity";
      if (!(cf instanceof PDFDict)) return "Identity";
      const entry = cf.get(PDFName.of(raw));
      if (!(entry instanceof PDFDict)) return "Identity";
      const cfm = entry.get(PDFName.of("CFM"));
      return cfmOf(
        cfm instanceof PDFName ? cfm.asString().replace(/^\//, "") : null,
      );
    };

    // /StmF・/StrF の既定値は /Identity（ISO 32000-1 Table 20）
    stmF = stmName ? resolveCfm(stmName) : "Identity";
    strF = strName ? resolveCfm(strName) : "Identity";
  }

  return { v, r, lengthBits, o, u, ue, p, encryptMetadata, stmF, strF };
}

/** 文字列を再帰的に復号し、安全のためすべて 16 進文字列として組み立て直す。 */
function decryptStrings(
  obj: PDFObject,
  context: PDFContext,
  decrypt: Decryptor["decryptString"],
  num: number,
  gen: number,
): PDFObject {
  if (obj instanceof PDFString || obj instanceof PDFHexString) {
    const plain = decrypt(obj.asBytes(), num, gen);
    // リテラル文字列のエスケープ問題を避けるため常に 16 進表記で出力する
    return PDFHexString.of(toHex(plain));
  }
  if (obj instanceof PDFArray) {
    const next = PDFArray.withContext(context);
    for (const item of obj.asArray()) {
      next.push(decryptStrings(item, context, decrypt, num, gen));
    }
    return next;
  }
  if (obj instanceof PDFDict) {
    const next = PDFDict.withContext(context);
    for (const [key, value] of obj.entries()) {
      next.set(key, decryptStrings(value, context, decrypt, num, gen));
    }
    return next;
  }
  return obj;
}

function typeOf(obj: PDFObject | null): string | null {
  if (!(obj instanceof PDFDict)) return null;
  const type = obj.get(PDFName.of("Type"));
  return type instanceof PDFName ? type.asString().replace(/^\//, "") : null;
}

interface TrailerInfo {
  encryptRef: PDFRef | null;
  root: PDFObject | null;
  info: PDFObject | null;
  id: PDFArray | null;
}

/**
 * トレーラ情報を集める。古典的な `trailer` 辞書と、
 * クロスリファレンスストリーム（/Type /XRef）の辞書の両方を見る。
 */
function collectTrailer(
  bytes: Uint8Array,
  objects: ScannedObject[],
  context: PDFContext,
): TrailerInfo {
  const result: TrailerInfo = {
    encryptRef: null,
    root: null,
    info: null,
    id: null,
  };

  const apply = (dict: PDFDict) => {
    const encrypt = dict.get(PDFName.of("Encrypt"));
    if (encrypt instanceof PDFRef) result.encryptRef ??= encrypt;
    result.root ??= dict.get(PDFName.of("Root")) ?? null;
    result.info ??= dict.get(PDFName.of("Info")) ?? null;
    const id = dict.get(PDFName.of("ID"));
    if (id instanceof PDFArray) result.id ??= id;
  };

  // 更新履歴がある PDF では後方のトレーラほど新しいため、末尾から探す
  const trailers: number[] = [];
  let from = 0;
  for (;;) {
    const at = indexOfKeyword(bytes, "trailer", from);
    if (at < 0) break;
    trailers.push(at);
    from = at + 7;
  }
  for (const at of trailers.reverse()) {
    const parsed = parseValue(bytes.subarray(at + 7), context);
    if (parsed instanceof PDFDict) apply(parsed);
  }

  for (const obj of objects) {
    const dict = parseValue(
      bytes.subarray(obj.bodyStart, obj.bodyEnd),
      context,
    );
    if (typeOf(dict) === "XRef" && dict instanceof PDFDict) apply(dict);
  }

  return result;
}

/** 10 桁・5 桁のゼロ詰め（xref テーブル用）。 */
function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

/**
 * 暗号化されていれば復号したバイト列を返す。暗号化されていなければ入力をそのまま返す。
 *
 * @throws {PdfPasswordRequiredError} 空パスワードでは開けない場合
 * @throws {PdfUnsupportedEncryptionError} 未対応の暗号化方式の場合
 */
export async function decryptPdfIfNeeded(
  bytes: Uint8Array,
): Promise<Uint8Array> {
  // /Encrypt が全く現れないなら暗号化されていない（大半の PDF はここで即 return）
  if (indexOfKeyword(bytes, "/Encrypt", 0) < 0) return bytes;

  const context = PDFContext.create();

  // /Length を辞書から読む（間接参照なら null を返し、scanner 側が endstream を走査する）
  const lengthOf = (bodyStart: number, bodyEnd: number): number | null => {
    const dict = parseValue(bytes.subarray(bodyStart, bodyEnd), context);
    if (!(dict instanceof PDFDict)) return null;
    return asNumber(dict.get(PDFName.of("Length")));
  };

  const objects = scanObjects(bytes, lengthOf);
  if (objects.length === 0) return bytes;

  const trailer = collectTrailer(bytes, objects, context);
  if (!trailer.encryptRef) return bytes; // /Encrypt という文字列はあったが実際は未暗号化

  const encryptObj = objects.find(
    (o) => o.num === trailer.encryptRef!.objectNumber,
  );
  if (!encryptObj) {
    throw new PdfUnsupportedEncryptionError("/Encrypt 辞書が見つかりません");
  }
  const encryptDict = parseValue(
    bytes.subarray(encryptObj.bodyStart, encryptObj.bodyEnd),
    context,
  );
  if (!(encryptDict instanceof PDFDict)) {
    throw new PdfUnsupportedEncryptionError("/Encrypt 辞書を解析できません");
  }

  const params = readEncryptParams(encryptDict);
  // 鍵導出には最初のファイル ID が要る（/ID の文字列は暗号化されない）
  const id0 = trailer.id
    ? (asBytes(trailer.id.get(0)) ?? new Uint8Array(0))
    : new Uint8Array(0);
  const decryptor = await createDecryptor(params, id0);

  // ---- 復号したオブジェクトを書き出す ----
  const header = (() => {
    const at = indexOfKeyword(bytes, "%PDF-", 0);
    if (at < 0) return "%PDF-1.7";
    let end = at;
    while (end < bytes.length && bytes[end] !== 0x0a && bytes[end] !== 0x0d) {
      end += 1;
    }
    return latin1.decode(bytes.subarray(at, end));
  })();

  const chunks: Uint8Array[] = [];
  let offset = 0;
  const push = (chunk: Uint8Array) => {
    chunks.push(chunk);
    offset += chunk.length;
  };

  // 2 行目のバイナリコメントは「このファイルはバイナリ」と示す慣習（維持する）
  push(encodeAscii(`${header}\n%\xE2\xE3\xCF\xD3\n`));

  const xref = new Map<number, { offset: number; gen: number }>();
  let maxObjNum = 0;

  for (const obj of objects) {
    // /Encrypt 辞書と XRef ストリームは復号後の文書には不要なので落とす
    if (obj.num === trailer.encryptRef.objectNumber) continue;

    const parsed = parseValue(
      bytes.subarray(obj.bodyStart, obj.bodyEnd),
      context,
    );
    if (parsed === null) continue;
    const type = typeOf(parsed);
    if (type === "XRef") continue;

    // 文字列を復号する（オブジェクトストリーム内の文字列は個別暗号化されないため対象外）
    const body = decryptStrings(
      parsed,
      context,
      decryptor.decryptString,
      obj.num,
      obj.gen,
    );

    let streamData: Uint8Array | null = null;
    if (obj.stream) {
      const raw = bytes.subarray(obj.stream.start, obj.stream.end);
      // /EncryptMetadata false のときメタデータストリームは暗号化されていない
      const skip = type === "Metadata" && !params.encryptMetadata;
      streamData = skip
        ? raw.slice()
        : decryptor.decryptStream(raw, obj.num, obj.gen);
      if (body instanceof PDFDict) {
        body.set(PDFName.of("Length"), PDFNumber.of(streamData.length));
      }
    }

    xref.set(obj.num, { offset, gen: obj.gen });
    maxObjNum = Math.max(maxObjNum, obj.num);

    push(encodeAscii(`${obj.num} ${obj.gen} obj\n`));
    push(encodeAscii(`${body}\n`));
    if (streamData) {
      push(encodeAscii("stream\n"));
      push(streamData);
      push(encodeAscii("\nendstream\n"));
    }
    push(encodeAscii("endobj\n"));
  }

  // ---- xref テーブルとトレーラ ----
  const size = maxObjNum + 1;
  const xrefOffset = offset;
  let table = `xref\n0 ${size}\n0000000000 65535 f\r\n`;
  for (let i = 1; i < size; i += 1) {
    const entry = xref.get(i);
    table += entry
      ? `${pad(entry.offset, 10)} ${pad(entry.gen, 5)} n\r\n`
      : `0000000000 65535 f\r\n`;
  }
  push(encodeAscii(table));

  const parts: string[] = [`/Size ${size}`];
  if (trailer.root) parts.push(`/Root ${trailer.root}`);
  if (trailer.info) parts.push(`/Info ${trailer.info}`);
  if (trailer.id) parts.push(`/ID ${trailer.id}`);
  push(
    encodeAscii(
      `trailer\n<< ${parts.join(" ")} >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
    ),
  );

  return concatChunks(chunks);
}
