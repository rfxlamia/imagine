import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import fc from "fast-check";
import { migrateProject, MIGRATION_EVALUATOR } from "../src/migrate.mjs";
import { LEGACY_GATES, LEGACY_TO_CHECKPOINT } from "../src/gate-classification.mjs";
import { isBlankQuote } from "../src/gates.mjs";
import { asset, approveThrough, cli, getProject, makeProject, seedCanon, setManifest } from "./helpers/fixture.mjs";

// Feature: autonomous-quality-gates, Properties 25-28 (migration), Requirement 13.3 (gate shim)
const AT = "2026-11-01T10:00:00.000Z";
const ITEM_OF = { G0: "g0", G1: "unit:L01", G2: "bible:characters.mara", G3: "style:camera", G4: "g4",
  G5r: "asset:mara-sheet.v1", G5a: "asset:vo-L01.v1", G5b: "asset:img1.v1", G6: "g6", G7: "g7" };
const legacy = (gate, quote, status = "approved", extra = {}) => ({
  kind: "x", status, gate, decision: { decision: status === "approved" ? "approve" : "reject", quote, at: AT },
  inputs: { "g0:format": "portrait" }, ...extra });
const history = (quoteOf = (g) => `ok ${g}`) =>
  ({ items: Object.fromEntries(LEGACY_GATES.map((g) => [ITEM_OF[g], legacy(g, quoteOf(g))])) });
const quoteArb = fc.string({ minLength: 1, maxLength: 40 }).filter((s) => !isBlankQuote(s));
const projectArb = fc.record({
  quotes: fc.array(quoteArb, { minLength: 10, maxLength: 10 }),
  rejected: fc.subarray(LEGACY_GATES),
  unknown: fc.boolean(),
  stale: fc.subarray(LEGACY_GATES),
}).map(({ quotes, rejected, unknown, stale }) => {
  const items = {};
  LEGACY_GATES.forEach((g, i) => { items[ITEM_OF[g]] = legacy(g, quotes[i], rejected.includes(g) ? "rejected" : "approved"); });
  if (unknown) items["weird:1"] = legacy("G99", "keep me");
  return { project: { items }, staleIds: stale.map((g) => ITEM_OF[g]) };
});

test("P25: every approved quote becomes a legacy_approval Consent_Record scoped to the item, byte-for-byte", () => {
  fc.assert(fc.property(projectArb, ({ project, staleIds }) => {
    const { project: out, report } = migrateProject(project, { staleIds });
    for (const m of report.migrated) {
      const quote = project.items[m.id].decision.quote;
      assert.ok(out.consents.some((c) => c.kind === "legacy_approval" && c.scope === m.id && c.quote === quote));
      assert.ok(report.consents.some((c) => c.id === m.id && c.kind === "legacy_approval"));
    }
  }), { numRuns: 100 });
});

test("full G0-G7 history: all migrated, ceremonial quotes listed for every gate except G4", () => {
  const p = history();
  const { project, report } = migrateProject(p);
  assert.equal(report.migrated.length, 10);
  assert.deepEqual(report.unmapped, []);
  assert.deepEqual(report.stale, []);
  assert.equal(project.consents.length, 10);
  assert.deepEqual(report.ceremonial_quotes_preserved.map((c) => c.gate).sort(), LEGACY_GATES.filter((g) => g !== "G4").sort());
  assert.equal(project.items.g7.state, "ready");
  assert.equal(project.items.g0.state, "passed");
  assert.equal(project.items.g0.evidence[0].evaluator, MIGRATION_EVALUATOR);
  assert.equal(project.items.g0.evidence[0].result, "passed");
  assert.equal(report.migrated.find((m) => m.gate === "G6").target, LEGACY_TO_CHECKPOINT.G6);
  assert.deepEqual(p, history(), "input is not mutated");
});

test("rejected gate: no evidence, no consent, item untouched", () => {
  const p = { items: { g1x: legacy("G1", "no, redo it", "rejected") } };
  const { project, report } = migrateProject(p);
  assert.deepEqual(project, p);
  assert.deepEqual(report.migrated, []);
  assert.equal(project.consents, undefined);
});

test("P26: stale items are not vouched for; migration runs no Check and keeps recorded hashes", () => {
  const p = history();
  const { project, report } = migrateProject(p, { staleIds: ["g4"] });
  assert.deepEqual(report.stale.map((s) => s.id), ["g4"]);
  assert.deepEqual(project.items.g4, p.items.g4);
  assert.deepEqual(project.items.g0.evidence[0].inputHashes, { "g0:format": "portrait" });
  const src = readFileSync(new URL("../src/migrate.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /checkpoints\.mjs|checks\.mjs|\.run\(/);
  fc.assert(fc.property(projectArb, ({ project: pr }) => {
    const { project: out } = migrateProject(pr);
    for (const [id, it] of Object.entries(out.items)) for (const e of it.evidence ?? []) {
      assert.deepEqual(e.inputHashes, Object.fromEntries(Object.entries(pr.items[id].inputs).map(([k, v]) => [k, String(v)])));
    }
  }), { numRuns: 50 });
});

test("P27: unknown gate id is left byte-identical and reported", () => {
  const p = history();
  p.items["weird:1"] = legacy("G99", "keep me");
  const { project, report } = migrateProject(p);
  assert.deepEqual(project.items["weird:1"], p.items["weird:1"]);
  assert.deepEqual(report.unmapped.map((u) => u.id), ["weird:1"]);
  assert.equal(project.consents.some((c) => c.scope === "weird:1"), false);
  fc.assert(fc.property(projectArb, ({ project: pr, staleIds }) => {
    const { project: out, report: r } = migrateProject(pr, { staleIds });
    for (const u of r.unmapped) assert.deepEqual(out.items[u.id], pr.items[u.id]);
    for (const [id, it] of Object.entries(pr.items)) if (it.gate === "G99") assert.ok(r.unmapped.some((u) => u.id === id));
  }), { numRuns: 100 });
});

test("P28: migrateProject is idempotent", () => {
  fc.assert(fc.property(projectArb, ({ project, staleIds }) => {
    const once = migrateProject(project, { staleIds });
    const twice = migrateProject(once.project, { staleIds });
    assert.deepEqual(twice.project, once.project);
  }), { numRuns: 100 });
});

// Requirement 13.3: `gate` still works for every legacy id and prints the deprecation notice.
async function atG4() {
  const p = await makeProject({ mode: "text-led", extra: ["--silence", "intentional"] });
  seedCanon(p.dir, { copy: true });
  await approveThrough(p.cwd, "G4");
  setManifest(p.dir, (m) => { m.assets.push(asset("mara-sheet", "ref", 1), asset("img1", "img", 1, { refs: ["mara-sheet"] })); });
  return p;
}
test("gate shim: every legacy id still works and emits DEPRECATED-GATE (13.3)", async () => {
  const { cwd, dir } = await atG4();
  for (const g of LEGACY_GATES) {
    const r = await cli(cwd, "gate", g, "approve", "--quote", `go ahead with ${g} please`);
    assert.equal(r.exit, 0, `${g}: ${JSON.stringify(r.env)}`);
    const note = r.env.advice.find((a) => a.rule === "DEPRECATED-GATE");
    assert.ok(note, g);
    assert.ok(note.message.includes(`gate ${g}`), g);
  }
  const p = getProject(dir);
  assert.ok(p.consents.length >= LEGACY_GATES.length);
  // what the shim wrote migrates cleanly
  const { report } = migrateProject(p);
  assert.deepEqual(report.unmapped, []);
});
