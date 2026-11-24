import test from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import { writeEvidence, missingCapabilities } from "../src/evidence.mjs";
import { runCheckpoint, checkpointState, CHECKPOINTS } from "../src/checkpoints.mjs";
import { makeProject, getProject } from "./helpers/fixture.mjs";

const CAPS = ["text", "file-hash", "image-inspection", "audio-analysis", "video-probe"];
const word = fc.stringMatching(/^[a-z][a-z0-9-]{0,10}$/);
const capSet = fc.uniqueArray(fc.constantFrom(...CAPS), { maxLength: CAPS.length });
const NUM_RUNS = 50;

const { dir } = await makeProject();

// requires / evaluator capability pairs where the evaluator does NOT cover requires.
const mismatch = fc.tuple(capSet, capSet).filter(([req, have]) => req.some((c) => !have.includes(c)));

test("Property 5: capability mismatch never yields passed (writeEvidence)", () => {
  // **Validates: Requirements 6.7, 10.2, 10.3, 10.7**
  fc.assert(fc.property(
    mismatch, word, word, fc.constantFrom("passed", "failed", "not_run"),
    ([requires, have], checkId, evaluator, reported) => {
      // writeEvidence needs a non-empty evaluator capability list; the empty set is covered by the checkpoint test below.
      fc.pre(have.length > 0);
      const itemId = `shot:${checkId}`;
      const r = writeEvidence(dir, { itemId, checkId, evaluator, evaluatorCapabilities: have, requires, ruleVersion: "R@1",
        inputHashes: {}, outputRefs: [], result: reported, now: new Date("2025-01-01T00:00:00Z") });
      assert.ok(r.record);
      assert.equal(r.record.result, "not_run");
      assert.ok(r.errors.some((e) => e.rule === "EVALUATOR-CAPABILITY"));
      assert.equal(getProject(dir).items[itemId].evidence.at(-1).result, "not_run");
    },
  ), { numRuns: NUM_RUNS });
});

test("Property 5: a covering evaluator keeps the reported result", () => {
  // **Validates: Requirements 6.7, 10.2**
  fc.assert(fc.property(
    capSet, capSet, word, word, fc.constantFrom("passed", "failed", "not_run"),
    (requires, extra, checkId, evaluator, reported) => {
      const have = [...new Set([...requires, ...extra, "text"])];
      assert.deepEqual(missingCapabilities(requires, have), []);
      const r = writeEvidence(dir, { itemId: `shot:${checkId}`, checkId, evaluator, evaluatorCapabilities: have, requires, ruleVersion: "R@1",
        inputHashes: {}, outputRefs: [], result: reported, now: new Date("2025-01-01T00:00:00Z") });
      assert.equal(r.record.result, reported);
      assert.deepEqual(r.errors, []);
    },
  ), { numRuns: NUM_RUNS });
});

const judgedChecks = Object.values(CHECKPOINTS).flatMap((cp) => cp.checks.filter((c) => c.id === "visual-continuity" || c.id === "visual-review").map((c) => [cp.id, c]));

test("Property 5: judged Checks without a capable evaluator are never passed (runCheckpoint)", async () => {
  // **Validates: Requirements 10.2, 10.3, 10.7**
  assert.ok(judgedChecks.length > 0);
  const caps = fc.uniqueArray(fc.constantFrom(...CAPS.filter((c) => c !== "image-inspection")), { maxLength: 4 });
  // undefined = no evaluator available; otherwise an evaluator lacking image-inspection that claims "passed".
  await fc.assert(fc.asyncProperty(fc.option(caps, { nil: undefined }), fc.constantFrom(...judgedChecks), async (have, [cpId, check]) => {
    const evaluators = have === undefined ? {} : { [check.id]: async () => ({ errors: [], result: "passed", evaluator: "fake", evaluatorCapabilities: have }) };
    const out = await runCheckpoint(dir, cpId, { evaluators, now: new Date("2025-01-01T00:00:00Z") });
    const res = out.checks.find((c) => c.checkId === check.id);
    assert.notEqual(res.result, "passed");
    assert.equal(res.result, "not_run");
    assert.notEqual(out.state, "passed");
    const stored = getProject(dir).items[out.itemId].evidence.filter((e) => e.checkId === check.id);
    assert.ok(stored.every((e) => e.result !== "passed"));
    assert.notEqual(checkpointState(cpId, stored), "passed");
  }), { numRuns: 12 });
});
