import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { NOW, approveThrough, asset, cli, getProject, makeProject, put, seedCanon, setManifest, shot, writeStory } from "./helpers/fixture.mjs";

const stagePatch = (dir, stage, patch, name = "r1.patch.yaml") => {
  const rel = `stage/${stage}/${name}`;
  put(dir, rel, YAML.stringify(patch));
  return rel;
};
const apply = (cwd, rel, ...rest) => cli(cwd, "patch", "apply", rel, ...rest);
const srcs = async (cwd, ...refs) => (await cli(cwd, "status", "--ref", refs.join(","))).env.data.sources;

test("HARD-PATCH-INPUTS-DECLARED / DAG-VO-RETIME: record every declared input into inputs or watch by stage", async () => {
  const { cwd, dir } = await makeProject();
  seedCanon(dir);
  await approveThrough(cwd, "G3");

  // Manifest with ref-mara v1 and vo-L01 v1
  setManifest(dir, (m) => {
    m.assets.push(
      asset("ref-mara", "ref", 1, { status: "approved" }),
      asset("vo-L01", "vo", 1, { line: "L01", duration_s: 3, status: "approved" }),
    );
  });

  // Storyboard patch
  const s0 = await srcs(cwd, "bible:characters.mara", "bible:locations.lighthouse", "unit:L01", "unit:L02", "unit:L03");
  const sbPatch = {
    stage: "storyboard", author: "storyboard-artist", base_story_rev: 0,
    inputs: {
      bible: { "characters.mara": s0["bible:characters.mara"], "locations.lighthouse": s0["bible:locations.lighthouse"] },
      units: { L01: s0["unit:L01"], L02: s0["unit:L02"], L03: s0["unit:L03"] },
    },
    ops: [
      { create_shot: { id: "s01", after: null, title: "Stairs", narrative: "Climb",
        set: { scene: "stairs", duration_est: "5s", voiceover: ["L01"], characters: ["mara"], location: "lighthouse" } } },
      { create_shot: { id: "s02", after: "s01", title: "Sea", narrative: "", set: { scene: "sea", duration_est: "5s", voiceover: ["L02"] } } },
      { create_shot: { id: "s03", after: "s02", title: "Lamp", narrative: "", set: { scene: "lamp", duration_est: "3s", voiceover: ["L03"] } } },
    ],
  };
  const sbRel = stagePatch(dir, "storyboard", sbPatch);
  assert.equal((await apply(cwd, sbRel)).exit, 0);

  put(dir, "tmp/scratch-vo/durations.yaml", "L01: 3\nL02: 3\nL03: 2\n");

  const s1 = await srcs(cwd, "style:camera", "style:motion", "asset:ref-mara.v1");
  const voSources = (await cli(cwd, "status", "--ref", "clock:L01=vo.v1")).env.data.sources;
  const voHash = voSources["clock:L01"];
  assert.ok(voHash, "clock:L01 source must resolve");

  const previzPatch = {
    stage: "previz", author: "previz-designer", base_story_rev: 1,
    inputs: {
      style: { camera: s1["style:camera"], motion: s1["style:motion"] },
      clock: { L01: voHash },
      refs: { "ref-mara.v1": s1["asset:ref-mara.v1"] },
    },
    ops: [
      { shot: "s01", set: { duration: "5s", camera: "push-in", transition_in: "crossfade 0.6s" } },
      { shot: "s02", set: { duration: "5s", camera: "hold", transition_in: "cut" } },
      { shot: "s03", set: { duration: "3s", camera: "push-in", transition_in: "crossfade 0.4s" } },
    ],
  };

  const pvRel = stagePatch(dir, "previz", previzPatch);
  const applied = await apply(cwd, pvRel);
  assert.equal(applied.exit, 0, JSON.stringify(applied.env.errors));

  const item = getProject(dir).items["shot:s01.previz"];
  assert.ok(item, "shot:s01.previz must be recorded");
  assert.equal(item.inputs["clock:L01"], voHash, "clock:L01 must be recorded under inputs");
  assert.equal(item.inputs["asset:ref-mara.v1"], s1["asset:ref-mara.v1"], "asset:ref-mara.v1 must be recorded under inputs");

  // Now change the source: add vo-L01 v2 to manifest
  setManifest(dir, (m) => {
    m.assets.push(asset("vo-L01", "vo", 2, { line: "L01", duration_s: 3.5, status: "approved" }));
  });

  const st = await cli(cwd, "status");
  assert.equal(st.exit, 0);
  const previzItem = st.env.data.items.find((i) => i.id === "shot:s01.previz");
  assert.equal(previzItem.status, "stale", "shot:s01.previz must be stale after new VO version");
});

test("HARD-STATUS-DERIVED: resolveRef for unit uses Object.hasOwn and rejects constructor / toString", async () => {
  const { dir } = await makeProject();
  seedCanon(dir);
  const { createContext, resolveRef } = await import("../src/sources.mjs");
  const sctx = createContext(dir);
  assert.equal(resolveRef(sctx, "unit:constructor"), null);
  assert.equal(resolveRef(sctx, "unit:toString"), null);
});

