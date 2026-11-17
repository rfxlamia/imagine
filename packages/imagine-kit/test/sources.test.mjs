import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { hashValue, sha256 } from "../src/hash.mjs";
import { parseUnits, bibleLookup, bibleEntities, styleSections, currentAsset, latestAssets, loadVoDurations } from "../src/docs.mjs";
import { createContext, resolveRef, enumerateSources, SUPERSEDED } from "../src/sources.mjs";
import { blockHash } from "../src/story/block.mjs";
import { applyLexicon } from "../src/tts/voices.mjs";
import { asset, cli, makeProject, put, seedCanon, setManifest, setProject, shot, snapshot, writeStory } from "./helpers/fixture.mjs";

test("parseUnits: lines, bullets, mode prefix and duplicates", () => {
  const { units, duplicates } = parseUnits("L01 [narrator]: Hello there.\n- L02: No speaker.\nT01: ignored here\nL01: again\nnoise\n", "L");
  assert.deepEqual(Object.keys(units), ["L01", "L02"]);
  assert.deepEqual(units.L01, { id: "L01", speaker: "narrator", text: "Hello there." });
  assert.equal(units.L02.speaker, null);
  assert.deepEqual(duplicates, ["L01"]);
});

test("bible helpers: lookup by id/term, entities", () => {
  const bible = { characters: [{ id: "mara", hair: "grey" }], world: { period: "1950s" }, pronunciation: [{ term: "Skerryvore", say: "x" }], empty: [], none: {} };
  assert.equal(bibleLookup(bible, "characters.mara.hair"), "grey");
  assert.equal(bibleLookup(bible, "pronunciation.Skerryvore").say, "x");
  assert.equal(bibleLookup(bible, "characters.nobody"), undefined);
  assert.deepEqual(bibleEntities(bible), ["characters.mara", "world", "pronunciation"]);
});

test("styleSections: level-2 anchors only, optional leading #", () => {
  const s = styleSections("# Style\n\n## output\nA\n\n## #camera\nSlow\nmore\n\n### sub\nkept in camera\n\n## Not An Anchor\nx\n");
  assert.deepEqual(Object.keys(s), ["output", "camera"]);
  assert.equal(s.camera, "Slow\nmore\n\n### sub\nkept in camera");
});

test("asset helpers: current skips rejected, latest does not", () => {
  const m = { assets: [asset("a", "img", 1), asset("a", "img", 2, { status: "rejected" }), asset("b", "ref", 1)] };
  assert.equal(currentAsset(m, "a").v, 1);
  assert.equal(latestAssets(m).find((x) => x.id === "a").v, 2);
});

test("resolveRef: g0, unit, bible, style, story", async () => {
  const { dir } = await makeProject();
  seedCanon(dir);
  const ctx = createContext(dir);
  assert.equal(resolveRef(ctx, "g0:format", undefined), hashValue("portrait"));
  assert.equal(resolveRef(ctx, "g0:nope", undefined), null);
  assert.equal(resolveRef(ctx, "unit:L02", undefined), sha256("narrator\nTonight the sea was quiet, and no ship was coming."));
  assert.equal(resolveRef(ctx, "unit:L09", undefined), null);
  assert.equal(resolveRef(ctx, "bible:characters.mara.hair", undefined), hashValue("grey braid"));
  assert.notEqual(resolveRef(ctx, "bible:pronunciation.Skerryvore", undefined), null);
  assert.equal(resolveRef(ctx, "bible:characters.nobody", undefined), null);
  assert.equal(resolveRef(ctx, "style:camera", undefined), sha256("Slow push-ins only."));
  assert.equal(resolveRef(ctx, "style:nope", undefined), null);
  assert.equal(resolveRef(ctx, "story:sha", undefined), sha256(ctx.storyText));
});

test("resolveRef: item-only references are undefined", async () => {
  const { dir } = await makeProject();
  const ctx = createContext(dir);
  for (const ref of ["edit:s01", "render:final", "vo:L01", "g4"]) assert.equal(resolveRef(ctx, ref, undefined), undefined, ref);
});

test("resolveRef: shot blocks", async () => {
  const { dir } = await makeProject();
  const s = shot("s01", { scene: "a", camera: "c" }, "One", "n");
  await writeStory(dir, 1, [s]);
  const ctx = createContext(dir);
  assert.equal(resolveRef(ctx, "shot:s01.storyboard", undefined), blockHash(s, "storyboard"));
  assert.equal(resolveRef(ctx, "shot:s01.previz", undefined), blockHash(s, "previz"));
  assert.equal(resolveRef(ctx, "shot:s09.previz", undefined), null);
});

