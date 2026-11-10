import { ShortsError } from "../errors.mjs";
import { round6 } from "../run/fsx.mjs";

export const PARTITION = { weight: 10, short_ratio: 0.5, short_penalty: 50, uncertain_cost: 3 };

export const durCost = (d, target) => PARTITION.weight * ((d - target) / target) ** 2 + (d < PARTITION.short_ratio * target ? PARTITION.short_penalty : 0);

// Global optimum of sum(cutCost) + sum(durCost(part)) with every part <= max_s. O(n * k), k = candidates per max window.
export function partition(candidates, { timeline, target_s, max_s }) {
  const start = { id: null, frame: 0, t: 0, cost: 0, kind: "start", forced_only: false, evidence: [] };
  const end = { id: null, frame: timeline.frame_count, t: timeline.duration_s, cost: 0, kind: "end", forced_only: false, forced_reason: null, evidence: [] };
  const inner = candidates.filter((c) => c.frame > 0 && c.frame < timeline.frame_count).sort((a, b) => a.frame - b.frame);
  const nodes = [start, ...inner, end];
  const n = nodes.length;
  const best = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  best[0] = 0;
  for (let j = 1; j < n; j++) {
    for (let i = j - 1; i >= 0; i--) {
      const d = nodes[j].t - nodes[i].t;
      if (d > max_s + 1e-9) break;
      if (best[i] === Infinity || d <= 0) continue;
      const c = best[i] + durCost(d, target_s) + nodes[j].cost;
      if (c < best[j]) { best[j] = c; prev[j] = i; }
    }
  }
  if (best[n - 1] === Infinity) {
    throw new ShortsError("HARD", `no partition keeps every part at or under ${max_s} s`, { check: "partition", detail: { candidates: inner.length, duration_s: timeline.duration_s } });
  }
  const path = [];
  for (let k = n - 1; k !== -1; k = prev[k]) path.unshift(k);
  const parts = [];
  for (let p = 1; p < path.length; p++) {
    const a = nodes[path[p - 1]];
    const b = nodes[path[p]];
    parts.push({ start_frame: a.frame, end_frame: b.frame, start_s: a.t, end_s: b.t, duration_s: round6(b.t - a.t), boundary: b });
  }
  return { parts, total_cost: round6(best[n - 1]) };
}
