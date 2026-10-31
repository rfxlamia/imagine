import { test } from "node:test";
import assert from "node:assert/strict";
import { approveThrough, asset, cli, getManifest, getProject, makeProject, seedCanon, setManifest, setProject } from "./helpers/fixture.mjs";

async function atG4(opts) {
  const p = await makeProject(opts);
  seedCanon(p.dir, { copy: opts?.mode && opts.mode !== "narrated" });
  await approveThrough(p.cwd, "G4");
  return p;
}
const entry = (dir, id, v) => getManifest(dir).assets.find((a) => a.id === id && a.v === v);

test("G5r approve marks the ref approved in the manifest and records the item", async () => {
  const { cwd, dir } = await atG4();
  setManifest(dir, (m) => { m.assets.push(asset("mara-sheet", "ref", 1)); });
  const r = await cli(cwd, "gate", "G5r", "approve", "--quote", "sheet looks right");
  assert.equal(r.exit, 0);
  assert.equal(entry(dir, "mara-sheet", 1).status, "approved");
  const item = getProject(dir).items["asset:mara-sheet.v1"];
  assert.equal(item.status, "approved");
  assert.ok(item.inputs["asset:mara-sheet.v1"]);
});

test("DAG-REF-VERSION: G5b needs G5r; an image records its ref's current version and goes stale on a new ref version", async () => {
  const { cwd, dir } = await atG4();
  setManifest(dir, (m) => {
    m.assets.push(asset("mara-sheet", "ref", 1), asset("img1", "img", 1, { refs: ["mara-sheet"] }));
  });
  const early = await cli(cwd, "gate", "G5b", "approve", "--quote", "ok");
  assert.equal(early.exit, 1);
  assert.equal(entry(dir, "img1", 1).status, "pending");
  assert.equal((await cli(cwd, "gate", "G5r", "approve", "--quote", "ok")).exit, 0);
  assert.equal((await cli(cwd, "gate", "G5b", "approve", "--quote", "images ok")).exit, 0);
  assert.ok(getProject(dir).items["asset:img1.v1"].inputs["asset:mara-sheet.v1"]);
  setManifest(dir, (m) => { m.assets.push(asset("mara-sheet", "ref", 2)); });
  const s = await cli(cwd, "status");
  assert.equal(s.env.data.items.find((i) => i.id === "asset:img1.v1").status, "stale");
});

test("G5a reject sets redo; approve sets listen_status ok", async () => {
  const { cwd, dir } = await atG4();
  setManifest(dir, (m) => { m.assets.push(asset("vo-L01", "vo", 1, { line: "L01" }), asset("vo-L02", "vo", 1, { line: "L02" })); });
  assert.equal((await cli(cwd, "gate", "G5a", "reject", "--scope", "vo-L01.v1", "--quote", "L01 is too flat")).exit, 0);
  assert.deepEqual([entry(dir, "vo-L01", 1).status, entry(dir, "vo-L01", 1).listen_status], ["rejected", "redo"]);
  assert.equal((await cli(cwd, "gate", "G5a", "approve", "--scope", "vo-L02.v1", "--quote", "L02 fine")).exit, 0);
  assert.deepEqual([entry(dir, "vo-L02", 1).status, entry(dir, "vo-L02", 1).listen_status], ["approved", "ok"]);
  const s = await cli(cwd, "status");
  assert.equal(s.env.data.gates.G5a.state, "open");
});

test("approving a non-current asset version is refused and writes nothing", async () => {
  const { cwd, dir } = await atG4();
  setManifest(dir, (m) => { m.assets.push(asset("vo-L01", "vo", 1, { line: "L01" })); });
  await cli(cwd, "gate", "G5a", "reject", "--quote", "redo");
  const before = JSON.stringify(getManifest(dir));
  const r = await cli(cwd, "gate", "G5a", "approve", "--quote", "changed my mind");
  assert.equal(r.exit, 1);
  assert.equal(r.env.errors[0].rule, "HARD-GATES-RECORDED");
  assert.equal(JSON.stringify(getManifest(dir)), before);
});

test("G6 and G7 record their upstream items and the edit items that exist", async () => {
  const { cwd, dir } = await atG4({ mode: "text-led", extra: ["--silence", "intentional"] });
  assert.equal((await cli(cwd, "gate", "G5a", "approve", "--quote", "silent")).exit, 0);
  setProject(dir, (p) => { p.items["edit:s01"] = { kind: "edit", status: "proposed" }; });
  const g6 = await cli(cwd, "gate", "G6", "approve", "--quote", "picture lock");
  assert.equal(g6.exit, 0);
  assert.deepEqual(Object.keys(getProject(dir).items.g6.inputs).sort(), ["edit:s01", "g4", "story:sha"]);
  const g7 = await cli(cwd, "gate", "G7", "approve", "--quote", "final accepted");
  assert.equal(g7.exit, 0);
  assert.ok(getProject(dir).items.g7.inputs.g6);
});
