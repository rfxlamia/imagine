import { test } from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sha256 } from "../src/hash.mjs";
import { asset, cli, makeProject, put, seedCanon, setManifest, shot, writeStory } from "./helpers/fixture.mjs";

const OK = () => [
  shot("s01", { scene: "stairs", duration_est: "5s", voiceover: "[L01]", characters: "[mara]", location: "lighthouse", assets: "[bg:img:1672x941]" }, "Stairs", "She climbs."),
  shot("s02", { scene: "sea", duration_est: "5s", voiceover: "[L02]", location: "lighthouse" }, "Sea"),
  shot("s03", { scene: "lamp", duration_est: "3s", voiceover: "[L03]" }, "Lamp"),
];
const withKeys = (shots, id, keys) => shots.map((s) => (s.id === id ? { ...s, keys: { ...s.keys, ...keys } } : s));
async function proj(shots = OK(), opts) {
  const p = await makeProject(opts);
  seedCanon(p.dir, { copy: opts?.mode && opts.mode !== "narrated" });
  await writeStory(p.dir, 1, shots);
  return p;
}
const validate = (cwd, ...a) => cli(cwd, "validate", "story", ...a);
const rulesOf = (r) => r.env.errors.map((e) => e.rule);
const DURATIONS = "L01: 3\nL02: 3\nL03: 2\n";

test("validate story: a clean storyboard passes, is read-only and lists what it checked", async () => {
  const { cwd, dir } = await proj();
  const before = sha256(readFileSync(join(dir, "STORY.md")));
  const r = await validate(cwd, "--stage", "storyboard");
  assert.equal(r.exit, 0, JSON.stringify(r.env.errors));
  for (const id of ["HARD-STORY-IDS", "HARD-STORY-UNIT-ONCE", "HARD-DURATION", "HARD-ENTITIES-EXIST", "HARD-STORYBOARD-ASSET-DECL"]) assert.ok(r.env.data.checked.includes(id), id);
  assert.equal(sha256(readFileSync(join(dir, "STORY.md"))), before);
});

test("CAP-ADV-NOT-RUN: advisory rules without a deterministic check are not_run, never passed", async () => {
  const { cwd } = await proj();
  const r = await validate(cwd);
  assert.ok(r.env.not_run.some((n) => n.rule === "ADV-HERO-40" && n.cause));
  assert.equal(r.env.advice.some((a) => a.rule === "ADV-HERO-40"), false);
});

test("HARD-STORY-IDS: duplicate shot ids and non-scene headings fail", async () => {
  const dup = await proj([shot("s01", { duration_est: "5s" }), shot("s01", { duration_est: "5s" })]);
  assert.ok(rulesOf(await validate(dup.cwd)).includes("HARD-STORY-IDS"));
  const bad = await proj();
  const text = readFileSync(join(bad.dir, "STORY.md"), "utf8").replace("## Scene s02", "## Shot s02");
  put(bad.dir, "STORY.md", text);
  put(bad.dir, ".history/STORY.r1.md", text);
  const r = await validate(bad.cwd);
  assert.equal(r.exit, 1);
  assert.ok(rulesOf(r).includes("HARD-STORY-IDS"));
});

test("HARD-STORY-UNIT-ONCE: every script unit is placed exactly once", async () => {
  const missing = await proj(OK().slice(0, 2));
  assert.match((await validate(missing.cwd)).env.errors.find((e) => e.rule === "HARD-STORY-UNIT-ONCE").message, /L03/);
  const twice = await proj(withKeys(OK(), "s02", { voiceover: "[L01, L02]" }));
  assert.ok((await validate(twice.cwd)).env.errors.some((e) => e.item === "L01" && /2 times/.test(e.message)));
  const unknown = await proj(withKeys(OK(), "s03", { voiceover: "[L03, L09]" }));
  assert.ok((await validate(unknown.cwd)).env.errors.some((e) => e.item === "L09"));
});

test("HARD-DURATION: the total must sit inside the G0 range", async () => {
  const long = await proj(withKeys(OK(), "s03", { duration_est: "9s" }));
  assert.ok(rulesOf(await validate(long.cwd)).includes("HARD-DURATION"));
  const short = await proj(withKeys(OK(), "s03", { duration_est: "1s" }));
  assert.ok(rulesOf(await validate(short.cwd)).includes("HARD-DURATION"));
});

test("HARD-ENTITIES-EXIST: characters and locations must exist in the bible", async () => {
  const ghost = await proj(withKeys(OK(), "s01", { characters: "[ghost]" }));
  assert.ok((await validate(ghost.cwd)).env.errors.some((e) => e.rule === "HARD-ENTITIES-EXIST" && /ghost/.test(e.message)));
  const harbour = await proj(withKeys(OK(), "s02", { location: "harbour" }));
  assert.ok(rulesOf(await validate(harbour.cwd)).includes("HARD-ENTITIES-EXIST"));
});

