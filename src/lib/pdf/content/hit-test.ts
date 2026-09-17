import type { PageGlyph } from "./text-layout";

/** PDF のユーザー空間の点を画面（CSS ピクセル）の点に変換する関数。 */
export type PointMapper = (x: number, y: number) => [number, number];

type Point = [number, number];

/** グリフの四隅を画面座標にする。 */
function screenQuad(glyph: PageGlyph, toScreen: PointMapper): Point[] {
  const q = glyph.quad;
  return [0, 2, 4, 6].map((i) => toScreen(q[i]!, q[i + 1]!));
}

/** 点が凸多角形（頂点を順に並べたもの）の内側にあるか。 */
function insidePolygon([px, py]: Point, polygon: Point[]): boolean {
  let sign = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const [ax, ay] = polygon[i]!;
    const [bx, by] = polygon[(i + 1) % polygon.length]!;
    const cross = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
    if (Math.abs(cross) < 1e-9) continue;
    const s = Math.sign(cross);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

/** 点から線分までの距離。 */
function distanceToSegment([px, py]: Point, [ax, ay]: Point, [bx, by]: Point) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t =
    len2 === 0
      ? 0
      : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * 画面上の点にあるグリフの番号。どのグリフにも含まれなければ、
 * `tolerance`（画面ピクセル）以内で最も近いグリフ、無ければ null。
 */
export function glyphAt(
  glyphs: readonly PageGlyph[],
  point: Point,
  toScreen: PointMapper,
  tolerance = 3,
): number | null {
  let nearest: number | null = null;
  let nearestDistance = Infinity;
  for (let i = 0; i < glyphs.length; i += 1) {
    const polygon = screenQuad(glyphs[i]!, toScreen);
    if (insidePolygon(point, polygon)) return i;
    for (let k = 0; k < 4; k += 1) {
      const d = distanceToSegment(point, polygon[k]!, polygon[(k + 1) % 4]!);
      if (d < nearestDistance) {
        nearestDistance = d;
        nearest = i;
      }
    }
  }
  return nearestDistance <= tolerance ? nearest : null;
}

export interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** グリフ範囲 [start, end) を囲む画面上の最小の矩形（空の範囲は null）。 */
export function selectionRect(
  glyphs: readonly PageGlyph[],
  start: number,
  end: number,
  toScreen: PointMapper,
): ScreenRect | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = start; i < end; i += 1) {
    const glyph = glyphs[i];
    if (!glyph) continue;
    for (const [x, y] of screenQuad(glyph, toScreen)) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (minX === Infinity) return null;
  return { left: minX, top: minY, width: maxX - minX, height: maxY - minY };
}
