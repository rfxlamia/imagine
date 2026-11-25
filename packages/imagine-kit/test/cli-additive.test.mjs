import { test } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import { approveThrough, cli, getProject, makeProject, seedCanon } from "./helpers/fixture.mjs";
import { editProject, addAudio, renderProject } from "./helpers/edit.mjs";
import { hasFfmpeg } from "./helpers/media.mjs";

// Feature: autonomous-quality-gates, Property 29: Output schema is additive
// **Validates: Requirements 13.7**
// Keys each command's `data` carried before this feature. They must all still be present; only the keys below may be new.
const BASELINE = {
  status: ["stage", "gates", "items", "blocked", "sources", "unresolved", "decisions", "review_hints", "purges"],
  "export-hf": ["shots", "assets"],
  qc: ["w", "h", "fps", "duration_s", "audio", "lufs", "true_peak", "raster", "credits"],
  render: ["path", "sha256"],
};
const NEW_KEYS = ["checkpoints", "item_states", "delivery"];
const assertAdditive = (command, data) => {
  const keys = Object.keys(data);
  for (const k of BASELINE[command]) assert.ok(keys.includes(k), `${command} lost key ${k}`);
  const added = keys.filter((k) => !BASELINE[command].includes(k));
  for (const k of added) assert.ok(NEW_KEYS.includes(k), `${command} added unexpected key ${k}`);
};

test("P29: status keeps every pre-existing key and only adds checkpoints, at any gate progress", async () => {
  await fc.assert(fc.asyncProperty(fc.constantFrom("G0", "G1", "G2", "G3"), async (last) => {
    const { cwd, dir } = await makeProject();
    seedCanon(dir);
    await approveThrough(cwd, last);
    const r = await cli(cwd, "status");
    assert.equal(r.exit, 0, JSON.stringify(r.env.errors));
    assertAdditive("status", r.env.data);
    assert.ok(r.env.data.checkpoints);
  }), { numRuns: 8 });
});

test("P29: export-hf keeps {shots, assets} and appends checkpoints/item_states, on success and on refusal", async () => {
  const p = await editProject();
  await addAudio(p);
  const ok = await p.run({}, "export-hf");
  assert.equal(ok.exit, 0, JSON.stringify(ok.env.errors));
  assertAdditive("export-hf", ok.env.data);
  assert.ok(ok.env.data.checkpoints && ok.env.data.item_states);
  const fresh = await makeProject();
  const refused = await cli(fresh.cwd, "export-hf");
  assert.notEqual(refused.exit, 0);
  assertAdditive("export-hf", refused.env.data);
});

test("P29: qc and render keep their pre-existing keys", { skip: !hasFfmpeg }, async () => {
  const p = await renderProject();
  const q = await cli(p.cwd, "qc", p.mp4);
  assert.equal(q.exit, 0, JSON.stringify(q.env.errors));
  assertAdditive("qc", q.env.data);
  const r = await p.render({}, "render", "--draft");
  assert.equal(r.exit, 0, JSON.stringify(r.env.errors));
  assertAdditive("render", r.env.data);
});

// Requirements 6.9: consent record refuses blank and template-shaped quotes and records nothing.
const consent = (cwd, quote) => cli(cwd, "consent", "record", "--kind", "material_change", "--scope", "s01", "--quote", quote);
for (const [name, quote] of [["blank", "   "], ["empty", ""], ["boilerplate", "approved by the agent"], ["boilerplate shouted", "USER APPROVED."]]) {
  test(`consent record refuses a ${name} quote with GATE-QUOTE and stores nothing`, async () => {
    const { cwd, dir } = await makeProject();
    const r = await consent(cwd, quote);
    assert.notEqual(r.exit, 0);
    assert.equal(r.env.ok, false);
    assert.ok(r.env.errors.some((e) => e.rule === "GATE-QUOTE"), JSON.stringify(r.env));
    assert.deepEqual(getProject(dir).consents ?? [], []);
  });
}

test("consent record refuses --kind legacy_approval and stores nothing", async () => {
  const { cwd, dir } = await makeProject();
  const r = await cli(cwd, "consent", "record", "--kind", "legacy_approval", "--scope", "s01", "--quote", "yes, go ahead with that");
  assert.notEqual(r.exit, 0);
  assert.equal(r.env.errors[0]?.rule, "CONSENT-KIND");
  assert.match(r.env.errors[0].message, /reserved/);
  assert.deepEqual(getProject(dir).consents ?? [], []);
});
test("consent record stores a genuine quote verbatim and returns it", async () => {
  const { cwd, dir } = await makeProject();
  const quote = "yes, go ahead and publish it to youtube";
  const r = await consent(cwd, quote);
  assert.equal(r.exit, 0, JSON.stringify(r.env));
  assert.equal(r.env.data.consent.quote, quote);
  assert.equal(r.env.data.consent.scope, "s01");
  assert.equal(getProject(dir).consents.length, 1);
});

test("checkpoint output shape: {checkpoint, item, state, scope, checks[]} and a usage error on bad input", async () => {
  const { cwd } = await makeProject();
  const r = await cli(cwd, "checkpoint", "Q1", "run");
  const d = r.env.data;
  assert.equal(d.checkpoint, "Q1");
  assert.equal(typeof d.item, "string");
  assert.ok(["passed", "failed", "open"].includes(d.state), d.state);
  assert.deepEqual(d.scope, []);
  assert.ok(Array.isArray(d.checks));
  for (const c of d.checks) assert.deepEqual(Object.keys(c).sort(), ["checkId", "errors", "not_run", "proposal", "result"]);
  assert.ok(Array.isArray(r.env.errors) && Array.isArray(r.env.not_run));
  const bad = await cli(cwd, "checkpoint", "Q9", "run");
  assert.notEqual(bad.exit, 0);
  assert.equal(bad.env.ok, false);
});

test("migrate output shape: dry run reports without writing, --apply journals", async () => {
  const { cwd, dir } = await makeProject();
  const dry = await cli(cwd, "migrate");
  assert.equal(dry.exit, 0, JSON.stringify(dry.env));
  assert.equal(dry.env.data.mode, "dry-run");
  for (const k of ["migrated", "stale", "unmapped"]) assert.ok(Array.isArray(dry.env.data.report[k]), k);
  assert.ok(Array.isArray(dry.env.advice));
  assert.equal(dry.env.journal_id ?? null, null);
  const applied = await cli(cwd, "migrate", "--apply");
  assert.equal(applied.exit, 0, JSON.stringify(applied.env));
  assert.equal(applied.env.data.mode, "apply");
  assert.ok(applied.env.journal_id);
  assert.ok(getProject(dir));
});
