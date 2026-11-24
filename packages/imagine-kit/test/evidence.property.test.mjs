import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import fc from "fast-check";
import YAML from "yaml";
import { writeEvidence, REQUIRED_EVIDENCE_FIELDS } from "../src/evidence.mjs";
import { makeProject, getProject } from "./helpers/fixture.mjs";

const word = fc.stringMatching(/^[a-z][a-z0-9-]{0,10}$/);
const validInput = fc.record({
  itemId: fc.tuple(fc.constantFrom("shot", "scene", "asset"), word).map(([k, w]) => `${k}:${w}`),
  checkId: word,
  evaluator: word,
  evaluatorCapabilities: fc.array(word, { minLength: 1, maxLength: 3 }),
  ruleVersion: word,
  inputHashes: fc.dictionary(word, fc.stringMatching(/^[0-9a-f]{64}$/), { maxKeys: 3 }),
  outputRefs: fc.array(word, { maxLength: 3 }),
  result: fc.constantFrom("passed", "failed", "not_run"),
  now: fc.date({ min: new Date("2020-01-01"), max: new Date("2040-01-01"), noInvalidDate: true }),
});

const journalIds = (dir) => readFileSync(join(dir, "journal.md"), "utf8").split("\n")
  .filter((l) => /^- j-\d{6} /.test(l));
const evidenceOf = (dir, id) => getProject(dir).items?.[id]?.evidence ?? [];

const { dir } = await makeProject();
const NUM_RUNS = 50;

test("Property 3: Evidence_Record rejects any missing required field", () => {
  // **Validates: Requirements 6.4**
  const fields = REQUIRED_EVIDENCE_FIELDS.filter((f) => f !== "itemId" && f !== "checkId" && f !== "now");
  fc.assert(fc.property(validInput, fc.constantFrom(...fields), fc.boolean(), (input, field, useUndefined) => {
    const bad = { ...input };
    if (useUndefined) bad[field] = undefined; else delete bad[field];
    const beforeLog = journalIds(dir).length;
    const beforeEv = evidenceOf(dir, input.itemId).length;
    const r = writeEvidence(dir, bad);
    assert.equal(r.record, null);
    assert.equal(r.errors[0].rule, "EVIDENCE-INCOMPLETE");
    assert.equal(evidenceOf(dir, input.itemId).length, beforeEv);
    assert.equal(journalIds(dir).length, beforeLog);
  }), { numRuns: NUM_RUNS });
});

test("Property 4: one Evidence_Record and one journal entry per completed Check", () => {
  // **Validates: Requirements 6.5**
  fc.assert(fc.property(validInput, (input) => {
    const beforeLog = journalIds(dir);
    const beforeEv = evidenceOf(dir, input.itemId).filter((e) => e.checkId === input.checkId).length;
    const r = writeEvidence(dir, input);
    assert.ok(r.record);
    const afterEv = evidenceOf(dir, input.itemId).filter((e) => e.checkId === input.checkId);
    assert.equal(afterEv.length, beforeEv + 1);
    const afterLog = journalIds(dir);
    assert.equal(afterLog.length, beforeLog.length + 1);
    assert.ok(afterLog.at(-1).startsWith(`- ${r.journal_id} `));
    assert.ok(afterLog.at(-1).includes(input.itemId) && afterLog.at(-1).includes(input.checkId));
  }), { numRuns: NUM_RUNS });
});

test("Property 9: Evidence_Record round-trip", () => {
  // **Validates: Requirements 6.11**
  fc.assert(fc.property(validInput, (input) => {
    const { record } = writeEvidence(dir, input);
    assert.ok(record);
    for (const [ser, parse] of [[JSON.stringify, JSON.parse], [YAML.stringify, YAML.parse]]) {
      const first = ser(record);
      assert.equal(ser(parse(first)), first);
    }
    const stored = evidenceOf(dir, input.itemId).at(-1);
    assert.deepEqual(stored, JSON.parse(JSON.stringify(record)));
  }), { numRuns: NUM_RUNS });
});