test("resolveRef: asset versions are current or superseded", async () => {
  const { dir } = await makeProject();
  setManifest(dir, (m) => { m.assets.push(asset("mara-sheet", "ref", 1)); });
  assert.equal(resolveRef(createContext(dir), "asset:mara-sheet.v1", undefined), sha256("mara-sheet.v1"));
  setManifest(dir, (m) => { m.assets.push(asset("mara-sheet", "ref", 2)); });
  assert.equal(resolveRef(createContext(dir), "asset:mara-sheet.v1", undefined), SUPERSEDED);
  assert.equal(resolveRef(createContext(dir), "asset:mara-sheet.v2", undefined), sha256("mara-sheet.v2"));
  setManifest(dir, (m) => { m.assets[1].status = "rejected"; });
  assert.equal(resolveRef(createContext(dir), "asset:mara-sheet.v1", undefined), sha256("mara-sheet.v1"));
  assert.equal(resolveRef(createContext(dir), "asset:mara-sheet.v7", undefined), null);
});

test("resolveRef: clock labels", async () => {
  const { dir } = await makeProject();
  setManifest(dir, (m) => {
    m.assets.push(asset("vo-L02", "vo", 1, { line: "L02" }));
    m.assets.push(asset("music01", "music", 1, { license: "CC0", source: "x", credit: "y" }));
  });
  put(dir, "tmp/scratch-vo/L02.wav", "wav-bytes");
  put(dir, "script/readtime.yaml", "units:\n  T01:\n    words: 2\n    seconds: 1.2\n");
  let ctx = createContext(dir);
  assert.equal(resolveRef(ctx, "clock:L02", "vo.v1:"), `vo.v1:${sha256("vo-L02.v1")}`);
  assert.equal(resolveRef(ctx, "clock:L02", "vo.v2:"), null);   // that version does not exist yet
  assert.equal(resolveRef(ctx, "clock:music01", "music.v1:"), `music.v1:${sha256("music01.v1")}`);
  assert.equal(resolveRef(ctx, "clock:L02", "scratch:"), `scratch:${sha256("wav-bytes")}`);
  assert.equal(resolveRef(ctx, "clock:T01", "readtime:"), `readtime:${hashValue({ words: 2, seconds: 1.2 })}`);
  assert.equal(resolveRef(ctx, "clock:L09", "vo.v1:"), null);
  assert.equal(resolveRef(ctx, "clock:L02", undefined), null);
  setManifest(dir, (m) => { m.assets.push(asset("vo-L02", "vo", 2, { line: "L02" })); });
  ctx = createContext(dir);
  assert.equal(resolveRef(ctx, "clock:L02", "vo.v1:"), `vo.v1:${SUPERSEDED}`);
});

test("loadVoDurations reads estimated entries and lets production takes supersede them", async () => {
  const { dir } = await makeProject();
  put(dir, "tmp/scratch-vo/durations.yaml", `L01: 2\nL02:\n  duration_s: 3\n  estimated: true\n  text_hash: ${"0".repeat(64)}\n  rate_cps: 10\nL03:\n  duration_s: 4\n  estimated: true\n  text_hash: invalid\n  rate_cps: 10\n`);
  const manifest = { assets: [asset("vo-L02", "vo", 1, { line: "L02", duration_s: 8 })] };
  assert.deepEqual(loadVoDurations(dir, manifest), { L01: 2, L02: 8 });
});

test("estimated clock uses valid metadata over a leftover WAV and stales on equal-length text edits", async () => {
  const { dir } = await makeProject();
  seedCanon(dir);
  const initial = createContext(dir);
  const effectiveText = applyLexicon(initial.units.units.L02.text, initial.bible);
  put(dir, "tmp/scratch-vo/L02.wav", "obsolete-wav");
  put(dir, "tmp/scratch-vo/durations.yaml", `L02:\n  duration_s: 3\n  estimated: true\n  text_hash: ${sha256(effectiveText)}\n  rate_cps: 10\n`);
  const before = resolveRef(createContext(dir), "clock:L02", "scratch:");
  assert.ok(before);
  assert.notEqual(before, `scratch:${sha256("obsolete-wav")}`, "estimate metadata must supersede an obsolete WAV");
  const narration = readFileSync(join(dir, "script/narration.md"), "utf8");
  put(dir, "script/narration.md", narration.replace("Tonight the sea was quiet", "Today the sea was quiet"));
  const after = resolveRef(createContext(dir), "clock:L02", "scratch:");
  assert.equal(after, null, "old estimate provenance must not resolve after a same-length text edit");
});

