import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { asset, cli, getProject, makeProject, seedCanon, setManifest, setProject, shot, snapshot, writeStory } from "./helpers/fixture.mjs";

const S1 = () => shot("s01", { scene: "a", duration_est: "5s", voiceover: "[L01]" }, "One", "n");
async function base({ mode = "narrated", extra = [] } = {}) {
  const p = await makeProject({ mode, extra });
  seedCanon(p.dir, { copy: mode !== "narrated" });
  await writeStory(p.dir, 1, [S1()]);
  return p;
}
const edit = (dir, rel, from, to) => {
  const f = join(dir, rel);
  const t = readFileSync(f, "utf8");
  assert.ok(t.includes(from), `${rel} contains ${from}`);
  writeFileSync(f, t.replace(from, to));
};
const statuses = async (cwd, ...ids) => {
  const items = (await cli(cwd, "status")).env.data.items;
  return ids.map((id) => items.find((i) => i.id === id)?.status);
};
const STALE = (n) => Array(n).fill("stale");

test("DAG-G0-FORMAT: a format change stales shots, images, edit and render", async () => {
  const { cwd, dir } = await base();
  setManifest(dir, (m) => { m.assets.push(asset("bg", "img", 1, { status: "approved" })); });
  await snapshot(dir, "shot:s01.previz", ["g0:format"], { status: "proposed" });
  await snapshot(dir, "asset:bg.v1", ["g0:format"]);
  await snapshot(dir, "edit:s01", ["shot:s01.previz", "asset:bg.v1"]);
  await snapshot(dir, "render:final", ["edit:s01"]);
  setProject(dir, (p) => { Object.assign(p.g0, { format: "landscape", width: 1920, height: 1080 }); });
  edit(dir, "style.md", "portrait 1080x1920", "landscape 1920x1080");
  assert.deepEqual(await statuses(cwd, "shot:s01.previz", "asset:bg.v1", "edit:s01", "render:final"), STALE(4));
});

test("DAG-G0-LANGUAGE: a language change stales voices and VO", async () => {
  const { cwd, dir } = await base();
  await snapshot(dir, "bible:characters.mara", ["bible:characters.mara", "g0:language"]);
  await snapshot(dir, "vo:L01", ["unit:L01", "g0:language"]);
  setProject(dir, (p) => { p.g0.language = "id"; });
  assert.deepEqual(await statuses(cwd, "bible:characters.mara", "vo:L01"), STALE(2));
});

test("DAG-G0-AUDIO-MODE: an audio_mode change stales the unit approvals and the previz clock", async () => {
  const { cwd, dir } = await base();
  await snapshot(dir, "unit:L01", ["unit:L01", "g0:audio_mode"]);
  await snapshot(dir, "shot:s01.previz", ["g0:audio_mode"], { status: "proposed" });
  setProject(dir, (p) => { p.g0.audio_mode = "text-led"; });
  edit(dir, "style.md", "audio_mode: narrated", "audio_mode: text-led");
  assert.deepEqual(await statuses(cwd, "unit:L01", "shot:s01.previz"), STALE(2));
});

test("DAG-SCRIPT-L-VO + AC-05: a narration edit stales VO and previz only; storyboard gets a hint", async () => {
  const { cwd, dir } = await base();
  await snapshot(dir, "vo:L01", ["unit:L01"]);
  await snapshot(dir, "vo:L02", ["unit:L02"]);
  await snapshot(dir, "shot:s01.previz", ["unit:L01"], { status: "proposed" });
  await snapshot(dir, "shot:s01.storyboard", [], { status: "proposed", watch: ["unit:L01", "bible:world"] });
  await snapshot(dir, "edit:s01", ["shot:s01.previz"]);
  edit(dir, "script/narration.md", "climbed the stairs", "climbed the tower");
  const items = (await cli(cwd, "status")).env.data.items;
  const by = Object.fromEntries(items.map((i) => [i.id, i]));
  assert.deepEqual([by["vo:L01"].status, by["shot:s01.previz"].status, by["edit:s01"].status], STALE(3));
  assert.equal(by["vo:L02"].status, "approved");
  assert.equal(by["shot:s01.storyboard"].status, "proposed");
  assert.deepEqual(by["shot:s01.storyboard"].watch, [{ source: "unit:L01" }]);
});

test("DAG-SCRIPT-T-PREVIZ: a copy edit stales the previz of the shot placing it", async () => {
  const { cwd, dir } = await base({ mode: "text-led" });
  await snapshot(dir, "shot:s01.previz", ["unit:T01"], { status: "proposed" });
  edit(dir, "script/copy.md", "Forty years.", "Forty long years.");
  assert.deepEqual(await statuses(cwd, "shot:s01.previz"), ["stale"]);
});

