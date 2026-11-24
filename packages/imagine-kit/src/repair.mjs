import { dependencyGraph, latestEvidence, transitiveDependents } from "./derive.mjs";
import { err } from "./envelope.mjs";
import { appendJournal } from "./journal.mjs";
import { loadProject, saveProject } from "./project.mjs";

// Maximum repair attempts per (item, errorClass). Single source for the budgets in the design threshold table.
export const REPAIR_BUDGETS = Object.freeze({
  "asset-regeneration": 2, // PROC-IMG-RETRY
  "scene-lint": 3, // PROC-SCENE-LINT-BLOCKED
  "patch-rejection": 3, // PROC-PATCH-ROUNDS
  default: 2,
});

export function budgetFor(errorClass) {
  return Object.hasOwn(REPAIR_BUDGETS, errorClass) && errorClass !== "default" ? REPAIR_BUDGETS[errorClass] : REPAIR_BUDGETS.default;
}

// Increments attempts for (itemId, errorClass), appends the strategy to strategiesTried, and journals once.
// Only that item's entry for that error class changes. Returns { attempts, strategiesTried, journal_id }.
export function recordRepairAttempt(dir, itemId, errorClass, strategy, { now = new Date() } = {}) {
  const project = loadProject(dir);
  const item = (project.items[itemId] ??= { kind: "item", status: "pending" });
  const repairs = (item.repairs ??= {});
  const entry = (repairs[errorClass] ??= { attempts: 0, strategiesTried: [] });
  entry.attempts += 1;
  entry.strategiesTried.push(strategy);
  saveProject(dir, project);
  const journal_id = appendJournal(dir, {
    command: "repair",
    summary: `${itemId} ${errorClass} attempt=${entry.attempts}/${budgetFor(errorClass)} strategy=${strategy}`,
    now,
  });
  return { attempts: entry.attempts, strategiesTried: [...entry.strategiesTried], journal_id };
}

// True when recorded attempts have reached the budget for the error class.
export function budgetExhausted(project, itemId, errorClass) {
  const attempts = project?.items?.[itemId]?.repairs?.[errorClass]?.attempts ?? 0;
  return attempts >= budgetFor(errorClass);
}

// Strategy tables per error class, in preference order (Requirement 7.1). `materialChange` strategies alter the
// Creative_Brief's substance and need a matching Consent_Record before they are applied (7.8).
// scene-lint ends with a build-strategy change so the strategy changes automatically before escalation (7.6).
export const REPAIR_STRATEGIES = Object.freeze({
  "asset-regeneration": Object.freeze([
    Object.freeze({ id: "regenerate-new-seed", materialChange: false }),
    Object.freeze({ id: "regenerate-reworded-prompt", materialChange: false }),
    Object.freeze({ id: "replace-with-alternate-subject", materialChange: true }),
  ]),
  "scene-lint": Object.freeze([
    Object.freeze({ id: "fix-lint-findings-in-place", materialChange: false }),
    Object.freeze({ id: "rebuild-scene-from-template", materialChange: false }),
    Object.freeze({ id: "switch-build-strategy", materialChange: false }),
  ]),
  "patch-rejection": Object.freeze([
    Object.freeze({ id: "redispatch-on-current-base", materialChange: false }),
    Object.freeze({ id: "narrow-patch-scope", materialChange: false }),
    Object.freeze({ id: "split-patch-per-owner", materialChange: false }),
  ]),
  default: Object.freeze([
    Object.freeze({ id: "retry-with-adjusted-inputs", materialChange: false }),
    Object.freeze({ id: "rebuild-from-sources", materialChange: false }),
  ]),
});

export function strategiesFor(errorClass) {
  return Object.hasOwn(REPAIR_STRATEGIES, errorClass) && errorClass !== "default" ? REPAIR_STRATEGIES[errorClass] : REPAIR_STRATEGIES.default;
}

// True when a Consent_Record of kind material_change is scoped to the item (or to `item#strategy`).
export function hasMaterialConsent(project, itemId, strategyId) {
  return (project?.consents ?? []).some((c) => c.kind === "material_change" && (c.scope === itemId || c.scope === `${itemId}#${strategyId}`));
}

// Picks the first strategy not already in strategiesTried. Strategies needing a Material_Change are chosen only after
// every other untried strategy, and are reported as `consentRequired` when no matching Consent_Record exists.
// Returns { strategy } | { exhausted: true } | { consentRequired: strategy }.
export function selectStrategy(project, itemId, errorClass) {
  const tried = new Set(project?.items?.[itemId]?.repairs?.[errorClass]?.strategiesTried ?? []);
  const untried = strategiesFor(errorClass).filter((s) => !tried.has(s.id));
  if (untried.length === 0) return { exhausted: true };
  const free = untried.find((s) => !s.materialChange);
  if (free) return { strategy: free };
  const material = untried.find((s) => hasMaterialConsent(project, itemId, s.id));
  return material ? { strategy: material } : { consentRequired: untried[0] };
}