test("estimated scratch fingerprint changes when lexicon, voice rate, or audio mode changes", async () => {
  const { dir } = await makeProject();
  seedCanon(dir);
  const bible = readFileSync(join(dir, "bible.yaml"), "utf8").replace("term: Skerryvore", "term: Tonight").replace("say: SKERRY-vor", "say: Tonight");
  put(dir, "bible.yaml", `${bible}\nnarrator:\n  voice:\n    engine: elevenlabs\n    voice_id: 21m00Tcm4TlvDq8ikWAM\n    model_id: eleven_v4\n    scratch_rate_cps: 10\n`);
  const ctx = createContext(dir);
  const text = applyLexicon(ctx.units.units.L02.text, ctx.bible);
  put(dir, "tmp/scratch-vo/durations.yaml", `L02:\n  duration_s: 3\n  estimated: true\n  text_hash: ${sha256(text)}\n  rate_cps: 10\n`);
  put(dir, "bible.yaml", readFileSync(join(dir, "bible.yaml"), "utf8").replace("scratch_rate_cps: 10", "scratch_rate_cps: 12"));
  const rateChanged = resolveRef(createContext(dir), "clock:L02", "scratch:");
  assert.equal(rateChanged, null, "a changed configured rate invalidates stored estimate provenance");
  const changedBible = readFileSync(join(dir, "bible.yaml"), "utf8").replace("say: Tonight", "say: At night");
  put(dir, "bible.yaml", changedBible);
  assert.equal(resolveRef(createContext(dir), "clock:L02", "scratch:"), null, "a changed lexicon invalidates stored text provenance");
  setProject(dir, (project) => { project.g0.audio_mode = "text-led"; });
  assert.equal(resolveRef(createContext(dir), "clock:L02", "scratch:"), null, "a mode change removes the narrated unit source");
});

test("estimated clock text changes stale downstream planning items", async () => {
  const { cwd, dir } = await makeProject();
  seedCanon(dir);
  const context = createContext(dir);
  const text = applyLexicon(context.units.units.L02.text, context.bible);
  put(dir, "tmp/scratch-vo/L02.wav", "old scratch wav");
  put(dir, "tmp/scratch-vo/durations.yaml", `L02:\n  duration_s: 3\n  estimated: true\n  text_hash: ${sha256(text)}\n  rate_cps: 10\n`);
  await snapshot(dir, "shot:s01.previz", ["clock:L02=scratch"], { status: "proposed" });
  const initial = await cli(cwd, "status", "--item", "shot:s01.previz");
  assert.equal(initial.env.data.items[0].status, "proposed");
  const narration = readFileSync(join(dir, "script/narration.md"), "utf8");
  put(dir, "script/narration.md", narration.replace("Tonight the sea was quiet", "Today the sea was quiet"));
  const stale = await cli(cwd, "status", "--item", "shot:s01.previz");
  assert.equal(stale.env.data.items[0].status, "stale");
});

test("estimated clock rejects stale text hashes and missing scratch artifacts without throwing", async () => {
  const { dir } = await makeProject();
  seedCanon(dir);
  put(dir, "tmp/scratch-vo/durations.yaml", "L02:\n  duration_s: 3\n  estimated: true\n  text_hash: invalid\n  rate_cps: 10\n");
  assert.equal(resolveRef(createContext(dir), "clock:L02", "scratch:"), null);
  const { dir: missingDir } = await makeProject();
  seedCanon(missingDir);
  assert.doesNotThrow(() => resolveRef(createContext(missingDir), "clock:L02", "scratch:"));
  assert.equal(resolveRef(createContext(missingDir), "clock:L02", "scratch:"), null);
});

test("enumerateSources lists the references a dispatch needs", async () => {
  const { dir } = await makeProject();
  seedCanon(dir);
  await writeStory(dir, 1, [shot("s01", { scene: "a" })]);
  setManifest(dir, (m) => { m.assets.push(asset("mara-sheet", "ref", 1)); m.assets.push(asset("vo-L01", "vo", 1, { line: "L01" })); });
  const out = enumerateSources(createContext(dir));
  for (const ref of ["g0:format", "g0:duration_s", "unit:L01", "bible:characters.mara", "bible:world", "style:camera", "story:sha",
    "shot:s01.storyboard", "shot:s01.previz", "shot:s01.fx", "asset:mara-sheet.v1", "clock:L01"]) assert.ok(out[ref], ref);
  assert.equal(out["clock:L01"], `vo.v1:${sha256("vo-L01.v1")}`);
});
