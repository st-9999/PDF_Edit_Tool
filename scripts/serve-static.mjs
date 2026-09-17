// 静的エクスポートの出力（out/）を、GitHub Pages と同じくサブパス（basePath）配下で配信する簡易サーバー。
// 本番ビルドの E2E（playwright.prod.config.ts）で使う。basePath の外へのリクエストは 404 にするため、
// basePath を付け忘れたアセット参照があればテストで検出できる。
//
// 環境変数:
//   SERVE_ROOT      配信するディレクトリ（既定: out）
//   SERVE_PORT      待ち受けポート（必須）
//   SERVE_BASE_PATH 配信するサブパス（例: /pdf-edit-tool。空ならルート配信）
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";

const root = path.resolve(process.env.SERVE_ROOT ?? "out");
const port = Number(process.env.SERVE_PORT);
const basePath = (process.env.SERVE_BASE_PATH ?? "").replace(/\/+$/, "");
const host = "127.0.0.1";

if (!Number.isInteger(port) || port <= 0) {
  console.error("[serve-static] SERVE_PORT を指定してください");
  process.exit(1);
}

/** 拡張子 → Content-Type（GitHub Pages と同じくモジュールスクリプトは JavaScript として配信する）。 */
const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
};

async function fileAt(filePath) {
  try {
    const info = await stat(filePath);
    if (info.isFile()) return filePath;
    if (info.isDirectory()) {
      const index = path.join(filePath, "index.html");
      return (await stat(index)).isFile() ? index : null;
    }
  } catch {
    // 存在しない
  }
  return null;
}

function send(res, status, filePath) {
  const type =
    CONTENT_TYPES[path.extname(filePath).toLowerCase()] ??
    "application/octet-stream";
  res.writeHead(status, { "Content-Type": type });
  createReadStream(filePath).pipe(res);
}

async function notFound(res) {
  const page = await fileAt(path.join(root, "404.html"));
  if (page) send(res, 404, page);
  else res.writeHead(404).end();
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${host}`);
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return notFound(res);
  }
  if (basePath && pathname === basePath) {
    res.writeHead(301, { Location: `${basePath}/` }).end();
    return;
  }
  if (basePath && !pathname.startsWith(`${basePath}/`)) return notFound(res);

  const relative = pathname.slice(basePath.length);
  const target = path.resolve(root, `.${relative}`);
  if (target !== root && !target.startsWith(root + path.sep)) {
    return notFound(res);
  }
  const file = await fileAt(target);
  if (!file) return notFound(res);
  send(res, 200, file);
});

server.listen(port, host, () => {
  console.log(
    `[serve-static] http://${host}:${port}${basePath}/ → ${path.relative(process.cwd(), root) || "."}`,
  );
});