test("HARD-STATUS-DERIVED: readtime clock lookup uses Object.hasOwn on units map", async () => {
  const { dir } = await makeProject();
  put(dir, "script/readtime.yaml", "units:\n  T01:\n    words: 5\n");
  const { createContext, resolveRef } = await import("../src/sources.mjs");
  const sctx = createContext(dir);
  assert.equal(resolveRef(sctx, "clock:constructor", "readtime:"), null);
  assert.equal(resolveRef(sctx, "clock:toString", "readtime:"), null);
});

test("HARD-STATUS-DERIVED: scratch and readtime clock keys must match pattern or resolve to null", async () => {
  const { dir } = await makeProject();
  put(dir, "tmp/scratch-vo/valid_key.wav", "audio-content");
  put(dir, "x.wav", "outside-audio");
  put(dir, "script/readtime.yaml", 'units:\n  valid_key:\n    words: 3\n  "../../x":\n    words: 5\n');
  const { createContext, resolveRef } = await import("../src/sources.mjs");
  const sctx = createContext(dir);
  assert.ok(resolveRef(sctx, "clock:valid_key", "scratch:"), "valid key should resolve");
  assert.equal(resolveRef(sctx, "clock:../../x", "scratch:"), null);
  assert.equal(resolveRef(sctx, "clock:invalid/slash", "scratch:"), null);
  assert.ok(resolveRef(sctx, "clock:valid_key", "readtime:"), "valid readtime key should resolve");
  assert.equal(resolveRef(sctx, "clock:../../x", "readtime:"), null);
});

test("DAG-MUSIC-GRID: music.vN clocks only resolve entries whose manifest kind is music", async () => {
  const { dir } = await makeProject();
  setManifest(dir, (m) => {
    m.assets.push(
      asset("track", "music", 1, { status: "approved", license: "CC0", source: "test", credit: "test" }),
      asset("not-track", "ref", 1, { status: "approved" }),
    );
  });
  const { createContext, resolveRef } = await import("../src/sources.mjs");
  const sctx = createContext(dir);
  assert.ok(resolveRef(sctx, "clock:track", "music.v1:"), "music asset should resolve for music clock");
  assert.equal(resolveRef(sctx, "clock:not-track", "music.v1:"), null, "non-music asset should resolve to null for music clock");
});

test("PROC-ATOMIC-COMMIT: gate writes project.yaml first and manifest last", async () => {
  const { cwd, dir } = await makeProject();
  seedCanon(dir);
  setManifest(dir, (m) => {
    m.assets.push(asset("ref-mara", "ref", 1, { status: "pending" }));
  });
  await approveThrough(cwd, "G4");

  const manifestBefore = readFileSync(join(dir, "assets", "manifest.yaml"));

  const { run } = await import("../src/cli.mjs");
  const crashed = await run(["gate", "G5r", "approve", "--quote", "approve ref"], {
    cwd,
    now: () => NOW,
    hooks: {
      betweenWrites() { throw new Error("crash between writes"); },
    },
  });
  assert.equal(crashed.exit, 1);
  const manifestAfterCrash = readFileSync(join(dir, "assets", "manifest.yaml"));
  assert.deepEqual(manifestAfterCrash, manifestBefore, "manifest must be byte-identical after crash between writes");

  const retry = await cli(cwd, "gate", "G5r", "approve", "--quote", "approve ref");
  assert.equal(retry.exit, 0);
  const manifest = YAML.parse(readFileSync(join(dir, "assets", "manifest.yaml"), "utf8"));
  assert.equal(manifest.assets.find((a) => a.id === "ref-mara").status, "approved");
});

test("HARD-PATCH-KEYS: reasons values must be strings and reject non-string objects with clean HARD error", async () => {
  const { cwd, dir } = await makeProject();
  seedCanon(dir);
  await approveThrough(cwd, "G3");

  const storyBefore = readFileSync(join(dir, "STORY.md"), "utf8");

  // Storyboard patch where reasons contains a non-string object { toString: null }
  const badPatch = {
    stage: "storyboard", author: "storyboard-artist", base_story_rev: 0,
    inputs: {},
    ops: [
      { create_shot: { id: "s01", after: null, title: "Title", narrative: "Text",
        set: { scene: "stairs", duration_est: "5s" },
        reasons: { camera: { toString: null } } } },
    ],
  };

  const rel = stagePatch(dir, "storyboard", badPatch, "bad-reasons.patch.yaml");
  const r = await apply(cwd, rel);

  assert.equal(r.exit, 1, "must exit 1");
  assert.equal(r.env.code, "HARD", "must return clean HARD error code");
  assert.ok(r.env.errors.some((e) => e.rule === "HARD-PATCH-KEYS"), "must fail schema validation");
  assert.equal(readFileSync(join(dir, "STORY.md"), "utf8"), storyBefore, "STORY.md must not change");
});

