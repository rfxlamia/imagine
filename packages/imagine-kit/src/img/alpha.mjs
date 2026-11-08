import { SHEET_EDGE_MAX, SHEET_EDGE_PX, SHEET_MIN_FILL } from "./sheet.mjs";

// A real native PNG is bimodal and its solid pixels sit at 250-254, so "opaque" allows at most 0.1% of pixels below alpha 250, not == 255.
export const ALPHA_SOLID = 250;
export const ALPHA_CLEAR = 5;
export const ALPHA_FILL = 128; // same cut as checkCellAlpha, so fill and edge keep their meaning
export const NATIVE_MIN_TRANSPARENT = 0.2; // provisional; Spec B sets the final value
export const OPAQUE_OUTLIER_MAX = 0.001;

export function computeAlphaMetrics(rgba, w, h) {
  const total = w * h;
  if (total === 0 || rgba.length < total * 4) throw new RangeError("rgba buffer too short");
  let min = 255, max = 0, clear = 0, partial = 0, solid = 0, fill = 0, edgeTotal = 0, edgeFill = 0;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    const edgeY = y < SHEET_EDGE_PX || y >= h - SHEET_EDGE_PX;
    for (let x = 0; x < w; x++) {
      const a = rgba[(y * w + x) * 4 + 3];
      const edge = edgeY || x < SHEET_EDGE_PX || x >= w - SHEET_EDGE_PX;
      if (a < min) min = a;
      if (a > max) max = a;
      if (a <= ALPHA_CLEAR) clear++;
      else if (a >= ALPHA_SOLID) solid++;
      else partial++;
      if (a > ALPHA_CLEAR) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (a >= ALPHA_FILL) fill++;
      if (edge) { edgeTotal++; if (a >= ALPHA_FILL) edgeFill++; }
    }
  }
  return { w, h, min, max, transparent: clear / total, partial: partial / total, opaque: solid / total, fill: fill / total,
    edge: edgeTotal ? edgeFill / edgeTotal : 0, bbox: x1 < 0 ? null : { x0, y0, x1, y1 } };
}

// Alpha statistics cannot see a painted fake checkerboard (it is fully opaque), so look at the RGB ring of the cell.
// Detects grid-aligned two-tone block patterns only; anything else falls through to "opaque".
export function detectCheckerboard(rgba, w, h) {
  const lum = new Uint8Array(w * h); // computed once; the tile-size loop below only reads it
  for (let i = 0; i < w * h; i++) lum[i] = (rgba[i * 4] * 299 + rgba[i * 4 + 1] * 587 + rgba[i * 4 + 2] * 114) / 1000;
  const band = Math.max(8, Math.floor(Math.min(w, h) * 0.1));
  const STRIDE = 2; // sampling the border ring at stride 2 keeps this cheap on multi-megapixel cells
  for (const s of [4, 6, 8, 10, 12, 16, 20, 24, 32]) {
    if (s * 2 > w || s * 2 > h) continue;
    const a = lum[(s >> 1) * w + (s >> 1)];
    const b = lum[(s >> 1) * w + s + (s >> 1)];
    if (Math.abs(a - b) < 8) continue;
    let hit = 0, tot = 0;
    for (let y = 0; y < h; y += STRIDE) {
      const inner = y >= band && y < h - band;
      for (let x = 0; x < w; x += STRIDE) {
        if (inner && x >= band && x < w - band) { x = w - band - STRIDE; continue; } // jump over the interior
        tot++;
        const expect = (((x / s) | 0) + ((y / s) | 0)) & 1 ? b : a;
        if (Math.abs(lum[y * w + x] - expect) <= 6) hit++;
      }
    }
    if (tot && hit / tot >= 0.9) return true;
  }
  return false;
}

// Fixed order, first match wins: opaque, then suspect, then native.
export function classifyAlpha(m, rgba = null) {
  const opaque = typeof m.opaque === "number" ? 1 - m.opaque <= OPAQUE_OUTLIER_MAX : m.min >= ALPHA_SOLID;
  if (opaque) {
    return rgba && detectCheckerboard(rgba, m.w, m.h) ? { cls: "suspect", reason: "checkerboard" } : { cls: "opaque", reason: null };
  }
  if (m.fill < SHEET_MIN_FILL) return { cls: "suspect", reason: "empty" };
  if (m.edge > SHEET_EDGE_MAX) return { cls: "suspect", reason: "edge" };
  if (m.transparent < NATIVE_MIN_TRANSPARENT) return { cls: "suspect", reason: "alpha_shape" };
  return { cls: "native", reason: null };
}
