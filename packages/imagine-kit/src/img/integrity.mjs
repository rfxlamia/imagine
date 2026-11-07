// src/img/integrity.mjs
// Advisory diagnostics only. They return flags for G5b review; nothing here proves a figure is complete.
import { ALPHA_FILL } from "./alpha.mjs";

export const PARTIAL_GHOST_MAX = 0.08;
export const FRAG_MAX_COMPONENTS = 12;
export const FRAG_MIN_PX = 20;
export const EDGE_NEAR_PX = 6;
export const FG_DIST = 16;
export const LOSS_RATIO_MAX = 0.03;
export const LOSS_LOWER_MAX = 0.05;

function componentCount(rgba, w, h) {
  const total = w * h;
  const seen = new Uint8Array(total);
  const stack = new Int32Array(total); // each pixel is pushed at most once, so total is a safe bound
  let count = 0;
  for (let start = 0; start < total; start++) {
    if (seen[start] || rgba[start * 4 + 3] < ALPHA_FILL) continue;
    let area = 0;
    let sp = 0;
    seen[start] = 1;
    stack[sp++] = start;
    while (sp > 0) {
      const q = stack[--sp];
      area++;
      const x = q % w;
      if (x > 0 && !seen[q - 1] && rgba[(q - 1) * 4 + 3] >= ALPHA_FILL) { seen[q - 1] = 1; stack[sp++] = q - 1; }
      if (x < w - 1 && !seen[q + 1] && rgba[(q + 1) * 4 + 3] >= ALPHA_FILL) { seen[q + 1] = 1; stack[sp++] = q + 1; }
      if (q >= w && !seen[q - w] && rgba[(q - w) * 4 + 3] >= ALPHA_FILL) { seen[q - w] = 1; stack[sp++] = q - w; }
      if (q + w < total && !seen[q + w] && rgba[(q + w) * 4 + 3] >= ALPHA_FILL) { seen[q + w] = 1; stack[sp++] = q + w; }
    }
    if (area >= FRAG_MIN_PX) count++;
  }
  return count;
}

export function nativeFlags(m, rgba, w, h) {
  const out = [];
  const b = m.bbox;
  if (b && (b.x0 < EDGE_NEAR_PX || b.y0 < EDGE_NEAR_PX || b.x1 >= w - EDGE_NEAR_PX || b.y1 >= h - EDGE_NEAR_PX)) out.push("edge_near");
  if (componentCount(rgba, w, h) > FRAG_MAX_COMPONENTS) out.push("fragmented");
  if (m.partial > PARTIAL_GHOST_MAX) out.push("ghosting");
  return out;
}

// Pixels that clearly differ from the crop's border colour but ended up transparent in the cutout.
// Weak on purpose for pale-on-pale subjects (they barely differ from the backdrop): the review composite is the real defense.
export function fallbackLoss(src, cut, w, h) {
  const band = 4;
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (x < band || y < band || x >= w - band || y >= h - band) { const i = (y * w + x) * 4; r += src[i]; g += src[i + 1]; b += src[i + 2]; n++; }
  }
  const bg = [r / n, g / n, b / n];
  const fg = new Uint8Array(w * h);
  let y0 = h, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (Math.max(Math.abs(src[i] - bg[0]), Math.abs(src[i + 1] - bg[1]), Math.abs(src[i + 2] - bg[2])) > FG_DIST) { fg[y * w + x] = 1; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (y1 < 0) return { ratio: 0, lowerThirdRatio: 0, flags: [] };
  const lowerStart = y0 + Math.floor(((y1 - y0 + 1) * 2) / 3);
  let fgAll = 0, lostAll = 0, fgLow = 0, lostLow = 0;
  for (let y = y0; y <= y1; y++) for (let x = 0; x < w; x++) {
    if (!fg[y * w + x]) continue;
    const lost = cut[(y * w + x) * 4 + 3] < ALPHA_FILL;
    fgAll++; if (lost) lostAll++;
    if (y >= lowerStart) { fgLow++; if (lost) lostLow++; }
  }
  const ratio = fgAll ? lostAll / fgAll : 0;
  const lowerThirdRatio = fgLow ? lostLow / fgLow : 0;
  return { ratio, lowerThirdRatio, flags: ratio > LOSS_RATIO_MAX || lowerThirdRatio > LOSS_LOWER_MAX ? ["foreground_loss"] : [] };
}
