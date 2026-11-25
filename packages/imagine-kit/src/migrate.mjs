import { DELIVERY, LEGACY_TO_CHECKPOINT } from "./gate-classification.mjs";
import { isBlankQuote } from "./gates.mjs";

export const MIGRATION_EVALUATOR = "legacy-gate-migration";
export const MIGRATION_RULE_VERSION = "migration-v1";

// Every approved quote is preserved byte-for-byte as a Consent_Record (Requirement 13.1/13.2, Property 25).
// Migrated quotes (every gate, G4 included) use the reserved legacy_approval kind, scoped to the item id, so they never
// satisfy a Material_Change consent check. Ceremonial ones are also listed in the report as ceremonial_quotes_preserved.
const CONSENT_KIND = "legacy_approval";
const CONSENTFUL_GATES = new Set(["G4"]);

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const hasOwn = (o, k) => Object.hasOwn(o, k);

// Maps Legacy_Gate records onto Item_State + Evidence_Record + Consent_Record (Requirement 13).
// Pure: the input is never mutated; the migrated project is returned together with a report.
//
// - Approved item with a known gate: gets a synthesized Evidence_Record (result passed, not re-running any Check) and
//   `state` ("passed"; "ready" for G7, the delivery state; G0 is an item set to passed, per the design table).
// - Every approved quote is stored byte-for-byte as a Consent_Record (scope = item id), ceremonial ones included.
// - Unknown gate id, approved without a usable decision/quote: left untouched, listed under `unmapped`.
// - `options.staleIds` (optional Set/array of item ids whose inputs no longer match the sources): left untouched and
//   listed under `stale`, because migration must not vouch for changed inputs (Requirement 13.4).
// Idempotent: records already produced by a previous run are detected and not added again.
export function migrateProject(project, options = {}) {
  const out = structuredClone(project ?? {});
  const stale = new Set(options.staleIds ?? []);
  const report = { migrated: [], unmapped: [], stale: [], ceremonial_quotes_preserved: [], consents: [] };
  if (!isObject(out.items)) return { project: out, report };

  const consents = Array.isArray(out.consents) ? out.consents : [];
  let consentsTouched = false;

  for (const id of Object.keys(out.items).sort()) {
    const item = out.items[id];
    if (!isObject(item) || item.gate === undefined) continue; // not a Legacy_Gate record
    if (item.decision?.source?.startsWith?.("checkpoint:")) continue; // recorded by a passed Checkpoint, not a user answer
    if (item.status !== "approved") continue; // pending / proposed / rejected carry no passed evidence
    if (typeof item.gate !== "string" || !hasOwn(LEGACY_TO_CHECKPOINT, item.gate)) {
      report.unmapped.push({ id, gate: item.gate, reason: "unknown gate id" });
      continue;
    }
    const gate = item.gate;
    const decision = item.decision;
    if (!isObject(decision) || typeof decision.quote !== "string" || isBlankQuote(decision.quote)) {
      report.unmapped.push({ id, gate, reason: "approved record has no recorded quote" });
      continue;
    }
    if (stale.has(id)) {
      report.stale.push({ id, gate, reason: "input hashes no longer match; a new Check run is required" });
      continue;
    }
    const target = LEGACY_TO_CHECKPOINT[gate];
    const at = typeof decision.at === "string" ? decision.at : "";
    const checkId = `legacy-${gate}`;

    const evidence = Array.isArray(item.evidence) ? item.evidence : [];
    const done = evidence.some((e) => e?.evaluator === MIGRATION_EVALUATOR && e?.checkId === checkId);
    if (!done) {
      const inputHashes = {};
      for (const [k, v] of Object.entries(isObject(item.inputs) ? item.inputs : {})) inputHashes[k] = String(v);
      evidence.push({
        evaluator: MIGRATION_EVALUATOR,
        evaluatorCapabilities: ["legacy-record"],
        ruleVersion: MIGRATION_RULE_VERSION,
        inputHashes,
        outputRefs: [],
        at,
        result: "passed",
        checkId,
      });
      item.evidence = evidence;
    }
    const state = target === DELIVERY ? "ready" : "passed";
    if (item.state === undefined) item.state = state;

    const kind = CONSENT_KIND;
    const exists = consents.some((c) => c?.kind === kind && c?.scope === id && c?.quote === decision.quote);
    if (!exists) {
      consents.push({ kind, scope: id, quote: decision.quote, at });
      consentsTouched = true;
    }
    report.consents.push({ id, gate, kind });
    if (!CONSENTFUL_GATES.has(gate)) {
      report.ceremonial_quotes_preserved.push({ id, gate, target, quote: decision.quote, kind });
    }
    report.migrated.push({ id, gate, target, state });
  }

  if (consentsTouched) out.consents = consents;
  return { project: out, report };
}
