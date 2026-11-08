import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyAlpha, computeAlphaMetrics, detectCheckerboard, OPAQUE_OUTLIER_MAX } from "../src/img/alpha.mjs";

const W = 100;
const H = 100;
// pixel(x, y) -> [r, g, b, a]
const img = (pixel, w = W, h = H) => {
  const b = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) b.set(pixel(x, y), (y * w + x) * 4);
  return b;
};
const rect = (x, y, x0, y0, x1, y1) => x >= x0 && x < x1 && y >= y0 && y < y1;
const cls = (b) => classifyAlpha(computeAlphaMetrics(b, W, H), b);

// Measured on a real native PNG: ~85% clear, ~14% solid, solid pixels at 250-254 and not 255.
const bimodal = img((x, y) => (rect(x, y, 30, 30, 70, 70) ? [90, 40, 200, 252] : [0, 0, 0, 0]));

test("metrics: fractions, min/max and bbox", () => {
  const m = computeAlphaMetrics(bimodal, W, H);
  assert.equal(m.min, 0);
  assert.equal(m.max, 252);
  assert.equal(m.opaque, 0.16);
  assert.equal(m.transparent, 0.84);
  assert.deepEqual(m.bbox, { x0: 30, y0: 30, x1: 69, y1: 69 });
});

test("measured bimodal distribution classifies native", () => {
  assert.deepEqual(cls(bimodal), { cls: "native", reason: null });
});

test("fully opaque RGBA is opaque, with or without exact 255", () => {
  assert.deepEqual(cls(img((x, y) => [x, y, 7, 255])), { cls: "opaque", reason: null });
  assert.deepEqual(cls(img((x, y) => [x, y, 7, 250])), { cls: "opaque", reason: null });
});

test("grid-aligned opaque checkerboard is suspect, not opaque", () => {
  const chk = img((x, y) => (((x >> 3) + (y >> 3)) & 1 ? [204, 204, 204, 255] : [255, 255, 255, 255]));
  assert.equal(detectCheckerboard(chk, W, H), true);
  assert.deepEqual(cls(chk), { cls: "suspect", reason: "checkerboard" });
});

test("empty cell is suspect/empty", () => {
  assert.deepEqual(cls(img(() => [0, 0, 0, 0])), { cls: "suspect", reason: "empty" });
});

test("native alpha with the figure on the cell edge is suspect/edge, never opaque", () => {
  assert.deepEqual(cls(img((x, y) => (rect(x, y, 0, 20, 60, 80) ? [1, 2, 3, 255] : [0, 0, 0, 0]))), { cls: "suspect", reason: "edge" });
});

test("a partly opaque border alone never selects the remover", () => {
  const b = img((x, y) => (y < 2 && x < 50 ? [9, 9, 9, 255] : rect(x, y, 30, 30, 70, 70) ? [90, 40, 200, 252] : [0, 0, 0, 0]));
  assert.equal(cls(b).cls, "suspect");
});

test("large opaque region with little transparency is suspect/alpha_shape", () => {
  const frame = img((x, y) => (x < 3 || y < 3 || x >= W - 3 || y >= H - 3 ? [0, 0, 0, 0] : [50, 50, 50, 255]));
  assert.deepEqual(cls(frame), { cls: "suspect", reason: "alpha_shape" });
});

test("large cells finish quickly (no per-pixel allocation, no quadratic scan)", () => {
  const w = 2000, h = 2000;
  const big = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) big.set(x > 500 && x < 1500 && y > 400 && y < 1600 ? [9, 9, 9, 252] : [0, 0, 0, 0], (y * w + x) * 4);
  const t0 = Date.now();
  const m = computeAlphaMetrics(big, w, h);
  assert.equal(classifyAlpha(m, big).cls, "native");
  assert.equal(detectCheckerboard(big, w, h), false);
  assert.ok(Date.now() - t0 < 5000, `took ${Date.now() - t0}ms`);
});

test("100x100 fully alpha 255 except one pixel at alpha 249 is opaque", () => {
  const b = img((x, y) => (x === 0 && y === 0 ? [10, 20, 30, 249] : [10, 20, 30, 255]));
  assert.deepEqual(cls(b), { cls: "opaque", reason: null });
});

test("genuinely transparent image with figure touching border is suspect/edge, not opaque", () => {
  const b = img((x, y) => (x < 70 ? [10, 20, 30, 255] : [0, 0, 0, 0]));
  const m = computeAlphaMetrics(b, W, H);
  assert.equal(m.transparent, 0.3);
  assert.deepEqual(classifyAlpha(m, b), { cls: "suspect", reason: "edge" });
});

test("a 2% non-solid image is not opaque", () => {
  const b = img((x, y) => (y < 2 ? [0, 0, 0, 0] : [10, 20, 30, 255]));
  const result = cls(b);
  assert.notEqual(result.cls, "opaque");
});

test("opaque-by-tolerance painted checkerboard returns suspect/checkerboard", () => {
  const chk = img((x, y) => {
    const rgb = ((x >> 3) + (y >> 3)) & 1 ? [204, 204, 204] : [255, 255, 255];
    const a = x === 0 && y === 0 ? 249 : 255;
    return [...rgb, a];
  });
  assert.equal(detectCheckerboard(chk, W, H), true);
  assert.deepEqual(cls(chk), { cls: "suspect", reason: "checkerboard" });
});

test("hand-built metrics without numeric opaque falls back to min >= ALPHA_SOLID", () => {
  assert.deepEqual(classifyAlpha({ min: 250 }), { cls: "opaque", reason: null });
  assert.deepEqual(classifyAlpha({ min: 249, fill: 0.5, edge: 0.01, transparent: 0.3 }), { cls: "native", reason: null });
});

test("OPAQUE_OUTLIER_MAX is exported as 0.001", () => {
  assert.equal(OPAQUE_OUTLIER_MAX, 0.001);
});

test("short buffer throws", () => {
  assert.throws(() => computeAlphaMetrics(Buffer.alloc(10), W, H), RangeError);
});
