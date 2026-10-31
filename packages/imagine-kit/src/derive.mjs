import { GATES, gateItems, gateSatisfied } from "./gates.mjs";
import { resolveRef } from "./sources.mjs";

const STALE_FROM = new Set(["approved", "proposed"]);

export const reviewHints = (items) => items.filter((i) => i.watch.length).map((i) => ({ item: i.id, sources: i.watch.map((w) => w.source) }));

export function deriveAll(ctx) {
  const records = ctx.project.items;
  const direct = new Map();
  const watched = new Map();
  for (const [id, rec] of Object.entries(records)) {
    const reasons = [];
    for (const [ref, recorded] of Object.entries(rec.inputs ?? {})) {
      const current = resolveRef(ctx, ref, recorded);
      if (current === undefined || current === recorded) continue;
      reasons.push({ kind: "stale", source: ref, recorded, current: current ?? "missing" });
    }
    if (rec.kind === "shot-stage" && Number.isInteger(rec.rev) && rec.rev > (ctx.story.front?.imagine_rev ?? 0)) {
      reasons.push({ kind: "uncommitted", source: id });   // left by a patch whose STORY.md commit never happened
    }
    direct.set(id, reasons);
    watched.set(id, Object.entries(rec.watch ?? {})
      .filter(([ref, recorded]) => { const current = resolveRef(ctx, ref, recorded); return current !== undefined && current !== recorded; })
      .map(([ref]) => ({ source: ref })));
  }
  const memo = new Map();
  const visiting = new Set();
  const isStale = (id) => {
    if (memo.has(id)) return memo.get(id);
    const rec = records[id];
    if (!rec || !STALE_FROM.has(rec.status) || visiting.has(id)) return false;
    visiting.add(id);
    for (const ref of Object.keys(rec.inputs ?? {})) {
      if (ref !== id && records[ref] && isStale(ref)) direct.get(id).push({ kind: "upstream", source: ref });
    }
    visiting.delete(id);
    const stale = direct.get(id).length > 0;
    memo.set(id, stale);
    return stale;
  };
  const items = Object.entries(records).map(([id, rec]) => ({
    id, kind: rec.kind, recorded: rec.status, status: isStale(id) ? "stale" : rec.status, reasons: direct.get(id), watch: watched.get(id) }));
  const byId = new Map(items.map((i) => [i.id, i.status]));
  const gates = {};
  for (const g of GATES) {
    const rows = gateItems(g, ctx).map((id) => ({ id, status: byId.get(id) ?? "missing" }));
    let state = "open";
    if (rows.length === 0) state = "empty";
    else if (rows.every((r) => r.status === "approved")) state = "approved";
    else if (rows.some((r) => r.status === "stale")) state = "reopened";
    gates[g] = { state, items: rows };
  }
  const stage = GATES.find((g) => !gateSatisfied(gates, g)) ?? "done";
  return { items, gates, stage };
}