// Re-validation scope: the repaired item's Checks plus those of every transitive dependent (7.2).
// A Check is identified by the checkId of the item's Evidence_Records. Returns the invalidated dependents and the
// exact (itemId, checkId) pairs to re-run.
export function revalidationScope(project, itemId) {
  const records = project?.items ?? {};
  const dependents = [...transitiveDependents(dependencyGraph(records), [itemId])].filter((id) => id !== itemId).sort();
  const checks = [];
  for (const id of [itemId, ...dependents]) {
    const ids = new Set((records[id]?.evidence ?? []).map((e) => e.checkId));
    for (const checkId of [...ids].sort()) checks.push({ itemId: id, checkId });
  }
  return { invalidated: dependents, revalidated: [itemId, ...dependents], checks };
}

// Moves the item to needs_input. The advice carries the failing Evidence_Records and the strategies tried (7.5).
function escalate(dir, project, itemId, errorClass, now, reason) {
  const item = project.items[itemId];
  const failing = latestEvidence(item.evidence).filter((e) => e.result === "failed");
  const strategiesTried = [...(item.repairs?.[errorClass]?.strategiesTried ?? [])];
  item.state = "needs_input";
  saveProject(dir, project);
  const journal_id = appendJournal(dir, {
    command: "repair",
    summary: `${itemId} ${errorClass} escalated to needs_input (${reason}) tried=${JSON.stringify(strategiesTried)} failing=${JSON.stringify(failing)}`,
    now,
  });
  return { escalated: true, state: "needs_input", failingEvidence: failing, strategiesTried, journal_id, errors: [] };
}

// Starts the next Auto_Repair attempt for (itemId, errorClass): escalates when the budget is spent or no strategy is
// left, refuses Material_Change strategies without consent, otherwise sets the item to `repairing`, records the attempt
// and journals the invalidated and to-be-re-validated items (7.4, 7.6, 7.8, 7.9, 7.10, 11.2, 11.6).
// `strategy` (optional) forces a strategy id; it must still be untried, and a Material_Change one still needs consent.
export function beginRepair(dir, itemId, errorClass, { now = new Date(), strategy } = {}) {
  const project = loadProject(dir);
  if (!project.items?.[itemId]) return { errors: [err("REPAIR-ITEM", "HARD", itemId, `unknown item ${itemId}`)] };
  if (budgetExhausted(project, itemId, errorClass)) return escalate(dir, project, itemId, errorClass, now, "budget exhausted");
  let picked;
  if (strategy !== undefined) {
    const def = strategiesFor(errorClass).find((s) => s.id === strategy);
    const tried = project.items[itemId].repairs?.[errorClass]?.strategiesTried ?? [];
    if (!def || tried.includes(strategy)) return { errors: [err("REPAIR-STRATEGY", "HARD", itemId, `strategy ${strategy} is unknown or already tried for ${errorClass}`)] };
    picked = def.materialChange && !hasMaterialConsent(project, itemId, def.id) ? { consentRequired: def } : { strategy: def };
  } else picked = selectStrategy(project, itemId, errorClass);
  if (picked.exhausted) return escalate(dir, project, itemId, errorClass, now, "no untried strategy");
  if (picked.consentRequired) {
    return { errors: [err("CONSENT-REQUIRED", "NEEDS_USER", itemId, `strategy ${picked.consentRequired.id} is a Material_Change; record a material_change consent for ${itemId} first`)] };
  }
  const chosen = picked.strategy;
  const scope = revalidationScope(project, itemId);
  project.items[itemId].state = "repairing";
  saveProject(dir, project);
  const attempt = recordRepairAttempt(dir, itemId, errorClass, chosen.id, { now });
  const scope_journal_id = appendJournal(dir, {
    command: "repair",
    summary: `${itemId} ${errorClass} strategy=${chosen.id} invalidated=${JSON.stringify(scope.invalidated)} revalidate=${JSON.stringify(scope.checks)}`,
    now,
  });
  return { escalated: false, strategy: chosen.id, attempts: attempt.attempts, scope, journal_id: attempt.journal_id, scope_journal_id, errors: [] };
}

// Ranks raster-replan candidates ({ fix, fit, cost }): best brief fit first, then lowest cost, then fix id.
// Returns { chosen, rejected } where `rejected` keeps rank order (7.7).
export function chooseRasterReplan(candidates) {
  const ranked = [...(candidates ?? [])].sort((a, b) => (b.fit ?? 0) - (a.fit ?? 0) || (a.cost ?? 0) - (b.cost ?? 0) || String(a.fix).localeCompare(String(b.fix)));
  return { chosen: ranked[0] ?? null, rejected: ranked.slice(1) };
}

// Chooses the raster replan fix and records the choice and the rejected alternatives in the Project_Ledger.
export function recordRasterReplan(dir, itemId, candidates, { now = new Date() } = {}) {
  const { chosen, rejected } = chooseRasterReplan(candidates);
  if (!chosen) return { errors: [err("REPLAN-NONE", "HARD", itemId, "no raster replan candidates")] };
  const journal_id = appendJournal(dir, {
    command: "repair",
    summary: `${itemId} raster-replan chosen=${JSON.stringify(chosen)} rejected=${JSON.stringify(rejected)}`,
    now,
  });
  return { chosen, rejected, journal_id, errors: [] };
}
