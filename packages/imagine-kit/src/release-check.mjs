import { CHECKPOINT_IDS, GATE_CLASSIFICATION, LEGACY_GATES, DELIVERY } from "./gate-classification.mjs";
// Release check for Legacy_Gate removal (Requirements 14.7, 14.9).
// A gate may be removed only when every regression test related to it has a recorded `pass`.
// Regression tests are named by stable ids so the check does not depend on file layout:
//   check:<checkId>:defective-input   one defective-input test per retained Check
//   checkpoint:<Qn>:defective-fixture  one defective fixture per Checkpoint
//   delivery:production-complete      end-to-end run reaches Production_Complete
//   delivery:no-auto-publish          reaching Production_Complete never publishes
export const checkTestId = (checkId) => `check:${checkId}:defective-input`;
export const checkpointTestId = (checkpointId) => `checkpoint:${checkpointId}:defective-fixture`;
export const DELIVERY_TEST_IDS = Object.freeze(["delivery:production-complete", "delivery:no-auto-publish"]);
// Every regression test id that must pass before `gateId` is removed, derived from gate-classification.
// Throws RangeError for an unknown gate id.
export function regressionTestsFor(gateId) {
  const g = GATE_CLASSIFICATION[gateId];
  if (!g) throw new RangeError(`unknown Legacy_Gate ${gateId}`);
  if (g.target === DELIVERY) return [...DELIVERY_TEST_IDS];
  if (!CHECKPOINT_IDS.includes(g.target)) throw new RangeError(`gate ${gateId} has no known target`);
  return [...g.retainedChecks.map(checkTestId), checkpointTestId(g.target)];
}
export const allRegressionTests = () => [...new Set(LEGACY_GATES.flatMap(regressionTestsFor))];
// results: { [testId]: "pass" | "fail" } (or a Map). A missing id counts as not run and blocks removal.
// Returns { gate, allowed, required, failing, notRun }.
export function releaseCheck(gateId, results = {}) {
  const get = (id) => (results instanceof Map ? results.get(id) : Object.hasOwn(results, id) ? results[id] : undefined);
  const required = regressionTestsFor(gateId);
  const failing = required.filter((id) => get(id) === "fail");
  const notRun = required.filter((id) => get(id) !== "pass" && get(id) !== "fail");
  return { gate: gateId, allowed: failing.length === 0 && notRun.length === 0, required, failing, notRun };
}
// All gates at once: { allowed, gates: { [gate]: releaseCheck result } }.
export function releaseCheckAll(results = {}) {
  const gates = Object.fromEntries(LEGACY_GATES.map((g) => [g, releaseCheck(g, results)]));
  return { allowed: Object.values(gates).every((r) => r.allowed), gates };
}