test("HARD-NO-PLACEHOLDER: TODO, TBD, lorem and {{ are PLACEHOLDER errors", async () => {
  const narr = await proj(OK().map((s) => (s.id === "s01" ? { ...s, narrative: "TODO write this" } : s)));
  const r = await validate(narr.cwd);
  assert.equal(r.exit, 1);
  assert.equal(r.env.code, "PLACEHOLDER");
  const tpl = await proj(withKeys(OK(), "s02", { scene: "{{caption}}" }));
  assert.ok(rulesOf(await validate(tpl.cwd)).includes("HARD-NO-PLACEHOLDER"));
});

test("HARD-STORYBOARD-ASSET-DECL: assets carry kind and size; every shot has duration_est", async () => {
  const bad = await proj(withKeys(OK(), "s01", { assets: "[bg:img]" }));
  assert.ok(rulesOf(await validate(bad.cwd)).includes("HARD-STORYBOARD-ASSET-DECL"));
  const noDur = await proj(OK().map((s) => (s.id === "s03" ? { ...s, keys: { scene: "lamp", voiceover: "[L03]" } } : s)));
  assert.ok((await validate(noDur.cwd)).env.errors.some((e) => e.rule === "HARD-DURATION" || e.rule === "HARD-STORYBOARD-ASSET-DECL"));
});

test("HARD-PREVIZ-BEATS-INSIDE: beats must fall inside their shot", async () => {
  const base = withKeys(OK(), "s01", { duration: "5s" });
  const out = await proj(withKeys(base, "s01", { beats: "[1s, 6s]" }));
  assert.ok(rulesOf(await validate(out.cwd, "--stage", "previz")).includes("HARD-PREVIZ-BEATS-INSIDE"));
  const inside = await proj(withKeys(base, "s01", { beats: "[1s, 4.5s]" }));
  assert.equal(rulesOf(await validate(inside.cwd, "--stage", "storyboard")).includes("HARD-PREVIZ-BEATS-INSIDE"), false);
});

test("HARD-VO-NO-OVERLAP: overlap and overrun fail, a fit passes, unknown durations are HARD_NOT_RUN", async () => {
  const fit = await proj();
  put(fit.dir, "tmp/scratch-vo/durations.yaml", DURATIONS);
  assert.equal((await validate(fit.cwd, "--stage", "previz")).exit, 0);

  const overlap = await proj(OK().map((s) => (s.id === "s01" ? { ...s, keys: { ...s.keys, voiceover: "[L01, L02@2]" } } : s.id === "s02" ? { ...s, keys: { scene: "sea", duration_est: "5s" } } : s)));
  put(overlap.dir, "tmp/scratch-vo/durations.yaml", DURATIONS);
  const o = await validate(overlap.cwd, "--stage", "previz");
  assert.ok(o.env.errors.some((e) => e.rule === "HARD-VO-NO-OVERLAP" && e.code === "HARD"));

  const overrun = await proj();
  put(overrun.dir, "tmp/scratch-vo/durations.yaml", "L01: 3\nL02: 3\nL03: 10\n");
  assert.ok((await validate(overrun.cwd, "--stage", "previz")).env.errors.some((e) => /film is/.test(e.message)));

  const unknown = await proj();
  const n = await validate(unknown.cwd, "--stage", "previz");
  assert.ok(n.env.errors.some((e) => e.rule === "HARD-VO-NO-OVERLAP" && e.code === "HARD_NOT_RUN"));

  const storyboardOnly = await validate(unknown.cwd, "--stage", "storyboard");
  assert.equal(storyboardOnly.exit, 0);
});

test("HARD-VO-NO-OVERLAP: final VO assets supply durations and win over scratch durations", async () => {
  const p = await proj();
  put(p.dir, "tmp/scratch-vo/durations.yaml", "L01: 3\nL02: 3\nL03: 30\n");
  setManifest(p.dir, (m) => { m.assets.push(asset("vo-L03", "vo", 1, { line: "L03", duration_s: 2, status: "approved" })); });
  assert.equal((await validate(p.cwd, "--stage", "previz")).exit, 0);
});

test("HARD-MUSICLED-ASSET: music-led previz needs a music asset", async () => {
  const shots = [shot("s01", { scene: "a", duration_est: "5s", voiceover: "[T01]" }), shot("s02", { scene: "b", duration_est: "5s", voiceover: "[T02]" }), shot("s03", { scene: "c", duration_est: "3s", voiceover: "[T03]" })];
  const p = await proj(shots, { mode: "music-led" });
  assert.ok(rulesOf(await validate(p.cwd, "--stage", "previz")).includes("HARD-MUSICLED-ASSET"));
  setManifest(p.dir, (m) => { m.assets.push(asset("track", "music", 1, { license: "CC0", source: "x", credit: "y" })); });
  assert.equal((await validate(p.cwd, "--stage", "previz")).exit, 0);
});

