import test from "node:test";
import assert from "node:assert/strict";
import { CHECKPOINTS } from "../src/checkpoints.mjs";
import { GATE_CLASSIFICATION, LEGACY_GATES } from "../src/gate-classification.mjs";
import { allRegressionTests, checkTestId, checkpointTestId, regressionTestsFor, releaseCheck, releaseCheckAll } from "../src/release-check.mjs";
// Requirements 14.7, 14.9: Legacy_Gate removal is blocked while any related regression test fails or has not run.
const allPass = () => Object.fromEntries(allRegressionTests().map((id) => [id, "pass"]));
test("every Legacy_Gate maps to regression tests derived from gate-classification", () => {
  const checkIds = new Set(Object.values(CHECKPOINTS).flatMap((c) => c.checks.map((x) => x.id)));
  for (const g of LEGACY_GATES) {
    const tests = regressionTestsFor(g);
    assert.ok(tests.length > 0, g);
    for (const c of GATE_CLASSIFICATION[g].retainedChecks) {
      assert.ok(checkIds.has(c), c);
      assert.ok(tests.includes(checkTestId(c)), `${g} -> ${c}`);
    }
  }
  assert.ok(regressionTestsFor("G5b").includes(checkpointTestId("Q2")));
  assert.deepEqual(regressionTestsFor("G7"), ["delivery:production-complete", "delivery:no-auto-publish"]);
});
test("removal is allowed for every gate when all related regression tests pass", () => {
  const r = releaseCheckAll(allPass());
  assert.equal(r.allowed, true);
  for (const g of LEGACY_GATES) assert.deepEqual([releaseCheck(g, allPass()).failing, releaseCheck(g, allPass()).notRun], [[], []]);
});
test("a failing related regression test blocks removal of that gate only", () => {
  const results = { ...allPass(), [checkTestId("image-integrity")]: "fail" };
  const g5b = releaseCheck("G5b", results);
  assert.equal(g5b.allowed, false);
  assert.deepEqual(g5b.failing, [checkTestId("image-integrity")]);
  assert.equal(releaseCheck("G1", results).allowed, true);
  assert.equal(releaseCheckAll(results).allowed, false);
});
test("a Checkpoint defective-fixture failure blocks every gate that targets the Checkpoint", () => {
  const results = { ...allPass(), [checkpointTestId("Q3")]: "fail" };
  assert.equal(releaseCheck("G6", results).allowed, false);
  assert.equal(releaseCheck("G5a", results).allowed, true);
});
test("a regression test that has not run blocks removal", () => {
  const results = allPass();
  delete results["delivery:no-auto-publish"];
  const r = releaseCheck("G7", results);
  assert.equal(r.allowed, false);
  assert.deepEqual(r.notRun, ["delivery:no-auto-publish"]);
  assert.equal(releaseCheck("G0", new Map()).allowed, false);
});
test("an unknown gate id is rejected", () => {
  assert.throws(() => releaseCheck("G9", allPass()), RangeError);
});
