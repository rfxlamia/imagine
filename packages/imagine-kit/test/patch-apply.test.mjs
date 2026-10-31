import { test } from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { sha256 } from "../src/hash.mjs";
import { run } from "../src/cli.mjs";
import { NOW, approveThrough, cli, getProject, makeProject, put, seedCanon } from "./helpers/fixture.mjs";

async function ready() {
  const p = await makeProject();
  seedCanon(p.dir);
  await approveThrough(p.cwd, "G3");
  return p;
}
const srcs = async (cwd, ...refs) => (await cli(cwd, "status", "--ref", refs.join(","))).env.data.sources;
function stagePatch(dir, stage, patch, name = "r1.patch.yaml") {
  const rel = `stage/${stage}/${name}`;
  put(dir, rel, YAML.stringify(patch));
  return rel;
}
const sha = (dir, f) => sha256(readFileSync(join(dir, f)));
const apply = (cwd, rel, ...rest) => cli(cwd, "patch", "apply", rel, ...rest);

async function storyboardPatch(cwd, over = {}) {
  const s = await srcs(cwd, "bible:characters.mara", "bible:locations.lighthouse", "unit:L01", "unit:L02", "unit:L03");
  return { stage: "storyboard", author: "storyboard-artist", base_story_rev: 0,
    inputs: { bible: { "characters.mara": s["bible:characters.mara"], "locations.lighthouse": s["bible:locations.lighthouse"] },
      units: { L01: s["unit:L01"], L02: s["unit:L02"], L03: s["unit:L03"] } },
    ops: [
      { create_shot: { id: "s01", after: null, title: "Stairs", narrative: "She climbs.", reasons: { scene: "opens on the climb" },
        set: { scene: "stairs", duration_est: "5s", voiceover: ["L01"], characters: ["mara"], location: "lighthouse", assets: ["bg:img:1672x941"] } } },
      { create_shot: { id: "s02", after: "s01", title: "Sea", narrative: "", set: { scene: "sea", duration_est: "5s", voiceover: ["L02"] } } },
      { create_shot: { id: "s03", after: "s02", title: "Lamp", narrative: "", set: { scene: "lamp", duration_est: "3s", voiceover: ["L03"] } } },
    ], ...over };
}
async function previzPatch(cwd, rev, over = {}) {
  const s = await srcs(cwd, "style:camera", "style:motion");
  return { stage: "previz", author: "previz-designer", base_story_rev: rev,
    inputs: { style: { camera: s["style:camera"], motion: s["style:motion"] } },
    ops: [
      { shot: "s01", set: { duration: "5s", camera: "push-in 1.00-1.08", transition_in: "crossfade 0.6s" }, reasons: { camera: "style.md#camera asks for slow intimacy" } },
      { shot: "s02", set: { duration: "5s", camera: "hold", transition_in: "cut" } },
      { shot: "s03", set: { duration: "3s", camera: "push-in", transition_in: "crossfade 0.4s" } },
    ], ...over };
}
async function withStoryboard() {
  const p = await ready();
  const rel = stagePatch(p.dir, "storyboard", await storyboardPatch(p.cwd));
  const r = await apply(p.cwd, rel);
  assert.equal(r.exit, 0, JSON.stringify(r.env.errors));
  return p;
}

