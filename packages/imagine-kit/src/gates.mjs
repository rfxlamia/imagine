import { bibleEntities, latestAssets } from "./docs.mjs";

export const GATES = ["G0", "G1", "G2", "G3", "G4", "G5r", "G5a", "G5b", "G6", "G7"];
export const PREREQ = { G0: [], G1: ["G0"], G2: ["G1"], G3: ["G2"], G4: ["G3"], G5r: ["G4"], G5a: ["G4"], G5b: ["G5r"], G6: ["G5a", "G5b"], G7: ["G6"] };
// A quote is blank when nothing visible remains after removing whitespace, separators and invisible format characters
// (zero-width space/joiner included), so a hidden-character quote cannot satisfy GATE-QUOTE.
export const isBlankQuote = (q) => String(q ?? "").replace(/[\p{Cf}\p{Z}\s]/gu, "") === "";
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
