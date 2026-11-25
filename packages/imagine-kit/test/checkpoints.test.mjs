import test from "node:test";
import assert from "node:assert/strict";
import { CHECKPOINTS, THRESHOLDS, checkpointState, proposeCutList, resolveCheckpoint, runCheckpoint } from "../src/checkpoints.mjs";
import { GATE_CLASSIFICATION } from "../src/gate-classification.mjs";
import { makeProject, seedCanon, seedMinimalStory, getProject } from "./helpers/fixture.mjs";
const NOW = new Date("2026-11-01T10:00:00Z");
const rec = (checkId, result, at = "2026-11-01T10:00:00.000Z") => ({ checkId, result, at });
test("every retained check in the gate classification exists in a Checkpoint", () => {
  const ids = new Set(Object.values(CHECKPOINTS).flatMap((c) => c.checks.map((x) => x.id)));
  for (const g of Object.values(GATE_CLASSIFICATION)) for (const c of g.retainedChecks) assert.ok(ids.has(c), c);
});
test("every Check declares required capabilities and a ruleVersion", () => {
  for (const cp of Object.values(CHECKPOINTS)) for (const c of cp.checks) {
    assert.ok(c.requires.length > 0, c.id);
    assert.match(c.ruleVersion, /^[A-Z-]+@\d+$/);
  }
});
test("checkpoint ids resolve from short and design names", () => {
  assert.equal(resolveCheckpoint("Q2_asset_quality").id, "Q2");
  assert.equal(resolveCheckpoint("Q3").id, "Q3");
  assert.equal(resolveCheckpoint("G1"), undefined);
});
test("checkpointState is an AND over the most recent record per Check", () => {
  const all = CHECKPOINTS.Q3.checks.map((c) => rec(c.id, "passed"));
  assert.equal(checkpointState("Q3", all), "passed");
  assert.equal(checkpointState("Q3", all.slice(1)), "open");
  assert.equal(checkpointState("Q3", [...all, rec("scene-lint", "failed", "2026-11-02T00:00:00.000Z")]), "failed");
  assert.equal(checkpointState("Q3", [rec("scene-lint", "failed", "2026-11-01T00:00:00.000Z"), ...all]), "passed");
  assert.equal(checkpointState("Q3", [...all.slice(1), rec("scene-lint", "not_run")]), "open");
});
test("thresholds match the design table", () => {
  assert.equal(THRESHOLDS.TARGET_LUFS, -16);
  assert.equal(THRESHOLDS.MAX_TRUE_PEAK, -1);
  assert.equal(THRESHOLDS.RASTER_FLOOR_Q, 0.75);
  assert.throws(() => { THRESHOLDS.TARGET_LUFS = 0; });
});
test("proposeCutList is read-only and covers the excess", () => {
  const plan = [{ id: "s01", duration: 5, voiceover: [{ unit: "L01" }] }, { id: "s02", duration: 5, voiceover: [{ unit: "L02" }] }, { id: "s03", duration: 5, voiceover: [] }];
  const p = proposeCutList(plan, 12);
  assert.equal(p.excess_s, 3);
  assert.deepEqual(p.candidates.map((c) => c.shot), ["s03"]);
  assert.equal(p.applied, false);
  assert.equal(proposeCutList(plan, 15), null);
});
test("runCheckpoint writes one Evidence_Record per Check and never passes unevaluated Checks", async () => {
  const { dir } = await makeProject();
  seedCanon(dir);
  await seedMinimalStory(dir);
  const r = await runCheckpoint(dir, "Q3", { now: NOW });
  const ev = getProject(dir).items["checkpoint:Q3"].evidence;
  assert.equal(ev.length, CHECKPOINTS.Q3.checks.length);
  assert.equal(r.state, "open");
  for (const id of ["visual-review", "mp4-technical", "scene-lint"]) assert.equal(ev.find((e) => e.checkId === id).result, "not_run");
});
test("Q1 fails on a defective story and records a failing Evidence_Record", async () => {
  const { dir } = await makeProject();
  seedCanon(dir);
  await seedMinimalStory(dir);
  const { writeFileSync, readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const story = readFileSync(join(dir, "STORY.md"), "utf8");
  writeFileSync(join(dir, "STORY.md"), story.replace(/L01/g, "L09"));
  const r = await runCheckpoint(dir, "Q1", { now: NOW });
  assert.equal(r.state, "failed");
  assert.equal(r.checks.find((c) => c.checkId === "script-unit-coverage").result, "failed");
});
test("an evaluator without the required capability cannot yield passed", async () => {
  const { dir } = await makeProject();
  seedCanon(dir);
  await seedMinimalStory(dir);
  const evaluators = { "visual-continuity": async () => ({ result: "passed", evaluator: "blind", capabilities: ["text"] }) };
  const r = await runCheckpoint(dir, "Q2", { now: NOW, evaluators });
  const c = r.checks.find((x) => x.checkId === "visual-continuity");
  assert.equal(c.result, "not_run");
  assert.equal(c.evidenceErrors[0].rule, "EVALUATOR-CAPABILITY");
});
test("Q2 asset-ref-exists fails when a shot declares an asset with no manifest entry", async () => {
  const { dir } = await makeProject();
  seedCanon(dir);
  const { createContext } = await import("../src/sources.mjs");
  const { writeStory, shot } = await import("./helpers/fixture.mjs");
  const units = Object.keys(createContext(dir).units.units);
  await writeStory(dir, 0, [shot("s01", { scene: "main", duration_est: "5s", voiceover: `[${units.join(", ")}]`, assets: "[ghost:img:1024x1024]" }, "Main")]);
  const r = await runCheckpoint(dir, "Q2", { now: NOW });
  const c = r.checks.find((x) => x.checkId === "asset-ref-exists");
  assert.equal(c.result, "failed");
  assert.match(c.errors[0].message, /ghost/);
});