test("DAG-BIBLE-ENTITY + AC-04: an entity edit stales its refs and images; the storyboard only gets a hint", async () => {
  const { cwd, dir } = await base();
  setManifest(dir, (m) => { m.assets.push(asset("mara-sheet", "ref", 1, { status: "approved" }), asset("img1", "img", 1, { status: "approved" })); });
  await snapshot(dir, "asset:mara-sheet.v1", ["bible:characters.mara"]);
  await snapshot(dir, "asset:img1.v1", ["bible:characters.mara", "asset:mara-sheet.v1"]);
  await snapshot(dir, "shot:s01.storyboard", [], { status: "proposed", watch: ["bible:characters.mara"] });
  await snapshot(dir, "style:camera", ["style:camera"]);
  edit(dir, "bible.yaml", "grey braid", "red braid");
  assert.deepEqual(await statuses(cwd, "asset:mara-sheet.v1", "asset:img1.v1", "shot:s01.storyboard", "style:camera"), ["stale", "stale", "proposed", "approved"]);
});

test("DAG-BIBLE-VOICE: a voice edit stales that speaker's VO and the previz of its shots", async () => {
  const { cwd, dir } = await base();
  await snapshot(dir, "vo:L02", ["unit:L02", "bible:characters.mara.voice"]);
  await snapshot(dir, "shot:s01.previz", ["vo:L02"], { status: "proposed" });
  edit(dir, "bible.yaml", "builtin:eve", "builtin:jane");
  assert.deepEqual(await statuses(cwd, "vo:L02", "shot:s01.previz"), STALE(2));
});

test("DAG-BIBLE-LEXICON: a lexicon edit stales the VO lines", async () => {
  const { cwd, dir } = await base();
  await snapshot(dir, "vo:L02", ["bible:pronunciation.Skerryvore"]);
  edit(dir, "bible.yaml", "SKERRY-vor", "SKERRY-vore");
  assert.deepEqual(await statuses(cwd, "vo:L02"), ["stale"]);
});

test("DAG-VO-RETIME: a new VO version re-opens only the previz of the shot that uses that line", async () => {
  const { cwd, dir } = await base();
  setManifest(dir, (m) => { m.assets.push(asset("vo-L01", "vo", 1, { line: "L01", status: "approved" }), asset("vo-L02", "vo", 1, { line: "L02", status: "approved" })); });
  await snapshot(dir, "shot:s01.previz", ["clock:L01=vo.v1"], { status: "proposed" });
  await snapshot(dir, "shot:s02.previz", ["clock:L02=vo.v1"], { status: "proposed" });
  setManifest(dir, (m) => { m.assets.push(asset("vo-L01", "vo", 2, { line: "L01" })); });
  assert.deepEqual(await statuses(cwd, "shot:s01.previz", "shot:s02.previz"), ["stale", "proposed"]);
});

test("DAG-STYLE-ANCHOR: an anchor edit stales only artifacts that recorded it", async () => {
  const { cwd, dir } = await base();
  await snapshot(dir, "shot:s01.previz", ["style:camera"], { status: "proposed" });
  await snapshot(dir, "shot:s01.fx", ["style:texture"], { status: "proposed" });
  edit(dir, "style.md", "Slow push-ins only.", "Fast whip pans only.");
  assert.deepEqual(await statuses(cwd, "shot:s01.previz", "shot:s01.fx"), ["stale", "proposed"]);
});

test("DAG-SHOT-STORYBOARD: a storyboard change stales previz, fx and edit", async () => {
  const { cwd, dir } = await base();
  await snapshot(dir, "shot:s01.previz", ["shot:s01.storyboard"], { status: "proposed" });
  await snapshot(dir, "shot:s01.fx", ["shot:s01.previz"], { status: "proposed" });
  await snapshot(dir, "edit:s01", ["shot:s01.fx"]);
  await writeStory(dir, 2, [shot("s01", { scene: "changed", duration_est: "5s", voiceover: "[L01]" }, "One", "n")]);
  assert.deepEqual(await statuses(cwd, "shot:s01.previz", "shot:s01.fx", "edit:s01"), STALE(3));
});

test("DAG-SHOT-PREVIZ: a previz change stales fx and edit, not the storyboard item", async () => {
  const { cwd, dir } = await base();
  await snapshot(dir, "shot:s01.storyboard", [], { status: "proposed" });
  await snapshot(dir, "shot:s01.fx", ["shot:s01.previz"], { status: "proposed" });
  await snapshot(dir, "edit:s01", ["shot:s01.previz"]);
  await writeStory(dir, 2, [shot("s01", { scene: "a", duration_est: "5s", voiceover: "[L01]", camera: "push-in" }, "One", "n")]);
  assert.deepEqual(await statuses(cwd, "shot:s01.storyboard", "shot:s01.fx", "edit:s01"), ["proposed", "stale", "stale"]);
});

