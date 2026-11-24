import { test } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import { CHECKPOINTS, CHECKPOINT_IDS, checkpointState } from "../src/checkpoints.mjs";

const RESULTS = ["passed", "failed", "not_run"];
const cpArb = fc.constantFrom(...CHECKPOINT_IDS);
const resultArb = fc.constantFrom(...RESULTS);

const recordsFor = (cpId, results) =>
  CHECKPOINTS[cpId].checks.map((c, i) => ({ checkId: c.id, result: results[i], at: "2025-01-01T00:00:00.000Z" }));

// Feature: autonomous-quality-gates, Property 1: Checkpoint aggregation is an AND over its Checks
// **Validates: Requirements 3.6, 4.8, 5.5**
test("checkpointState is passed iff every Check's most recent record is passed", () => {
  fc.assert(
    fc.property(
      cpArb,
      fc.array(resultArb, { minLength: 8, maxLength: 8 }),
      fc.array(resultArb, { minLength: 8, maxLength: 8 }),
      (cpId, older, latest) => {
        const n = CHECKPOINTS[cpId].checks.length;
        // Older records (earlier `at`) must be superseded by the latest ones, regardless of array order.
        const old = CHECKPOINTS[cpId].checks.map((c, i) => ({ checkId: c.id, result: older[i], at: "2024-01-01T00:00:00.000Z" }));
        const cur = CHECKPOINTS[cpId].checks.map((c, i) => ({ checkId: c.id, result: latest[i], at: "2025-01-01T00:00:00.000Z" }));
        const state = checkpointState(cpId, [...cur, ...old]);
        const expectPassed = latest.slice(0, n).every((r) => r === "passed");
        assert.equal(state === "passed", expectPassed);
        if (!expectPassed) assert.equal(state, latest.slice(0, n).includes("failed") ? "failed" : "open");
      },
    ),
    { numRuns: 200 },
  );
});

test("a missing Check record prevents passed", () => {
  fc.assert(
    fc.property(cpArb, fc.nat(), (cpId, k) => {
      const checks = CHECKPOINTS[cpId].checks;
      const recs = recordsFor(cpId, checks.map(() => "passed"));
      assert.equal(checkpointState(cpId, recs), "passed");
      recs.splice(k % checks.length, 1);
      assert.notEqual(checkpointState(cpId, recs), "passed");
    }),
  );
});

test("empty evidence is open for every Checkpoint", () => {
  for (const id of CHECKPOINT_IDS) assert.equal(checkpointState(id, []), "open");
});
