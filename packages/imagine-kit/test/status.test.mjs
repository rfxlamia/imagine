import { test } from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sha256 } from "../src/hash.mjs";
import { asset, cli, makeProject, seedCanon, setManifest, setProject, snapshot } from "./helpers/fixture.mjs";

test("HARD-STATUS-DERIVED: a fresh project reads at G0, exposes sources and writes nothing", async () => {
  const { cwd, dir } = await makeProject();
  const before = readFileSync(join(dir, "project.yaml"), "utf8");
  const r = await cli(cwd, "status");
  assert.equal(r.exit, 0);
  assert.equal(r.env.data.stage, "G0");
  assert.equal(r.env.data.gates.G0.state, "open");
  assert.ok(r.env.data.sources["g0:format"]);
  assert.equal(readFileSync(join(dir, "project.yaml"), "utf8"), before);
});

test("HARD-STATUS-DERIVED: a stored 'stale' status is refused", async () => {
  const { cwd, dir } = await makeProject();
  setProject(dir, (p) => { p.items["unit:L01"] = { kind: "unit", status: "stale" }; });
  const r = await cli(cwd, "status");
  assert.equal(r.exit, 1);
  assert.equal(r.env.code, "HARD_NOT_RUN");
});

test("HARD-STORY-WRITERS: a hand-edited STORY.md is KEY_NOT_OWNED", async () => {
  const { cwd, dir } = await makeProject();
  appendFileSync(join(dir, "STORY.md"), "\n## Scene s01 — Sneaky\n");
  const r = await cli(cwd, "status");
  assert.equal(r.exit, 1);
  assert.equal(r.env.code, "KEY_NOT_OWNED");
  assert.equal(r.env.errors[0].rule, "HARD-STORY-WRITERS");
});

test("HARD-STYLE-OUTPUT-READONLY: style.md#output must equal the text generated from G0", async () => {
  const { cwd, dir } = await makeProject();
  const p = join(dir, "style.md");
  writeFileSync(p, readFileSync(p, "utf8").replace("portrait", "landscape"));
  const r = await cli(cwd, "status");
  assert.equal(r.exit, 1);
  assert.ok(r.env.errors.some((e) => e.rule === "HARD-STYLE-OUTPUT-READONLY"));
});

test("HARD-GATES-RECORDED: an approved item without a user quote is an error", async () => {
  const { cwd, dir } = await makeProject();
  setProject(dir, (p) => { p.items["unit:L01"] = { kind: "unit", status: "approved", inputs: {} }; });
  const r = await cli(cwd, "status");
  assert.equal(r.exit, 1);
  assert.equal(r.env.errors[0].rule, "HARD-GATES-RECORDED");
});

test("GATE-QUOTE: status lists every recorded quote (decisions) and the review hints", async () => {
  const { cwd, dir } = await makeProject();
  seedCanon(dir);
  assert.equal((await cli(cwd, "gate", "G0", "approve", "--quote", "setuju portrait")).exit, 0);
  await snapshot(dir, "shot:s01.fx", [], { status: "proposed", watch: ["bible:world"] });
  writeFileSync(join(dir, "bible.yaml"), readFileSync(join(dir, "bible.yaml"), "utf8").replace("1950s", "1960s"));
  const r = await cli(cwd, "status");
  assert.deepEqual(r.env.data.decisions.map((d) => [d.item, d.gate, d.quote]), [["g0", "G0", "setuju portrait"]]);
  assert.deepEqual(r.env.data.review_hints, [{ item: "shot:s01.fx", sources: ["bible:world"] }]);
});

test("status: --item filters items; --ref returns requested values (clock form) and lists unresolved", async () => {
  const { cwd, dir } = await makeProject();
  seedCanon(dir);
  setManifest(dir, (m) => { m.assets.push(asset("vo-L02", "vo", 1, { line: "L02" })); });
  setProject(dir, (p) => { p.items["unit:L01"] = { kind: "unit", status: "pending" }; p.items["unit:L02"] = { kind: "unit", status: "pending" }; });
  const one = await cli(cwd, "status", "--item", "unit:L01");
  assert.deepEqual(one.env.data.items.map((i) => i.id), ["unit:L01"]);
  const r = await cli(cwd, "status", "--ref", "bible:characters.mara.hair,clock:L02=vo.v1,unit:L99,edit:s01");
  assert.ok(r.env.data.sources["bible:characters.mara.hair"]);
  assert.equal(r.env.data.sources["clock:L02"], `vo.v1:${sha256("vo-L02.v1")}`);
  assert.deepEqual(r.env.data.unresolved.sort(), ["edit:s01", "unit:L99"]);
});