test("GATE-QUOTE: invisible and combining characters are blank quotes while emoji is accepted", async () => {
  const { cwd, dir } = await makeProject();
  seedCanon(dir);

  const getShas = () => [readFileSync(join(dir, "project.yaml"), "utf8"), readFileSync(join(dir, "journal.md"), "utf8")];
  const before = getShas();

  // U+2800, U+3164, lone combining mark U+0301, control character U+0007
  const blankQuotes = ["\u2800", "\u3164", "\u0301", "\u0007"];
  for (const q of blankQuotes) {
    const r = await cli(cwd, "gate", "G0", "approve", "--quote", q);
    assert.equal(r.exit, 7, `quote ${JSON.stringify(q)} must give exit 7`);
    assert.equal(r.env.code, "NEEDS_USER", `quote ${JSON.stringify(q)} must give NEEDS_USER`);
    assert.deepEqual(getShas(), before, `quote ${JSON.stringify(q)} must write nothing`);
  }

  // Thumbs-up emoji quote must be accepted
  const accepted = await cli(cwd, "gate", "G0", "approve", "--quote", "👍");
  assert.equal(accepted.exit, 0, "thumbs-up emoji quote must be accepted");
  assert.equal(getProject(dir).g0.status, "approved");
});

test("HARD-STORY-IDS: fx item parse and render round trips id=tool:name with attributes", async () => {
  const { parseValue, normalizeValue } = await import("../src/story/keys.mjs");
  const raw = "[f1=shader:glitch;range=0-2]";
  const parsed = parseValue("fx", raw);
  assert.ok(!parsed.error, "must parse successfully");
  assert.deepEqual(parsed.value, [{ id: "f1", tool: "shader", name: "glitch", range: "0-2" }]);

  const normalized = normalizeValue("fx", parsed.value);
  assert.ok(!normalized.error, "must normalize successfully");
  assert.equal(normalized.raw, raw, "must preserve :name in normalized output");
});

test("HARD-PREVIZ-NAMES-EXIST: malformed names.yaml key that is a string results in HARD_NOT_RUN with a cause", async () => {
  const { cwd, dir } = await makeProject();
  seedCanon(dir);
  put(dir, "tmp/scratch-vo/durations.yaml", "L01: 3\nL02: 3\nL03: 2\n");
  const shots = [
    shot("s01", { scene: "stairs", duration_est: "5s", duration: "5s", voiceover: "[L01]", transition_in: "iris-wipe 0.5s" }),
    shot("s02", { scene: "sea", duration_est: "5s", duration: "5s", voiceover: "[L02]", transition_in: "cut" }),
    shot("s03", { scene: "lamp", duration_est: "3s", duration: "3s", voiceover: "[L03]", transition_in: "crossfade 0.4s" }),
  ];
  await writeStory(dir, 1, shots);

  // Malformed stage/names.yaml where transitions is a string, not an array of strings
  put(dir, "stage/names.yaml", 'transitions: "iris-wipe"\n');

  const r = await cli(cwd, "validate", "story", "--stage", "previz");
  assert.equal(r.exit, 1, "must fail");
  const errItem = r.env.errors.find((e) => e.rule === "HARD-PREVIZ-NAMES-EXIST");
  assert.ok(errItem, "must report HARD-PREVIZ-NAMES-EXIST");
  assert.equal(errItem.code, "HARD_NOT_RUN", "must be HARD_NOT_RUN, not a pass or HARD");
  assert.ok(errItem.cause, "must have a cause");
});

test("HARD-PREVIZ-NAMES-EXIST: empty names.yaml is treated as missing and results in HARD_NOT_RUN", async () => {
  const { cwd, dir } = await makeProject();
  seedCanon(dir);
  put(dir, "tmp/scratch-vo/durations.yaml", "L01: 3\nL02: 3\nL03: 2\n");
  const shots = [
    shot("s01", { scene: "stairs", duration_est: "5s", duration: "5s", voiceover: "[L01]", transition_in: "iris-wipe 0.5s" }),
    shot("s02", { scene: "sea", duration_est: "5s", duration: "5s", voiceover: "[L02]", transition_in: "cut" }),
    shot("s03", { scene: "lamp", duration_est: "3s", duration: "3s", voiceover: "[L03]", transition_in: "crossfade 0.4s" }),
  ];
  await writeStory(dir, 1, shots);

  // Empty stage/names.yaml
  put(dir, "stage/names.yaml", "");

  const r = await cli(cwd, "validate", "story", "--stage", "previz");
  assert.equal(r.exit, 1, "must fail");
  const errItem = r.env.errors.find((e) => e.rule === "HARD-PREVIZ-NAMES-EXIST");
  assert.ok(errItem, "must report HARD-PREVIZ-NAMES-EXIST");
  assert.equal(errItem.code, "HARD_NOT_RUN", "must be HARD_NOT_RUN, not HARD");
  assert.ok(errItem.cause, "must have a cause");
});
