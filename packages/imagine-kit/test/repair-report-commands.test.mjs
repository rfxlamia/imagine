import test from "node:test";
import assert from "node:assert/strict";
import { cli, getProject, makeProject, setProject } from "./helpers/fixture.mjs";

test("repair counts attempts, rotates strategies and escalates when the budget is spent", async () => {
  const { cwd, dir } = await makeProject();
  setProject(dir, (p) => { p.items["asset:bg.v1"] = { kind: "asset", status: "pending" }; });
  const a = (await cli(cwd, "repair", "asset:bg.v1", "--class", "asset-regeneration")).env;
  assert.equal(a.data.strategy, "regenerate-new-seed");
  assert.equal(a.data.attempts, 1);
  const b = (await cli(cwd, "repair", "asset:bg.v1", "--class", "asset-regeneration")).env;
  assert.equal(b.data.strategy, "regenerate-reworded-prompt");
  const c = await cli(cwd, "repair", "asset:bg.v1", "--class", "asset-regeneration");
  assert.equal(c.env.data.escalated, true);
  assert.equal(c.env.code, "NEEDS_USER");
  assert.equal(getProject(dir).items["asset:bg.v1"].state, "needs_input");
});

test("repair refuses an unknown item and a missing class", async () => {
  const { cwd } = await makeProject();
  assert.equal((await cli(cwd, "repair", "nope", "--class", "x")).env.ok, false);
  assert.equal((await cli(cwd, "repair", "nope")).env.code, "USAGE");
});

test("report and status expose the quality report and delivery state", async () => {
  const { cwd } = await makeProject();
  const r = (await cli(cwd, "report")).env;
  assert.equal(r.ok, true);
  assert.equal(r.data.report.checkpoints.length, 3);
  assert.match(r.data.markdown, /# Quality report/);
  const s = (await cli(cwd, "status")).env;
  assert.equal(s.data.delivery.state, "pending");
});
