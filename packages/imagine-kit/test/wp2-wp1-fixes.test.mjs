import { test } from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { approveThrough, asset, cli, getProject, makeProject, put, seedCanon, seedMinimalStory, setManifest, setProject, shot, writeStory } from "./helpers/fixture.mjs";

const ready = async (opts) => {
  const p = await makeProject(opts);
  seedCanon(p.dir);
  return p;
};
const approveNothingElse = async (cwd, last) => approveThrough(cwd, last);

test("G4 approve is refused for a story with no shots and records nothing", async () => {
  const { cwd, dir } = await ready();
  await approveNothingElse(cwd, "G3");
  const before = readFileSync(join(dir, "project.yaml"), "utf8");
  const r = await cli(cwd, "gate", "G4", "approve", "--quote", "go");
  assert.equal(r.exit, 1);
  assert.ok(r.env.errors.some((e) => e.rule === "HARD-DURATION" && /no shots/.test(e.message)));
  assert.equal(readFileSync(join(dir, "project.yaml"), "utf8"), before);
  await seedMinimalStory(dir);
  assert.equal((await cli(cwd, "gate", "G4", "approve", "--quote", "go")).exit, 0);
});

test("G4 approve runs the story integrity check and unit-once", async () => {
  const { cwd, dir } = await ready();
  await approveNothingElse(cwd, "G3");
  await seedMinimalStory(dir);
  appendFileSync(join(dir, "STORY.md"), "\nhand edit\n");
  const r = await cli(cwd, "gate", "G4", "approve", "--quote", "go");
  assert.equal(r.exit, 1);
  assert.ok(r.env.errors.some((e) => e.rule === "HARD-STORY-WRITERS"));
});

test("G4 reject is always recordable", async () => {
  const { cwd } = await ready();
  await approveNothingElse(cwd, "G3");
  assert.equal((await cli(cwd, "gate", "G4", "reject", "--quote", "no")).exit, 0);
});

test("validate story --stage with zero shots is HARD; without --stage a skeleton still passes", async () => {
  const { cwd } = await ready();
  const staged = await cli(cwd, "validate", "story", "--stage", "storyboard");
  assert.equal(staged.exit, 1);
  assert.ok(staged.env.errors.some((e) => e.rule === "HARD-DURATION"));
  assert.equal((await cli(cwd, "validate", "story")).exit, 0);
});

test("validate story rejects partial previz durations and CSS filters in an fx fallback", async () => {
  const { cwd, dir } = await ready();
  await writeStory(dir, 1, [
    shot("s01", { scene: "a", duration_est: "5s", duration: "5s", voiceover: "[L01]" }),
    shot("s02", { scene: "b", duration_est: "5s", voiceover: "[L02]" }),
    shot("s03", { scene: "c", duration_est: "3s", voiceover: "[L03]", fx: "[blur: webgl-shader grain, fallback=filter: blur(4px)]" })]);
  const r = await cli(cwd, "validate", "story");
  assert.ok(r.env.errors.some((e) => e.rule === "HARD-DURATION" && /set all or none/.test(e.message)), JSON.stringify(r.env.errors));
  // Planning stages do not trip the rule: a previz patch fills durations one shot at a time.
  const previz = await cli(cwd, "validate", "story", "--stage", "previz");
  assert.equal(previz.env.errors.some((e) => /set all or none/.test(e.message)), false);
});

test("a dotted bible id is refused at G2 approve and by validate story until it is renamed", async () => {
  const { cwd, dir } = await ready();
  put(dir, "bible.yaml", readFileSync(join(dir, "bible.yaml"), "utf8").replace("id: mara", "id: mara.id"));
  await approveThrough(cwd, "G1");
  const r = await cli(cwd, "gate", "G2", "approve", "--quote", "ok");
  assert.equal(r.exit, 1);
  assert.ok(r.env.errors.some((e) => e.rule === "HARD-ENTITIES-EXIST" && /no dots/.test(e.message)));
  const v = await cli(cwd, "validate", "story");
  assert.ok(v.env.errors.some((e) => e.rule === "HARD-ENTITIES-EXIST" && /no dots/.test(e.message)));
  // The fix is to rename the id; once renamed, G2 approves.
  put(dir, "bible.yaml", readFileSync(join(dir, "bible.yaml"), "utf8").replace("id: mara.id", "id: mara-id"));
  assert.equal((await cli(cwd, "gate", "G2", "approve", "--quote", "ok")).exit, 0);
});

test("a duplicated bible id fails --scope instead of picking one silently", async () => {
  const { cwd, dir } = await ready();
  put(dir, "bible.yaml", readFileSync(join(dir, "bible.yaml"), "utf8").replace("locations:", "  - id: mara\n    hair: red\nlocations:"));
  await approveThrough(cwd, "G1");
  const r = await cli(cwd, "gate", "G2", "approve", "--scope", "mara", "--quote", "ok");
  assert.equal(r.exit, 2);
});

test("an asset whose declared ref has no version cannot be approved (fail closed)", async () => {
  const { cwd, dir } = await ready();
  await approveThrough(cwd, "G4");
  setManifest(dir, (m) => { m.assets.push(asset("hero", "img", 1, { refs: ["ghost"] })); });
  const r = await cli(cwd, "gate", "G5b", "approve", "--quote", "ok");
  assert.equal(r.exit, 1);
  assert.ok(r.env.errors.some((e) => /asset:ghost/.test(e.message)));
});

test("a rejected item-only upstream makes its dependants stale; pending upstream stales nothing", async () => {
  const { cwd, dir } = await ready();
  await approveThrough(cwd, "G4");
  const g6 = await cli(cwd, "gate", "G6", "approve", "--quote", "ok");
  assert.equal(g6.exit, 0, JSON.stringify(g6.env.errors));
  assert.equal(getProject(dir).items.g6.inputs.g4, "item");
  assert.equal((await cli(cwd, "gate", "G4", "reject", "--quote", "redo the plan")).exit, 0);
  const s = await cli(cwd, "status");
  const g6Item = s.env.data.items.find((i) => i.id === "g6");
  assert.equal(g6Item.status, "stale");
  assert.ok(g6Item.reasons.some((r) => r.kind === "upstream" && r.source === "g4"));
  // A deleted upstream does the same; a pending one does not.
  setProject(dir, (p) => { p.items.g4.status = "pending"; });
  const pending = await cli(cwd, "status");
  assert.notEqual(pending.env.data.items.find((i) => i.id === "g6").status, "stale");
  setProject(dir, (p) => { delete p.items.g4; });
  const gone = await cli(cwd, "status");
  assert.equal(gone.env.data.items.find((i) => i.id === "g6").status, "stale");
});

test("a narrated story with no script units is HARD-STORY-UNIT-ONCE, not a silent pass", async () => {
  const p = await makeProject();
  await writeStory(p.dir, 0, [shot("s01", { scene: "main", duration_est: "10s" }, "Main")]);
  const r = await cli(p.cwd, "validate", "story", "--stage", "storyboard");
  assert.equal(r.exit, 1);
  assert.ok(r.env.errors.some((e) => e.rule === "HARD-STORY-UNIT-ONCE" && /no script units/.test(e.message)), JSON.stringify(r.env.errors));
  assert.ok(!r.env.not_run.includes("HARD-STORY-UNIT-ONCE"));
});
