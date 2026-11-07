import { test } from "node:test";
import assert from "node:assert/strict";
import { computeAlphaMetrics } from "../src/img/alpha.mjs";
import { fallbackLoss, nativeFlags } from "../src/img/integrity.mjs";

const W = 100, H = 100;
const img = (pixel, w = W, h = H) => {
  const b = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) b.set(pixel(x, y), (y * w + x) * 4);
  return b;
};
const rect = (x, y, x0, y0, x1, y1) => x >= x0 && x < x1 && y >= y0 && y < y1;
const flags = (b) => nativeFlags(computeAlphaMetrics(b, W, H), b, W, H);

test("clean native figure has no flags", () => {
  assert.deepEqual(flags(img((x, y) => (rect(x, y, 30, 30, 70, 70) ? [1, 2, 3, 252] : [0, 0, 0, 0]))), []);
});

test("bounding box near the edge is flagged edge_near", () => {
  assert.deepEqual(flags(img((x, y) => (rect(x, y, 4, 30, 50, 70) ? [1, 2, 3, 252] : [0, 0, 0, 0]))), ["edge_near"]);
});

test("many separate components are flagged fragmented", () => {
  const dot = (x, y) => { for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) if (rect(x, y, 10 + i * 18, 20 + j * 18, 15 + i * 18, 25 + j * 18)) return true; return false; };
  assert.deepEqual(flags(img((x, y) => (dot(x, y) ? [1, 2, 3, 252] : [0, 0, 0, 0]))), ["fragmented"]);
});

test("nativeFlags on a 2000x2000 cell stays fast and does not flag a clean figure", () => {
  const w = 2000, h = 2000;
  const big = Buffer.alloc(w * h * 4);
  for (let y = 400; y < 1600; y++) for (let x = 500; x < 1500; x++) big.set([9, 9, 9, 252], (y * w + x) * 4);
  const t0 = Date.now();
  assert.deepEqual(nativeFlags(computeAlphaMetrics(big, w, h), big, w, h), []);
  assert.ok(Date.now() - t0 < 5000, `took ${Date.now() - t0}ms`);
});

test("a high partial-alpha share is flagged ghosting", () => {
  assert.deepEqual(flags(img((x, y) => (rect(x, y, 30, 30, 70, 70) ? [1, 2, 3, 252] : rect(x, y, 10, 10, 90, 90) ? [1, 2, 3, 100] : [0, 0, 0, 0]))), ["ghosting"]);
});

const SRC = (x, y) => (rect(x, y, 20, 10, 40, 50) ? [200, 50, 50, 255] : [255, 255, 255, 255]);
test("fallback loss: lower third removed is foreground_loss", () => {
  const w = 60, h = 60;
  const src = img(SRC, w, h);
  const cut = img((x, y) => (rect(x, y, 20, 10, 40, 37) ? [200, 50, 50, 255] : [0, 0, 0, 0]), w, h);
  const r = fallbackLoss(src, cut, w, h);
  assert.deepEqual(r.flags, ["foreground_loss"]);
  assert.ok(r.lowerThirdRatio > 0.9);
});

test("fallback loss: intact cutout has no flag", () => {
  const w = 60, h = 60;
  const cut = img((x, y) => (rect(x, y, 20, 10, 40, 50) ? [200, 50, 50, 255] : [0, 0, 0, 0]), w, h);
  assert.deepEqual(fallbackLoss(img(SRC, w, h), cut, w, h), { ratio: 0, lowerThirdRatio: 0, flags: [] });
});
