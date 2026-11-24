import { GATES, gateItems, gateSatisfied } from "./gates.mjs";
import { err } from "./envelope.mjs";
import { resolveRef } from "./sources.mjs";

const STALE_FROM = new Set(["approved", "proposed"]);

export const reviewHints = (items) => items.filter((i) => i.watch.length).map((i) => ({ item: i.id, sources: i.watch.map((w) => w.source) }));

export const ITEM_STATES = ["pending", "validating", "passed", "failed", "repairing", "needs_input", "ready", "published"];
// States a workflow may store on an item. `passed` is never taken from storage; `published` also needs a Consent_Record.
const STORED_STATES = new Set(["validating", "failed", "repairing", "needs_input", "ready"]);

// Latest Evidence_Record per checkId (the array is append-only; later records win).
export function latestEvidence(evidence) {
  const byCheck = new Map();
  for (const e of Array.isArray(evidence) ? evidence : []) byCheck.set(e.checkId, e);
  return [...byCheck.values()];
}

// Item_State from Evidence_Records and Consent_Records (Requirements 6.1, 6.3).
// `passed` derives only from evidence: every latest record `passed`. A Consent_Record can add `published`
// (publication consent scoped to this id on an item already `passed`) but can never produce `passed`.
export function deriveItemState(rec, consents = [], id = null) {
  const latest = latestEvidence(rec?.evidence);
  const stored = STORED_STATES.has(rec?.state) ? rec.state : null;
  let state;
  if (latest.some((e) => e.result === "failed")) state = "failed";
  else if (latest.length && latest.every((e) => e.result === "passed")) state = "passed";
  else if (latest.length) state = stored === "needs_input" ? "needs_input" : "validating";   // not_run: never passed (6.7)
  else state = stored ?? "pending";
  if (state === "passed" && id !== null && consents.some((c) => c.kind === "publication" && c.scope === id)) state = "published";
  return state;
}

// Dependency edges of the graph: id -> ids it depends on (its `inputs` keys that are tracked items).
export function dependencyGraph(records) {
  const graph = {};
  for (const [id, rec] of Object.entries(records)) {
    graph[id] = Object.keys(rec.inputs ?? {}).filter((ref) => ref !== id && Object.hasOwn(records, ref));
  }
  return graph;
}

// True when `target` is reachable from `start` following dependency edges.
const reaches = (graph, start, target) => {
  const seen = new Set();
  const stack = [start];
  while (stack.length) {
    const cur = stack.pop();
    if (cur === target) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    stack.push(...(graph[cur] ?? []));
  }
  return false;
};

// Adds the edge `id` depends on `dep` to `graph` (id -> deps[]). An edge that would close a cycle
// (including a self-edge) is rejected with DAG-CYCLE and the graph is left unchanged (Requirement 9.5).
export function addDependencyEdge(graph, id, dep) {
  if (id === dep || reaches(graph, dep, id)) {
    return { ok: false, errors: [err("DAG-CYCLE", "HARD", id, `dependency ${id} -> ${dep} would create a cycle`)] };
  }
  if (!(graph[id] ?? []).includes(dep)) graph[id] = [...(graph[id] ?? []), dep];
  graph[dep] ??= [];
  return { ok: true, errors: [] };
}

// Transitive dependents of the seed ids (excluding the seeds themselves unless reachable by a cycle).
export function transitiveDependents(graph, seeds) {
  const rev = new Map();
  for (const [id, deps] of Object.entries(graph)) for (const d of deps) (rev.get(d) ?? rev.set(d, []).get(d)).push(id);
  const out = new Set();
  const stack = [...seeds];
  while (stack.length) for (const n of rev.get(stack.pop()) ?? []) if (!out.has(n)) { out.add(n); stack.push(n); }
  return out;
}

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
    if (id === "g6") {
      for (const [ref, recorded] of Object.entries(rec.inputs ?? {})) {
        if (recorded === "item" && /^(edit|render):/.test(ref)) {
          reasons.push({ kind: "legacy-dependency", source: ref });
        }
      }
    }
    const assetMatch = id.match(/^asset:(.+)\.v(\d+)$/);
    const asset = assetMatch && ctx.manifest.assets.find((a) => a.id === assetMatch[1] && a.v === Number(assetMatch[2]));
    if (asset?.kind === "vo" && asset.line && (typeof asset.params_hash === "string" || asset.take !== undefined || asset.seed !== undefined || asset.voice !== undefined)
      && !Object.hasOwn(rec.inputs ?? {}, `tts:take:${asset.line}.v${asset.v}`)) {
      reasons.push({ kind: "legacy-dependency", source: `tts:take:${asset.line}.v${asset.v}` });
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
    for (const [ref, recorded] of Object.entries(rec.inputs ?? {})) {
      if (ref === id) continue;
      if (records[ref] && isStale(ref)) direct.get(id).push({ kind: "upstream", source: ref });
      // A rejected or missing item no longer backs this approval; pending/proposed items remain reviewable but do not stale dependants.
      else if (records[ref]?.status === "rejected" || (recorded === "item" && !records[ref])) direct.get(id).push({ kind: "upstream", source: ref });
    }
    visiting.delete(id);
    const stale = direct.get(id).length > 0;
    memo.set(id, stale);
    return stale;
  };
  // Item_State (additive; `status` above is untouched). An item whose Evidence_Record input hash no longer matches
  // its source resets to pending, and its transitive dependents are marked stale (Requirements 6.10, 9.3, 9.4).
  const consents = ctx.project.consents ?? [];
  const states = new Map();
  const changed = new Set();
  for (const [id, rec] of Object.entries(records)) {
    let state = deriveItemState(rec, consents, id);
    const hashChanged = latestEvidence(rec.evidence).some((e) => Object.entries(e.inputHashes ?? {}).some(([ref, recorded]) => {
      const current = resolveRef(ctx, ref, recorded);
      return current !== undefined && current !== recorded;
    }));
    if (hashChanged) {
      changed.add(id);
      if (state === "passed" || state === "published") state = "pending";
    }
    states.set(id, state);
  }
  const staleItems = new Set([...changed, ...transitiveDependents(dependencyGraph(records), changed)]);
  const items = Object.entries(records).map(([id, rec]) => ({
    id, kind: rec.kind, recorded: rec.status, status: isStale(id) ? "stale" : rec.status, reasons: direct.get(id), watch: watched.get(id),
    state: states.get(id), stale: staleItems.has(id) }));
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