test("HARD-FX-TOOL-ENUM, HARD-FX-WEBGL-FALLBACK, HARD-NO-CSS-FILTER-RASTER, HARD-PREVIZ-NAMES-EXIST for fx", async () => {
  const run = async (fx, extra = {}, names) => {
    const p = await proj(withKeys(OK(), "s01", { fx, ...extra }));
    put(p.dir, "tmp/scratch-vo/durations.yaml", DURATIONS);
    if (names) put(p.dir, "stage/names.yaml", names);
    return validate(p.cwd, "--stage", "fx");
  };
  const NAMES = "media_treatment: [film-grain]\nregistry: [fractal-noise]\nshaders: [glitch]\n";
  assert.equal((await run("[g=media-treatment:film-grain]", {}, NAMES)).exit, 0);
  assert.ok(rulesOf(await run("[x=css-filter:blur]", {}, NAMES)).includes("HARD-FX-TOOL-ENUM"));
  assert.ok(rulesOf(await run("[x=css-filter:blur]", {}, NAMES)).includes("HARD-NO-CSS-FILTER-RASTER"));
  assert.ok(rulesOf(await run("[fog=registry:fractal-noise]", {}, NAMES)).includes("HARD-FX-WEBGL-FALLBACK"));
  assert.equal((await run("[fog=registry:fractal-noise;fallback=static-plate]", {}, NAMES)).exit, 0);
  assert.ok(rulesOf(await run("[u=media-treatment:film-grain;unsupported=true]", {}, NAMES)).includes("HARD-FX-WEBGL-FALLBACK"));
  assert.ok(rulesOf(await run("[g=media-treatment:film-grain]", { grade: "filter: blur(2px)" }, NAMES)).includes("HARD-NO-CSS-FILTER-RASTER"));
  const missing = await run("[g=media-treatment:film-grain]");
  assert.ok(missing.env.errors.some((e) => e.rule === "HARD-PREVIZ-NAMES-EXIST" && e.code === "HARD_NOT_RUN"));
  const unknown = await run("[g=shader:nope;fallback=x]", {}, NAMES);
  assert.ok(unknown.env.errors.some((e) => e.rule === "HARD-PREVIZ-NAMES-EXIST" && e.code === "HARD"));
});

test("HARD-PREVIZ-NAMES-EXIST: transitions other than cut and crossfade need stage/names.yaml", async () => {
  const shots = withKeys(withKeys(OK(), "s01", { transition_in: "iris-wipe 0.5s" }), "s02", { transition_in: "crossfade 0.6s" });
  const p = await proj(shots);
  put(p.dir, "tmp/scratch-vo/durations.yaml", DURATIONS);
  assert.ok((await validate(p.cwd, "--stage", "previz")).env.errors.some((e) => e.code === "HARD_NOT_RUN" && e.rule === "HARD-PREVIZ-NAMES-EXIST"));
  put(p.dir, "stage/names.yaml", "transitions: [iris-wipe]\n");
  assert.equal((await validate(p.cwd, "--stage", "previz")).exit, 0);
  put(p.dir, "stage/names.yaml", "transitions: [whip]\n");
  assert.ok(rulesOf(await validate(p.cwd, "--stage", "previz")).includes("HARD-PREVIZ-NAMES-EXIST"));
});

test("advisory: hard cuts and portrait pacing are advice, not errors", async () => {
  const shots = OK().map((s) => ({ ...s, keys: { ...s.keys, transition_in: "cut" } }));
  const p = await proj(shots);
  const r = await validate(p.cwd, "--stage", "storyboard");
  assert.equal(r.exit, 0);
  assert.ok(r.env.advice.some((a) => a.rule === "ADV-HARD-CUTS"));
  assert.ok(r.env.advice.some((a) => a.rule === "ADV-VERTICAL"));
});

test("HARD-STORY-WRITERS: validate story reports a hand-edited STORY.md as KEY_NOT_OWNED", async () => {
  const { cwd, dir } = await proj();
  appendFileSync(join(dir, "STORY.md"), "\nextra\n");
  const r = await validate(cwd);
  assert.equal(r.exit, 1);
  assert.equal(r.env.errors[0].code, "KEY_NOT_OWNED");
});

test("validate story: an invalid --stage is USAGE", async () => {
  const { cwd } = await proj();
  assert.equal((await validate(cwd, "--stage", "edit")).exit, 2);
});
