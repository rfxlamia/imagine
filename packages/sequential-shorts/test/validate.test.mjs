import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { run } from "../src/cli.mjs";
import { validatePlanFile } from "../src/plan/validate.mjs";
import { readJson, writeJsonAtomic } from "../src/run/fsx.mjs";
import { tmp } from "./helpers/media.mjs";
import { DEFAULT_SETTINGS, writeFixturePlan } from "./helpers/plan.mjs";

const checks = (r) => r.errors.map((e) => e.check);

async function mutated(fn, opts) {
  const dir = tmp("val-");
  const f = writeFixturePlan(dir, opts);
  const plan = readJson(f.path);
  fn(plan, f);
  writeJsonAtomic(f.path, plan);
  return { r: await validatePlanFile({}, f.path), f };
}

test("a generated plan is valid and the CLI says so", async () => {
  const dir = tmp("val-");
  const f = writeFixturePlan(dir);
  const r = await validatePlanFile({}, f.path);
  assert.deepEqual(r.errors, []);
  assert.equal(f.plan.parts.length, 2);
  assert.equal(f.plan.schema, "sequential-shorts/plan@1");
  assert.match(f.plan.parts[0].vo_range.text, /akhir\./);
  const cli = await run(["validate", "--plan", f.path]);
  assert.equal(cli.exit, 0);
  assert.equal(cli.env.data.valid, true);
});

test("gap and overlap are HARD", async () => {
  const gap = await mutated((p) => { p.parts[1].start_frame += 3; });
  assert.ok(checks(gap.r).includes("gap"));
  const overlap = await mutated((p) => { p.parts[1].start_frame -= 3; });
  assert.ok(checks(overlap.r).includes("overlap"));
});

test("wrong index is HARD", async () => {
  const { r } = await mutated((p) => { p.parts[1].index = 5; });
  assert.ok(checks(r).includes("index"));
});

test("a changed source file is HARD and the CLI exits 1", async () => {
  const dir = tmp("val-");
  const f = writeFixturePlan(dir);
  writeFileSync(f.probe.path, "changed bytes");
  const r = await validatePlanFile({}, f.path);
  assert.ok(checks(r).includes("source-hash"));
  const cli = await run(["validate", "--plan", f.path]);
  assert.equal(cli.exit, 1);
  assert.equal(cli.env.code, "HARD");
});

test("a part over max without a forced boundary is HARD", async () => {
  const { r } = await mutated((p) => { p.settings.target_s = 30; p.settings.max_s = 40; });
  assert.ok(checks(r).includes("max"));
});

test("sample mismatch and schema violations are HARD", async () => {
  const s = await mutated((p) => { p.parts[0].end_sample += 1; p.parts[1].start_sample += 1; });
  assert.ok(checks(s.r).includes("timing"));
  const schema = await mutated((p) => { delete p.parts[0].boundary_out; });
  assert.deepEqual([...new Set(checks(schema.r))], ["schema"]);  // Values from an edited plan reach ffmpeg filtergraphs; the schema is the injection guard.
  const inj = await mutated((p) => { p.settings.background = "color:#000000,drawtext=text=x"; });
  assert.deepEqual([...new Set(checks(inj.r))], ["schema"]);
  const fps = await mutated((p) => { p.source.fps_rational = "30/1,scale=1:1"; });
  assert.deepEqual([...new Set(checks(fps.r))], ["schema"]);
});

test("moving a boundary to another candidate validates clean", async () => {
  const { r } = await mutated((p, f) => {
    const cut = p.parts[0].end_frame;
    const other = f.candidates.find((c) => c.kind.startsWith("sentence_end") && c.frame !== cut && c.t > 40 && c.t < 80);
    p.parts[0].end_frame = other.frame; p.parts[0].end_s = other.t; p.parts[0].end_sample = other.sample;
    p.parts[1].start_frame = other.frame; p.parts[1].start_s = other.t; p.parts[1].start_sample = other.sample;
    p.parts[0].duration_s = Math.round((p.parts[0].end_s - p.parts[0].start_s) * 1e6) / 1e6;
    p.parts[1].duration_s = Math.round((p.parts[1].end_s - p.parts[1].start_s) * 1e6) / 1e6;
    p.parts[0].boundary_out.candidate_id = other.id;
  });
  assert.deepEqual(r.errors, []);
});

test("max above 90 s warns about platform limits", async () => {
  const dir = tmp("val-");
  const f = writeFixturePlan(dir, { settings: { ...DEFAULT_SETTINGS, max_s: 120 } });
  const r = await validatePlanFile({}, f.path);
  assert.match(r.warnings[0].message, /platform limits/);
});

test("missing --plan is USAGE", async () => {
  const cli = await run(["validate"]);
  assert.equal(cli.exit, 2);
});
