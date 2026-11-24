import test from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import { buildQualityReport, isReviewRecord } from "../src/quality-report.mjs";
import { CHECKPOINT_IDS } from "../src/checkpoints.mjs";

const CAPS = ["text", "file-hash", "image-inspection", "audio-analysis", "video-probe"];
const capSet = fc.uniqueArray(fc.constantFrom(...CAPS), { maxLength: CAPS.length });
const NUM_RUNS = 100;

// Each record gets a unique checkId, so every evidence ref is unique.
const recordsArb = fc.array(
  fc.record({
    caps: capSet,
    result: fc.constantFrom("passed", "failed", "not_run"),
    minute: fc.integer({ min: 0, max: 59 }),
  }),
  { maxLength: 8 },
).map((rs) => rs.map((r, i) => ({
  checkId: `check-${i}`, result: r.result, evaluator: "ev", evaluatorCapabilities: r.caps, ruleVersion: "R@1",
  at: `2025-01-01T00:${String(r.minute).padStart(2, "0")}:00.000Z`, outputRefs: [],
})));

const inputArb = fc.array(
  fc.tuple(fc.constantFrom(...CHECKPOINT_IDS), recordsArb),
  { maxLength: 4 },
).map((items) => items.map(([checkpoint, records], i) => ({
  checkpoint, itemId: `item-${i}`,
  records: records.map((r) => ({ ...r, checkId: `${r.checkId}-${i}` })),
})));

test("Property 22: quality report sections by evaluator capability", () => {
  // **Validates: Requirements 2.6, 5.6, 10.7**
  fc.assert(fc.property(inputArb, (input) => {
    const report = buildQualityReport(input);
    const all = input.flatMap((i) => i.records);

    // every record is listed exactly once
    assert.equal(report.total, all.length);
    assert.equal(report.technical.length + report.review.length, all.length);
    const refs = [...report.technical, ...report.review].map((e) => e.ref);
    assert.equal(new Set(refs).size, refs.length);

    // sections are split by capability, and are disjoint
    for (const e of report.review) {
      assert.ok(e.evaluatorCapabilities.some((c) => c === "image-inspection" || c === "audio-analysis"));
    }
    for (const e of report.technical) {
      assert.ok(!e.evaluatorCapabilities.some((c) => c === "image-inspection" || c === "audio-analysis"));
      assert.equal(e.unevaluated, false);
    }
    assert.equal(report.review.length, all.filter(isReviewRecord).length);

    // review-section not_run records are marked unevaluated, never passed, never omitted
    for (const e of report.review) {
      assert.equal(e.unevaluated, e.result === "not_run");
      if (e.unevaluated) {
        assert.notEqual(e.result, "passed");
        assert.ok(report.unevaluated.some((u) => u.ref === e.ref));
      }
    }
    assert.equal(report.unevaluated.length, report.review.filter((e) => e.result === "not_run").length);
  }), { numRuns: NUM_RUNS });
});
