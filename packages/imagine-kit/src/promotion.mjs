import { err } from "./envelope.mjs";
import { deriveAll } from "./derive.mjs";
import { saveManifest } from "./docs.mjs";
import { ancestors, applyAssetDecision, gateItems, gateSatisfied, itemDeps, itemKind } from "./gates.mjs";
import { appendJournal } from "./journal.mjs";
import { saveProject } from "./project.mjs";
import { SUPERSEDED, createContext, resolveRef } from "./sources.mjs";

// A passed Checkpoint is the evidence that replaces the user's approval of the Legacy_Gates it covers (Requirements 1.1-1.12).
// The kit records that replacement so every existing guard (tts, img, export-hf, stage-shot, render --final, assets-check)
// keeps reading one approval record. The record carries `decision.source` instead of a user quote: it is never a user answer.
export const CHECKPOINT_GATES = Object.freeze({ Q1: ["G0", "G1", "G2", "G3", "G4"], Q2: ["G5r", "G5a", "G5b"], Q3: ["G6"] });
export const checkpointSource = (checkpointId) => `checkpoint:${checkpointId}`;
export const isCheckpointDecision = (decision) => typeof decision?.source === "string" && decision.source.startsWith("checkpoint:");

// Records `approved` on every item of the Checkpoint's gates that is not approved now (pending, proposed, stale or missing).
// Items the user rejected stay rejected, and an asset with unreviewed integrity flags stays pending. A gate whose
// prerequisites are not satisfied is left alone. Call only when the unscoped Checkpoint is `passed`.
export function promoteCheckpoint(dir, checkpointId, { now = new Date() } = {}) {
  const gates = CHECKPOINT_GATES[checkpointId] ?? [];
  const sctx = createContext(dir);
  const at = now.toISOString();
  const promoted = [];
  const skipped = [];
  const errors = [];
  for (const gate of gates) {
    const derived = deriveAll(sctx);
    const blockers = ancestors(gate).filter((g) => !gateSatisfied(derived.gates, g));
    if (blockers.length) { skipped.push({ id: gate, reason: `${blockers.join(", ")} not cleared yet` }); continue; }
    const status = new Map(derived.items.map((i) => [i.id, i.status]));
    for (const id of gateItems(gate, sctx)) {
      if (status.get(id) === "approved") continue;
      if (sctx.project.items[id]?.status === "rejected") { skipped.push({ id, reason: "rejected by the user" }); continue; }
      const m = id.match(/^asset:(.+)\.v(\d+)$/);
      const asset = m && sctx.manifest.assets.find((a) => a.id === m[1] && a.v === Number(m[2]));
      if (asset?.integrity_flags?.length) { skipped.push({ id, reason: `has review flags (${asset.integrity_flags.join(", ")})` }); continue; }
      const inputs = {};
      let bad = false;
      for (const dep of itemDeps(id, sctx)) {
        const v = resolveRef(sctx, dep, undefined);
        if (v === null || v === SUPERSEDED) { errors.push(err("HARD-GATES-RECORDED", "HARD", id, `cannot record ${dep}: ${v === null ? "source not found" : "not the current version"}`)); bad = true; continue; }
        inputs[dep] = v === undefined ? "item" : v;
      }
      if (bad) continue;
      sctx.project.items[id] = { ...sctx.project.items[id], kind: itemKind(id), status: "approved", gate,
        decision: { decision: "approve", source: checkpointSource(checkpointId), at }, inputs };
      if (id.startsWith("asset:")) applyAssetDecision(sctx.manifest, id, "approve");
      promoted.push(id);
    }
    if (gate === "G0" && sctx.project.items.g0?.status === "approved") sctx.project.g0.status = "approved";
  }
  if (promoted.length) {
    saveProject(dir, sctx.project);
    if (promoted.some((id) => id.startsWith("asset:"))) saveManifest(dir, sctx.manifest);
    const journal_id = appendJournal(dir, { command: "checkpoint", summary: `${checkpointId} passed; recorded ${promoted.join(",")}`, now });
    return { promoted, skipped, errors, journal_id };
  }
  return { promoted, skipped, errors, journal_id: null };
}