test("DAG-SHOT-FX: an fx change stales the edit", async () => {
  const { cwd, dir } = await base();
  await snapshot(dir, "edit:s01", ["shot:s01.fx"]);
  await writeStory(dir, 2, [shot("s01", { scene: "a", duration_est: "5s", voiceover: "[L01]", grade: "warm" }, "One", "n")]);
  assert.deepEqual(await statuses(cwd, "edit:s01"), ["stale"]);
});

test("DAG-MUSIC-GRID: a new music version stales previz and edit", async () => {
  const { cwd, dir } = await base({ mode: "music-led" });
  setManifest(dir, (m) => { m.assets.push(asset("music01", "music", 1, { status: "approved", license: "CC0", source: "x", credit: "y" })); });
  await snapshot(dir, "shot:s01.previz", ["clock:music01=music.v1"], { status: "proposed" });
  await snapshot(dir, "edit:s01", ["shot:s01.previz"]);
  setManifest(dir, (m) => { m.assets.push(asset("music01", "music", 2, { license: "CC0", source: "x", credit: "y" })); });
  assert.deepEqual(await statuses(cwd, "shot:s01.previz", "edit:s01"), STALE(2));
});

test("DAG-REF-VERSION: a new ref version stales its images and the G5r gate lists the new version", async () => {
  const { cwd, dir } = await base();
  setManifest(dir, (m) => { m.assets.push(asset("mara-sheet", "ref", 1, { status: "approved" }), asset("img1", "img", 1, { status: "approved" })); });
  await snapshot(dir, "asset:mara-sheet.v1", []);
  await snapshot(dir, "asset:img1.v1", ["asset:mara-sheet.v1"]);
  setManifest(dir, (m) => { m.assets.push(asset("mara-sheet", "ref", 2)); });
  const r = await cli(cwd, "status");
  const by = Object.fromEntries(r.env.data.items.map((i) => [i.id, i.status]));
  assert.equal(by["asset:img1.v1"], "stale");
  assert.deepEqual(r.env.data.gates.G5r.items, [{ id: "asset:mara-sheet.v2", status: "missing" }]);
  assert.equal(r.env.data.gates.G5r.state, "open");
});

test("DAG-ASSET-APPROVED: a new approved asset version stales the compositions and the render", async () => {
  const { cwd, dir } = await base();
  setManifest(dir, (m) => { m.assets.push(asset("bg", "img", 1, { status: "approved" })); });
  await snapshot(dir, "edit:s01", ["asset:bg.v1"]);
  await snapshot(dir, "render:final", ["edit:s01"]);
  setManifest(dir, (m) => { m.assets.push(asset("bg", "img", 2, { status: "approved" })); });
  assert.deepEqual(await statuses(cwd, "edit:s01", "render:final"), STALE(2));
});

test("DAG-EDIT-RENDER: an edit change stales the render and re-opens G6 and G7", async () => {
  const { cwd, dir } = await base();
  await snapshot(dir, "edit:s01", ["shot:s01.fx"]);
  await snapshot(dir, "render:final", ["edit:s01"]);
  await snapshot(dir, "g6", ["render:final"], { kind: "project" });
  await snapshot(dir, "g7", ["g6"], { kind: "project" });
  await writeStory(dir, 2, [shot("s01", { scene: "a", duration_est: "5s", voiceover: "[L01]", grade: "cold" }, "One", "n")]);
  const r = await cli(cwd, "status");
  assert.equal(r.env.data.gates.G6.state, "reopened");
  assert.equal(r.env.data.gates.G7.state, "reopened");
});

test("DAG-STALE-VS-REVIEW: hash mismatch is stale; a watched change is only a hint", async () => {
  const { cwd, dir } = await base();
  await snapshot(dir, "shot:s01.previz", ["style:camera"], { status: "proposed", watch: ["bible:world"] });
  await snapshot(dir, "shot:s01.fx", [], { status: "proposed", watch: ["bible:world"] });
  edit(dir, "style.md", "Slow push-ins only.", "Different.");
  edit(dir, "bible.yaml", "1950s", "1960s");
  const items = (await cli(cwd, "status")).env.data.items;
  const by = Object.fromEntries(items.map((i) => [i.id, i]));
  assert.equal(by["shot:s01.previz"].status, "stale");
  assert.equal(by["shot:s01.fx"].status, "proposed");
  assert.deepEqual(by["shot:s01.fx"].watch, [{ source: "bible:world" }]);
  assert.equal(getProject(dir).items["shot:s01.fx"].status, "proposed");
});
