import { existsSync } from "node:fs";
import { join } from "node:path";
import { assetEntry, bibleEntities, currentAsset, latestAssets } from "./docs.mjs";

export const GATES = ["G0", "G1", "G2", "G3", "G4", "G5r", "G5a", "G5b", "G6", "G7"];
export const PREREQ = { G0: [], G1: ["G0"], G2: ["G1"], G3: ["G2"], G4: ["G3"], G5r: ["G4"], G5a: ["G4"], G5b: ["G5r"], G6: ["G5a", "G5b"], G7: ["G6"] };
// A quote is blank when nothing visible remains after removing whitespace, separators and invisible format characters
// (zero-width space/joiner included), so a hidden-character quote cannot satisfy GATE-QUOTE.
export const isBlankQuote = (q) => String(q ?? "").replace(/[\p{Cf}\p{Z}\s\p{Mn}\p{Cc}\u2800\u3164\u115F\u1160\uFFA0]/gu, "") === "";
export function ancestors(gate) {
  const out = new Set();
  const walk = (g) => { for (const p of PREREQ[g]) if (!out.has(p)) { out.add(p); walk(p); } };
  walk(gate);
  return GATES.filter((g) => out.has(g));
}
const OPTIONAL_WHEN_EMPTY = new Set(["G5r", "G5a", "G5b"]);
export const gateSatisfied = (gates, g) => gates[g].state === "approved" || (gates[g].state === "empty" && OPTIONAL_WHEN_EMPTY.has(g));
const ASSET_KINDS = { G5r: ["ref"], G5a: ["vo", "music", "sfx"], G5b: ["img"] };

const assetItems = (ctx, kinds) =>
  latestAssets(ctx.manifest).filter((a) => kinds.includes(a.kind)).map((a) => `asset:${a.id}.v${a.v}`);

export function gateItems(gate, ctx) {
  switch (gate) {
    case "G0": return ["g0"];
    case "G1": return Object.keys(ctx.units.units).sort().map((id) => `unit:${id}`);
    case "G2": return bibleEntities(ctx.bible).map((p) => `bible:${p}`);
    case "G3": return Object.keys(ctx.style).map((a) => `style:${a}`);
    case "G4": return ["g4"];
    case "G5r": case "G5b": return assetItems(ctx, ASSET_KINDS[gate]);
    case "G5a": {
      const items = assetItems(ctx, ASSET_KINDS.G5a);
      return items.length === 0 && ctx.project.g0.silence === "intentional" ? ["g5a"] : items;
    }
    case "G6": return ["g6"];
    case "G7": return ["g7"];
    default: return [];
  }
}

export function itemKind(id) {
  if (id === "g0") return "g0";
  if (/^g\d/.test(id)) return "project";
  return id.split(":")[0];
}

const G0_REFS = ["format", "width", "height", "fps", "audio_mode", "language", "duration_s", "platform", "silence"].map((f) => `g0:${f}`);

// Source references recorded as `inputs` when an item is approved or rejected (source-formats.md section 8).
export function itemDeps(id, ctx) {
  const kind = id.split(":")[0];
  if (id === "g0") return G0_REFS;
  if (kind === "unit") return [id, "g0:audio_mode"];
  if (kind === "bible") return [id, "g0:language"];
  if (kind === "style") return ["output", "typography"].includes(id.slice("style:".length)) ? [id, "g0:format"] : [id];
  if (id === "g4") return ["story:sha", "g0:format", "g0:duration_s", ...(existsSync(join(ctx.dir, "assets", "plan.yaml")) ? ["file:assets/plan.yaml"] : [])];
  if (id === "g5a") return ["g0:silence"];
  if (id === "g6" || id === "g7") {
    const downstream = Object.keys(ctx.project.items).filter((k) => /^(edit|render):/.test(k));
    return [id === "g6" ? "g4" : "g6", "story:sha", ...downstream];
  }
  if (kind === "asset") {
    const m = id.match(/^asset:(.+)\.v(\d+)$/);
    const entry = m && assetEntry(ctx.manifest, m[1], Number(m[2]));
    const deps = [id];
    for (const r of entry?.refs ?? []) {
      const cur = currentAsset(ctx.manifest, r);
      if (cur) deps.push(`asset:${cur.id}.v${cur.v}`);
    }
    return deps;
  }
  return [id];
}

export function applyAssetDecision(manifest, itemId, decision) {
  const m = itemId.match(/^asset:(.+)\.v(\d+)$/);
  const entry = m && assetEntry(manifest, m[1], Number(m[2]));
  if (!entry) return false;
  entry.status = decision === "approve" ? "approved" : "rejected";
  if (entry.kind === "vo") entry.listen_status = decision === "approve" ? "ok" : "redo";
  return true;
}


