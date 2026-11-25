import test from "node:test";
import assert from "node:assert/strict";
import { BIBLE, cli, getProject, makeProject, put, seedCanon, shot, writeStory } from "./helpers/fixture.mjs";

// CLI only: no `gate` call and no fixture evidence.
test("a passed Q1 clears G0-G4 for tts and img without any gate call", async () => {
  const { cwd, dir } = await makeProject({ mode: "text-led", extra: ["--silence", "intentional"] });
  seedCanon(dir, { copy: true });
  await writeStory(dir, 0, [shot("s01", { scene: "main", duration_est: "14s", duration: "14s", voiceover: "[T01, T02, T03]" }, "Main")]);
  const q1 = await cli(cwd, "checkpoint", "Q1", "run");
  assert.equal(q1.env.data.state, "passed", JSON.stringify(q1.env));
  assert.ok(q1.env.data.recorded.includes("g4"));
  const st = (await cli(cwd, "status")).env;
  assert.equal(st.errors.length, 0, JSON.stringify(st.errors));
  for (const g of ["G0", "G1", "G2", "G3", "G4"]) assert.equal(st.data.gates[g].state, "approved", g);
  const item = getProject(dir).items.g4;
  assert.equal(item.decision.source, "checkpoint:Q1");
  assert.equal(item.decision.quote, undefined);
  const again = await cli(cwd, "checkpoint", "Q1", "run");
  assert.deepEqual(again.env.data.recorded, []);
});

test("checkpoint review needs a known reviewed check and valid JSON", async () => {
  const { cwd } = await makeProject();
  assert.equal((await cli(cwd, "checkpoint", "Q2", "review", "--check", "image-integrity", "--response", "{}")).env.code, "USAGE");
  assert.equal((await cli(cwd, "checkpoint", "Q2", "review", "--check", "visual-continuity", "--response", "nope")).env.code, "USAGE");
});

test("a review with no verified coverage is recorded as not_run, never passed", async () => {
  const { cwd, dir } = await makeProject();
  seedCanon(dir);
  const r = await cli(cwd, "checkpoint", "Q2", "review", "--check", "visual-continuity", "--response", JSON.stringify({ outcome: "no_findings_observed" }));
  const c = r.env.data.checks.find((x) => x.checkId === "visual-continuity");
  assert.equal(c.result, "not_run");
  assert.equal(r.env.data.checks.length, 1);
});

test("loudness-mix is a Q3 check", async () => {
  const { CHECKPOINTS } = await import("../src/checkpoints.mjs");
  assert.ok(CHECKPOINTS.Q3.checks.some((c) => c.id === "loudness-mix"));
  assert.ok(!CHECKPOINTS.Q2.checks.some((c) => c.id === "loudness-mix"));
});
