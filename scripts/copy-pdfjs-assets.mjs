// pdfjs-dist のランタイムアセット（worker / CMap / 標準フォント / wasm）を
// public/pdfjs/ へコピーする。バージョンずれを防ぐため、ビルド/開発前に
// インストール済みの pdfjs-dist から都度コピーする（成果物は gitignore）。
import { cpSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const pkgPath = require.resolve("pdfjs-dist/package.json");
const src = dirname(pkgPath);
const dest = join(process.cwd(), "public", "pdfjs");

/** コピー対象: [元の相対パス, コピー先の相対パス] */
const targets = [
  ["build/pdf.worker.min.mjs", "pdf.worker.min.mjs"],
  ["cmaps", "cmaps"],
  ["standard_fonts", "standard_fonts"],
  ["wasm", "wasm"],
];

if (existsSync(dest)) {
  rmSync(dest, { recursive: true, force: true });
}
mkdirSync(dest, { recursive: true });

for (const [from, to] of targets) {
  const fromPath = join(src, from);
  const toPath = join(dest, to);
  if (!existsSync(fromPath)) {
    console.warn(`[copy-pdfjs-assets] 見つかりません（スキップ）: ${from}`);
    continue;
  }
  cpSync(fromPath, toPath, { recursive: true });
  console.log(`[copy-pdfjs-assets] ${from} -> public/pdfjs/${to}`);
}

console.log("[copy-pdfjs-assets] 完了");