test("patch apply: a storyboard patch bumps the revision, records proposed items and journals", async () => {
  const { cwd, dir } = await ready();
  const rel = stagePatch(dir, "storyboard", await storyboardPatch(cwd));
  const r = await apply(cwd, rel);
  assert.equal(r.exit, 0, JSON.stringify(r.env.errors));
  assert.deepEqual(r.env.data, { story_rev: 1, touched: ["s01", "s02", "s03"] });
  assert.match(r.env.journal_id, /^j-/);
  const story = readFileSync(join(dir, "STORY.md"), "utf8");
  assert.match(story, /^---\nimagine_rev: 1\n---\n\n## Scene s01 — Stairs\n- scene: stairs\n- duration_est: 5s\n- voiceover: \[L01\]/);
  assert.equal(existsSync(join(dir, ".history", "STORY.r1.md")), true);
  const item = getProject(dir).items["shot:s01.storyboard"];
  assert.deepEqual([item.kind, item.status, item.rev], ["shot-stage", "proposed", 1]);
  assert.deepEqual(Object.keys(item.inputs).sort(), ["g0:audio_mode", "g0:duration_s", "g0:format"]);
  assert.deepEqual(Object.keys(item.watch).sort(), ["bible:characters.mara", "bible:locations.lighthouse", "unit:L01"]);
  assert.equal(item.patch.file, rel);
  assert.equal(item.patch.brief_hash, undefined);
  assert.match(readFileSync(join(dir, "journal.md"), "utf8"), /patch apply: storyboard/);
  assert.equal((await cli(cwd, "status")).exit, 0);
  assert.equal((await cli(cwd, "validate", "story", "--stage", "storyboard")).exit, 0);
});

test("patch apply: previz after storyboard records stale-driving style/unit inputs and the upstream block; brief_hash is kept when present", async () => {
  const { cwd, dir } = await withStoryboard();
  put(dir, "tmp/scratch-vo/durations.yaml", "L01: 3\nL02: 3\nL03: 2\n");
  const rel = stagePatch(dir, "previz", await previzPatch(cwd, 1, { brief_hash: "f".repeat(64) }));
  const r = await apply(cwd, rel);
  assert.equal(r.exit, 0, JSON.stringify(r.env.errors));
  assert.equal(r.env.data.story_rev, 2);
  const item = getProject(dir).items["shot:s01.previz"];
  assert.ok(item.inputs["shot:s01.storyboard"] && item.inputs["style:camera"] && item.inputs["style:motion"]);
  assert.equal(item.patch.brief_hash, "f".repeat(64));
  assert.equal(getProject(dir).items["shot:s01.storyboard"].rev, 1);
  const s = await cli(cwd, "status");
  assert.equal(s.exit, 0);
  assert.equal(s.env.data.items.some((i) => i.status === "stale"), false);
});

test("patch apply: an fx patch records the previz block as its upstream", async () => {
  const { cwd, dir } = await withStoryboard();
  put(dir, "tmp/scratch-vo/durations.yaml", "L01: 3\nL02: 3\nL03: 2\n");
  assert.equal((await apply(cwd, stagePatch(dir, "previz", await previzPatch(cwd, 1)))).exit, 0);
  put(dir, "stage/names.yaml", "media_treatment: [film-grain]\n");
  const s = await srcs(cwd, "style:texture");
  const fx = { stage: "fx", author: "fx-designer", base_story_rev: 2, inputs: { style: { texture: s["style:texture"] } },
    ops: [{ shot: "s01", set: { fx: ["grain=media-treatment:film-grain"], grade: "warm" } }] };
  const r = await apply(cwd, stagePatch(dir, "fx", fx));
  assert.equal(r.exit, 0, JSON.stringify(r.env.errors));
  const item = getProject(dir).items["shot:s01.fx"];
  assert.ok(item.inputs["shot:s01.previz"] && item.inputs["style:texture"]);
});

test("AC-02: a forbidden key is KEY_NOT_OWNED and nothing changes", async () => {
  const { cwd, dir } = await withStoryboard();
  put(dir, "tmp/scratch-vo/durations.yaml", "L01: 3\nL02: 3\nL03: 2\n");
  const patch = await previzPatch(cwd, 1);
  patch.ops[0].set.characters = ["mara"];
  const rel = stagePatch(dir, "previz", patch);
  const before = [sha(dir, "STORY.md"), sha(dir, "project.yaml")];
  const r = await apply(cwd, rel);
  assert.equal(r.exit, 1);
  assert.equal(r.env.code, "KEY_NOT_OWNED");
  assert.equal(r.env.errors[0].rule, "HARD-PATCH-KEYS");
  assert.deepEqual([sha(dir, "STORY.md"), sha(dir, "project.yaml")], before);
  assert.equal(existsSync(join(dir, ".history", "STORY.r2.md")), false);
});

test("AC-12 + HARD-PATCH-REVERIFY: a bible edit after staging returns STALE_INPUTS and writes nothing", async () => {
  const { cwd, dir } = await ready();
  const rel = stagePatch(dir, "storyboard", await storyboardPatch(cwd));
  writeFileSync(join(dir, "bible.yaml"), readFileSync(join(dir, "bible.yaml"), "utf8").replace("grey braid", "red braid"));
  const before = [sha(dir, "STORY.md"), sha(dir, "project.yaml")];
  const r = await apply(cwd, rel);
  assert.equal(r.exit, 4);
  assert.equal(r.env.code, "STALE_INPUTS");
  assert.ok(r.env.errors.some((e) => e.item === "bible:characters.mara"));
  assert.deepEqual([sha(dir, "STORY.md"), sha(dir, "project.yaml")], before);
  assert.equal(existsSync(join(dir, ".history", "STORY.r1.md")), false);
  const reapprove = await cli(cwd, "gate", "G2", "approve", "--scope", "characters.mara", "--quote", "hair changed, still right");
  assert.equal(reapprove.exit, 0, JSON.stringify(reapprove.env.errors));
  const again = stagePatch(dir, "storyboard", await storyboardPatch(cwd), "r2.patch.yaml");
  assert.equal((await apply(cwd, again)).exit, 0);
});

test("HARD-PATCH-BASE-REV + PROC-CONFLICT-REDISPATCH: a stale base revision is CONFLICT", async () => {
  const { cwd, dir } = await withStoryboard();
  const stale = stagePatch(dir, "storyboard", await storyboardPatch(cwd, { base_story_rev: 0 }), "r2.patch.yaml");
  const before = sha(dir, "STORY.md");
  const r = await apply(cwd, stale);
  assert.equal(r.exit, 4);
  assert.equal(r.env.code, "CONFLICT");
  assert.equal(sha(dir, "STORY.md"), before);
});

test("HARD-PATCH-INPUTS-DECLARED: every unit, entity and anchor the ops use must be declared", async () => {
  const { cwd, dir } = await ready();
  const patch = await storyboardPatch(cwd);
  delete patch.inputs.units.L02;
  const before = sha(dir, "STORY.md");
  const r = await apply(cwd, stagePatch(dir, "storyboard", patch));
  assert.equal(r.exit, 1);
  assert.ok(r.env.errors.some((e) => e.rule === "HARD-PATCH-INPUTS-DECLARED" && e.item === "unit:L02"));
  assert.equal(sha(dir, "STORY.md"), before);
});

test("HARD-ENTITIES-EXIST: a declared bible entity that does not exist is refused", async () => {
  const { cwd, dir } = await ready();
  const patch = await storyboardPatch(cwd);
  patch.inputs.bible["characters.ghost"] = "0".repeat(64);
  const r = await apply(cwd, stagePatch(dir, "storyboard", patch));
  assert.equal(r.exit, 1);
  assert.ok(r.env.errors.some((e) => e.rule === "HARD-ENTITIES-EXIST" && e.item === "bible:characters.ghost"));
});

test("patch apply re-runs the full validate story rules on the result", async () => {
  const { cwd, dir } = await ready();
  const patch = await storyboardPatch(cwd);
  patch.ops.pop();
  const before = sha(dir, "STORY.md");
  const r = await apply(cwd, stagePatch(dir, "storyboard", patch));
  assert.equal(r.exit, 1);
  assert.ok(r.env.errors.some((e) => e.rule === "HARD-STORY-UNIT-ONCE" && e.item === "L03"));
  assert.equal(sha(dir, "STORY.md"), before);
});

test("HARD-STORY-WRITERS: a hand-edited STORY.md blocks apply", async () => {
  const { cwd, dir } = await ready();
  const rel = stagePatch(dir, "storyboard", await storyboardPatch(cwd));
  appendFileSync(join(dir, "STORY.md"), "\nsneaky\n");
  const r = await apply(cwd, rel);
  assert.equal(r.exit, 1);
  assert.equal(r.env.code, "KEY_NOT_OWNED");
  assert.equal(r.env.errors[0].rule, "HARD-STORY-WRITERS");
});

test("HARD-GATES-RECORDED: planning patches need G0-G3 approved", async () => {
  const p = await makeProject();
  seedCanon(p.dir);
  const rel = stagePatch(p.dir, "storyboard", await storyboardPatch(p.cwd));
  const r = await apply(p.cwd, rel);
  assert.equal(r.exit, 1);
  assert.equal(r.env.errors[0].rule, "HARD-GATES-RECORDED");
});

test("PROC-ATOMIC-COMMIT: a crash before the STORY.md rename leaves it untouched and a retry converges", async () => {
  const { cwd, dir } = await ready();
  const rel = stagePatch(dir, "storyboard", await storyboardPatch(cwd));
  const before = sha(dir, "STORY.md");
  const crashed = await run(["patch", "apply", rel], { cwd, now: () => NOW, hooks: { beforeStoryRename() { throw new Error("crash"); } } });
  assert.equal(crashed.exit, 1);
  assert.equal(sha(dir, "STORY.md"), before);
  assert.equal((await cli(cwd, "status")).exit, 0);
  const retry = await apply(cwd, rel);
  assert.equal(retry.exit, 0, JSON.stringify(retry.env.errors));
  assert.equal(retry.env.data.story_rev, 1);
});

test("PROC-ATOMIC-COMMIT: items left by an uncommitted patch are flagged by status and cleaned by the next apply", async () => {
  const { cwd, dir } = await ready();
  const rel = stagePatch(dir, "storyboard", await storyboardPatch(cwd));
  const crashed = await run(["patch", "apply", rel], { cwd, now: () => NOW, hooks: { beforeStoryRename() { throw new Error("crash"); } } });
  assert.equal(crashed.exit, 1);
  const item = (await cli(cwd, "status")).env.data.items.find((i) => i.id === "shot:s03.storyboard");
  assert.equal(item.status, "stale");
  assert.ok(item.reasons.some((r) => r.kind === "uncommitted"));
  const other = await storyboardPatch(cwd);
  other.ops = [
    { create_shot: { id: "s01", after: null, title: "Stairs", narrative: "", set: { scene: "a", duration_est: "6s", voiceover: ["L01", "L02"], characters: ["mara"], location: "lighthouse" } } },
    { create_shot: { id: "s02", after: "s01", title: "Lamp", narrative: "", set: { scene: "b", duration_est: "6s", voiceover: ["L03"] } } },
  ];
  const r = await apply(cwd, stagePatch(dir, "storyboard", other, "r2.patch.yaml"));
  assert.equal(r.exit, 0, JSON.stringify(r.env.errors));
  assert.ok(r.env.advice.some((a) => a.rule === "PROC-ATOMIC-COMMIT" && /shot:s03\.storyboard/.test(a.message)));
  assert.equal(getProject(dir).items["shot:s03.storyboard"], undefined);
  assert.equal((await cli(cwd, "status")).env.data.items.some((i) => i.status === "stale"), false);
});

test("hardening: YAML aliases, prototype keys, symlinks and structure injection are refused", async () => {
  const { cwd, dir } = await ready();
  const before = [sha(dir, "STORY.md"), sha(dir, "project.yaml")];
  put(dir, "stage/storyboard/alias.patch.yaml",
    "stage: storyboard\nauthor: &a storyboard-artist\nbase_story_rev: 0\ninputs: {}\nops: [{ remove_shot: s01 }]\nx: *a\n");
  assert.equal((await apply(cwd, "stage/storyboard/alias.patch.yaml")).exit, 1);
  put(dir, "stage/previz/proto.patch.yaml",
    "stage: previz\nauthor: previz-designer\nbase_story_rev: 0\ninputs: {}\nops:\n  - shot: s01\n    set:\n      __proto__: polluted\n");
  assert.notEqual((await apply(cwd, "stage/previz/proto.patch.yaml")).exit, 0);
  assert.equal({}.polluted, undefined);
  const good = YAML.stringify(await storyboardPatch(cwd));
  assert.ok(good.includes("  bible:\n"));
  put(dir, "stage/storyboard/proto-input.patch.yaml", good.replace("  bible:\n", `  bible:\n    __proto__: "${"0".repeat(64)}"\n`));
  const protoInput = await apply(cwd, "stage/storyboard/proto-input.patch.yaml");
  assert.equal(protoInput.exit, 1);
  assert.equal({}.polluted, undefined);
  put(dir, "elsewhere.yaml", YAML.stringify(await storyboardPatch(cwd)));
  symlinkSync(join(dir, "elsewhere.yaml"), join(dir, "stage", "storyboard", "link.patch.yaml"));
  assert.equal((await apply(cwd, "stage/storyboard/link.patch.yaml")).exit, 2);
  const heading = await storyboardPatch(cwd);
  heading.ops[0].create_shot.narrative = "ok\n## Scene s09 — Injected";
  const h = await apply(cwd, stagePatch(dir, "storyboard", heading, "heading.patch.yaml"));
  assert.equal(h.exit, 1);
  assert.match(h.env.errors[0].message, /headings/);
  const title = await storyboardPatch(cwd);
  title.ops[0].create_shot.title = "A\n## Scene s09 — B";
  assert.equal((await apply(cwd, stagePatch(dir, "storyboard", title, "title.patch.yaml"))).exit, 1);
  assert.deepEqual([sha(dir, "STORY.md"), sha(dir, "project.yaml")], before);
});

test("PROC-LOCK-HASHED-WRITES: patch apply fails fast with LOCKED while the project lock is held", async () => {
  const { cwd, dir } = await ready();
  const rel = stagePatch(dir, "storyboard", await storyboardPatch(cwd));
  mkdirSync(join(dir, ".lock"));
  const r = await apply(cwd, rel);
  assert.equal(r.exit, 5);
  assert.equal(r.env.code, "LOCKED");
});

test("patch apply: only files under stage/<stage>/ are accepted", async () => {
  const { cwd, dir } = await ready();
  put(dir, "elsewhere.patch.yaml", YAML.stringify(await storyboardPatch(cwd)));
  assert.equal((await apply(cwd, "elsewhere.patch.yaml")).exit, 2);
  assert.equal((await apply(cwd, "stage/storyboard/../../elsewhere.patch.yaml")).exit, 2);
  assert.equal((await apply(cwd, "stage/storyboard/missing.yaml")).exit, 2);
  const patch = await storyboardPatch(cwd);
  const wrong = stagePatch(dir, "previz", patch);
  assert.equal((await apply(cwd, wrong)).exit, 1);
});

test("patch apply: reorder works; removing a placed unit's shot is rejected by the validator", async () => {
  const { cwd, dir } = await withStoryboard();
  const reorder = { stage: "storyboard", author: "storyboard-artist", base_story_rev: 1, inputs: {}, ops: [{ reorder: ["s03", "s02", "s01"] }] };
  assert.equal((await apply(cwd, stagePatch(dir, "storyboard", reorder))).exit, 0);
  assert.deepEqual([...readFileSync(join(dir, "STORY.md"), "utf8").matchAll(/^## Scene (s\d\d)/gm)].map((m) => m[1]), ["s03", "s02", "s01"]);
  const remove = { stage: "storyboard", author: "storyboard-artist", base_story_rev: 2, inputs: {}, ops: [{ remove_shot: "s03" }] };
  const r = await apply(cwd, stagePatch(dir, "storyboard", remove, "r2.patch.yaml"));
  assert.equal(r.exit, 1);
  assert.ok(r.env.errors.some((e) => e.rule === "HARD-STORY-UNIT-ONCE"));
});

test("HARD-NON-WAIVABLE: patch apply has no waiver option", async () => {
  const { cwd, dir } = await ready();
  const rel = stagePatch(dir, "storyboard", await storyboardPatch(cwd));
  assert.equal((await apply(cwd, rel, "--waive")).exit, 2);
});
