// Task 12.1: negative and capability tests per retained Check (Requirements 9.2, 9.6, 9.7, 9.9, 14.1-14.4, 14.6).
// Every retained Check in CHECKPOINTS gets a defective input that must yield `failed`. Checks that need an external
// tool (ffmpeg, hyperframes) are run against the real ffmpeg when present and against the repo's fake npx for lint.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CHECKPOINTS, runCheckpoint } from "../src/checkpoints.mjs";
import { writeEvidence } from "../src/evidence.mjs";
import { recordConsent } from "../src/consent.mjs";
import { err } from "../src/envelope.mjs";
import { createContext } from "../src/sources.mjs";
import { sha256File } from "../src/hash.mjs";
import { asset, getProject, makeProject, NOW, put, seedCanon, seedMinimalStory, setManifest, setProject, shot, writeStory } from "./helpers/fixture.mjs";
import { makeMp4, makePng, hasFfmpeg } from "./helpers/media.mjs";
import { encodeRgbaPng } from "./helpers/png.mjs";
import { COMPOSITION, FAKE_NPX } from "./helpers/edit.mjs";
import { encodeWav } from "./helpers/wav.mjs";

// ------------------------------------------------------------------ fixtures
const NARRATOR = (source) => `narrator:\n  voice:\n    engine: pocket-tts\n    source: ${source}\n`;
async function baseProject({ narrator = "builtin:eve" } = {}) {
  const p = await makeProject();
  seedCanon(p.dir);
  put(p.dir, "bible.yaml", readFileSync(join(p.dir, "bible.yaml"), "utf8") + NARRATOR(narrator));
  await seedMinimalStory(p.dir);
  return p;
}
const restory = (dir, shots) => writeStory(dir, createContext(dir).story.front?.imagine_rev ?? 0, shots);
const UNITS = "[L01, L02, L03]";
const goodShot = (keys = {}) => shot("s01", { scene: "main", duration_est: "13s", voiceover: UNITS, ...keys }, "Main");

function addImg(dir, id, { w = 64, h = 64, req = { w: 64, h: 64 }, path = `assets/img/${id}.v1.png`, bytes, extra = {} } = {}) {
  const file = join(dir, path);
  if (bytes) { mkdirSync(join(file, ".."), { recursive: true }); writeFileSync(file, bytes); } else makePng(file, w, h);
  setManifest(dir, (m) => { m.assets.push(asset(id, "img", 1, { path, sha256: sha256File(file), w, h, required_px: req, status: "approved", ...extra })); });
  return file;
}

const NPX_CTX = (mode = "ok") => ({ tools: { npx: [process.execPath, FAKE_NPX] }, env: { ...process.env, FAKE_NPX_MODE: mode } });
const ROOT = (ids = ["s01"]) => [
  "<!doctype html><html><body>",
  '<div id="root" data-composition-id="root" data-width="1080" data-height="1920" data-start="0" data-duration="13">',
  ...ids.map((id) => `  <div class="scene" data-composition-id="${id}" data-composition-src="compositions/${id}.html" data-start="0" data-duration="13" data-track-index="0"></div>`),
  "</div></body></html>", ""].join("\n");
function addEdit(dir, { index = ROOT(), scene = COMPOSITION("s01") } = {}) {
  put(dir, "edit/index.html", index);
  put(dir, "edit/compositions/s01.html", scene);
}

const run = (dir, id, opts = {}) => runCheckpoint(dir, id, { now: NOW, ...opts });
const resultOf = (r, checkId) => r.checks.find((c) => c.checkId === checkId);
async function assertFails(dir, cp, checkId, opts) {
  const r = await run(dir, cp, opts);
  const c = resultOf(r, checkId);
  assert.equal(c.result, "failed", `${checkId}: ${JSON.stringify(c.errors.map((e) => e.message))}`);
  assert.ok(c.errors.length > 0, `${checkId} must report a finding`);
  assert.equal(r.state, "failed");
  // The failure is persisted as an Evidence_Record, not only returned.
  const ev = getProject(dir).items[r.itemId].evidence.filter((e) => e.checkId === checkId).at(-1);
  assert.equal(ev.result, "failed");
  return { r, c };
}
const assertNotFailed = async (dir, cp, checkId, opts) => {
  const c = resultOf(await run(dir, cp, opts), checkId);
  assert.notEqual(c.result, "failed", `${checkId} control: ${JSON.stringify(c.errors.map((e) => e.message))}`);
  return c;
};

// ------------------------------------------------------------------ Q1
test("Q1 controls: the baseline story fails no Check", async () => {
  const { dir } = await baseProject();
  const r = await run(dir, "Q1");
  for (const c of r.checks) assert.notEqual(c.result, "failed", `${c.checkId}: ${JSON.stringify(c.errors.map((e) => e.message))}`);
});

test("Q1 creative-brief-contract fails for an inverted duration range and for a narrated brief without a language", async () => {
  const a = await baseProject();
  setProject(a.dir, (p) => { p.g0.duration_s = { min: 30, max: 10 }; });
  await assertFails(a.dir, "Q1", "creative-brief-contract");
  const b = await baseProject();
  setProject(b.dir, (p) => { p.g0.language = "  "; });
  await assertFails(b.dir, "Q1", "creative-brief-contract");
});

test("a project.yaml that violates the schema (brief field removed) yields a failed Checkpoint instead of throwing", async () => {
  const { dir } = await baseProject();
  setProject(dir, (p) => { delete p.g0.fps; });
  const r = await run(dir, "Q1");
  assert.equal(r.state, "failed");
  const c = resultOf(r, "creative-brief-contract");
  assert.equal(c.result, "failed");
  assert.ok(c.errors.some((e) => /fps/.test(e.message)), JSON.stringify(c.errors.map((e) => e.message)));
  for (const o of r.checks.filter((x) => x !== c)) assert.equal(o.result, "not_run");
});

test("a project.yaml that cannot be parsed still throws", async () => {
  const { dir } = await baseProject();
  writeFileSync(join(dir, "project.yaml"), "g0: [unclosed\n  : :");
  await assert.rejects(run(dir, "Q1"));
});

test("a manifest with a blank licence records failed audio-licence evidence", async () => {
  const { dir } = await baseProject();
  setManifest(dir, (m) => { m.assets.push(asset("song", "music", 1, { path: "assets/music/song.v1.wav", sha256: "a".repeat(64), license: "", source: "x", credit: "y", status: "approved" })); });
  const r = await run(dir, "Q2");
  assert.equal(r.state, "failed");
  const c = resultOf(r, "audio-licence");
  assert.equal(c.result, "failed");
  assert.ok(c.errors.length > 0);
  const ev = getProject(dir).items[r.itemId].evidence.filter((e) => e.checkId === "audio-licence").at(-1);
  assert.equal(ev.result, "failed");
});

test("Q1 script-unit-coverage fails when a script unit is not placed or an unknown unit is placed", async () => {
  const { dir } = await baseProject();
  await restory(dir, [goodShot({ voiceover: "[L01, L02]" })]);
  await assertFails(dir, "Q1", "script-unit-coverage");
});

test("Q1 duration-sum fails when the shots exceed the brief maximum and proposes a cut list", async () => {
  const { dir } = await baseProject();
  await restory(dir, [goodShot({ duration_est: "60s" })]);
  const { c } = await assertFails(dir, "Q1", "duration-sum");
  assert.equal(c.proposal.applied, false);
});

test("Q1 vo-no-overlap fails when two voice-over lines overlap", async () => {
  const { dir } = await baseProject();
  await restory(dir, [goodShot({ duration: "13s", voiceover: "[L01, L02@1, L03@8]" })]);
  setManifest(dir, (m) => {
    for (const [line, secs] of Object.entries({ L01: 5, L02: 3, L03: 2 })) m.assets.push(asset(line, "vo", 1, { line, duration_s: secs, status: "approved" }));
  });
  await assertFails(dir, "Q1", "vo-no-overlap");
});

test("Q1 entities-exist fails when a shot names a character or location missing from the bible", async () => {
  const a = await baseProject();
  await restory(a.dir, [goodShot({ characters: "[ghost]" })]);
  await assertFails(a.dir, "Q1", "entities-exist");
  const b = await baseProject();
  await restory(b.dir, [goodShot({ location: "nowhere" })]);
  await assertFails(b.dir, "Q1", "entities-exist");
});

test("Q1 style-consistency fails when the bible references a style anchor that style.md does not define", async () => {
  const { dir } = await baseProject();
  put(dir, "bible.yaml", `${readFileSync(join(dir, "bible.yaml"), "utf8")}style_notes: see style.md#no-such-anchor\n`);
  await assertFails(dir, "Q1", "style-consistency");
});

test("Q1 voice-usage-permission fails for a cloned voice without recorded consent and for a speaker without a voice", async () => {
  const a = await baseProject({ narrator: "file:voices/clone.wav" });
  await assertFails(a.dir, "Q1", "voice-usage-permission");
  const b = await baseProject();
  put(b.dir, "script/narration.md", `${readFileSync(join(b.dir, "script/narration.md"), "utf8")}L04 [stranger]: Who goes there.\n`);
  await restory(b.dir, [goodShot({ voiceover: "[L01, L02, L03, L04]" })]);
  await assertFails(b.dir, "Q1", "voice-usage-permission");
});

test("Q1 plan-validation fails on a story error no dedicated Check covers (beat outside the shot)", async () => {
  const { dir } = await baseProject();
  await restory(dir, [goodShot({ duration: "13s", beats: "[30s]" })]);
  await assertFails(dir, "Q1", "plan-validation");
});

test("Q1 defective fixture returns failed", async () => {
  const { dir } = await baseProject();
  writeFileSync(join(dir, "STORY.md"), readFileSync(join(dir, "STORY.md"), "utf8").replace(/L01/g, "L09"));
  const r = await run(dir, "Q1");
  assert.equal(r.state, "failed");
});

// ------------------------------------------------------------------ Q2
test("Q2 controls: a well-formed raster fails no image Check", async () => {
  const { dir } = await baseProject();
  addImg(dir, "bg");
  for (const id of ["image-integrity", "asset-ref-exists", "raster-quality-floor"]) await assertNotFailed(dir, "Q2", id);
});

test("Q2 image-integrity fails for a missing file, a corrupt PNG, wrong dimensions and a changed hash", async () => {
  const missing = await baseProject();
  addImg(missing.dir, "bg");
  setManifest(missing.dir, (m) => { m.assets[0].path = "assets/img/gone.v1.png"; });
  await assertFails(missing.dir, "Q2", "image-integrity");

  const corrupt = await baseProject();
  addImg(corrupt.dir, "bg", { bytes: Buffer.from("this is not a png at all") });
  await assertFails(corrupt.dir, "Q2", "image-integrity");

  const dims = await baseProject();
  addImg(dims.dir, "bg");
  setManifest(dims.dir, (m) => { m.assets[0].w = 128; });
  await assertFails(dims.dir, "Q2", "image-integrity");

  const hash = await baseProject();
  const file = addImg(hash.dir, "bg");
  makePng(file, 64, 64, (x, y) => (x + y) & 255); // same size, different bytes
  await assertFails(hash.dir, "Q2", "image-integrity");
});

test("Q2 alpha-cutout-integrity fails for an opaque raster that declares transparent intent", { skip: !hasFfmpeg && "ffmpeg is not installed (the Check decodes pixels through ffmpeg)" }, async () => {
  const { dir } = await baseProject();
  const bytes = encodeRgbaPng(64, 64, (x, y) => [x * 4, y * 4, 128, 255]);
  addImg(dir, "hero", { path: "assets/img/figure/hero.v1.png", bytes });
  await assertFails(dir, "Q2", "alpha-cutout-integrity");
});

test("Q2 alpha-cutout-integrity fails for a cutout whose alpha is empty (injected pixel reader keeps the test off ffmpeg)", async () => {
  const { dir } = await baseProject();
  addImg(dir, "hero", { path: "assets/img/figure/hero.v1.png", bytes: encodeRgbaPng(64, 64, () => [0, 0, 0, 0]) });
  const readRgba = async (_p, w, h) => new Uint8Array(w * h * 4); // fully transparent decode of that file
  await assertFails(dir, "Q2", "alpha-cutout-integrity", { readRgba });
});

test("Q2 asset-ref-exists fails when an asset references an id with no live version", async () => {
  const { dir } = await baseProject();
  addImg(dir, "bg", { extra: { refs: ["ghost"] } });
  await assertFails(dir, "Q2", "asset-ref-exists");
});

test("Q2 vo-coverage-and-duration fails when a voice line runs far beyond its planned shot", async () => {
  const { dir } = await baseProject();
  setManifest(dir, (m) => { m.assets.push(asset("L01", "vo", 1, { line: "L01", duration_s: 40, status: "approved" })); });
  await assertFails(dir, "Q2", "vo-coverage-and-duration");
});

test("Q2 audio-licence fails for music missing license, source or credit", async () => {
  for (const missing of ["license", "source", "credit"]) {
    const { dir } = await baseProject();
    writeFileSync(join(dir, "assets/music.v1.wav"), encodeWav(1));
    setManifest(dir, (m) => {
      m.assets.push(asset("bed", "music", 1, { path: "assets/music.v1.wav", sha256: sha256File(join(dir, "assets/music.v1.wav")), status: "approved",
        license: "CC-BY-4.0", source: "https://example.org/bed", credit: "Bed by Example", [missing]: "   " }));
    });
    await assertFails(dir, "Q2", "audio-licence");
  }
});

test("Q3 loudness-mix fails for a mix far from -16 LUFS", { skip: !hasFfmpeg && "ffmpeg is not installed (loudness is measured through ffmpeg)" }, async () => {
  const { dir } = await baseProject();
  const mix = makeMp4(join(mkdtempSync(join(tmpdir(), "mix-")), "quiet.mp4"), { seconds: 3, volume: 0.2 });
  await assertFails(dir, "Q3", "loudness-mix", { mix });
});

test("Q2 visual-continuity fails when a capable evaluator reports an inconsistency", async () => {
  const { dir } = await baseProject();
  const evaluators = { "visual-continuity": async () => ({ evaluator: "continuity-reviewer", capabilities: ["image-inspection"],
    errors: [err("DAG-STYLE-ANCHOR", "HARD", "s01,s02", "hair colour differs between s01 and s02")], outputRefs: [] }) };
  await assertFails(dir, "Q2", "visual-continuity", { evaluators });
});

test("Q2 raster-quality-floor fails below the 0.75 floor and without a raster budget", async () => {
  const low = await baseProject();
  addImg(low.dir, "bg", { w: 64, h: 64, req: { w: 256, h: 256 } });
  await assertFails(low.dir, "Q2", "raster-quality-floor");
  const nobudget = await baseProject();
  addImg(nobudget.dir, "bg");
  setManifest(nobudget.dir, (m) => { delete m.assets[0].required_px; });
  await assertFails(nobudget.dir, "Q2", "raster-quality-floor");
});

test("Q2 defective fixture returns failed", async () => {
  const { dir } = await baseProject();
  addImg(dir, "bg", { w: 64, h: 64, req: { w: 512, h: 512 } });
  assert.equal((await run(dir, "Q2")).state, "failed");
});

// ------------------------------------------------------------------ Q3
test("Q3 controls: a clean edit/ fails no composition Check", async () => {
  const { dir } = await baseProject();
  addEdit(dir);
  for (const id of ["scene-lint", "motion-assertions"]) await assertNotFailed(dir, "Q3", id, { ctx: NPX_CTX("ok") });
});

test("Q3 scene-lint fails for a static scene defect and for a lint error from hyperframes", async () => {
  const stat = await baseProject();
  addEdit(stat.dir, { scene: COMPOSITION("s01").replace('tl.fromTo("#a",{opacity:0},{opacity:1,duration:1},0)', 'tl.from("#a",{opacity:0})') });
  await assertFails(stat.dir, "Q3", "scene-lint", { ctx: NPX_CTX("ok") });
  const lint = await baseProject();
  addEdit(lint.dir);
  await assertFails(lint.dir, "Q3", "scene-lint", { ctx: NPX_CTX("lint-error") });
});

test("Q3 motion-assertions is not_run without a root composition, and fails for a bad scene host and invalid assertions", async () => {
  const noRoot = await baseProject();
  put(noRoot.dir, "edit/compositions/s01.html", COMPOSITION("s01"));
  assert.equal(resultOf(await run(noRoot.dir, "Q3", { ctx: NPX_CTX("ok") }), "motion-assertions").result, "not_run");
  const host = await baseProject();
  addEdit(host.dir, { index: ROOT().replace('class="scene"', 'class="panel"') });
  await assertFails(host.dir, "Q3", "motion-assertions", { ctx: NPX_CTX("ok") });
  const asserts = await baseProject();
  addEdit(asserts.dir);
  put(asserts.dir, "edit/index.motion.json", JSON.stringify({ assertions: [{ kind: "appearsBy", selector: "", bySec: -1 }] }));
  await assertFails(asserts.dir, "Q3", "motion-assertions", { ctx: NPX_CTX("ok") });
});

test("Q3 mp4-technical fails for an MP4 whose size differs from the brief", { skip: !hasFfmpeg && "ffmpeg/ffprobe not installed" }, async () => {
  const { dir } = await baseProject();
  const mp4 = makeMp4(join(mkdtempSync(join(tmpdir(), "mp4-")), "small.mp4"), { w: 640, h: 360, seconds: 2 });
  await assertFails(dir, "Q3", "mp4-technical", { mp4 });
});

test("Q3 visual-review fails when a capable evaluator reports a finding", async () => {
  const { dir } = await baseProject();
  const evaluators = { "visual-review": async () => ({ evaluator: "visual-review", capabilities: ["image-inspection"],
    errors: [err("HARD-FPS-SIZE", "HARD", "s01", "text is clipped at the frame edge in s01")], outputRefs: [] }) };
  await assertFails(dir, "Q3", "visual-review", { evaluators });
});

test("Q3 audio-mix-review fails for an MP4 whose mix is far from -16 LUFS", { skip: !hasFfmpeg && "ffmpeg is not installed" }, async () => {
  const { dir } = await baseProject();
  const mp4 = makeMp4(join(mkdtempSync(join(tmpdir(), "mp4-")), "quiet.mp4"), { seconds: 3, volume: 0.2 });
  await assertFails(dir, "Q3", "audio-mix-review", { mp4 });
});

test("Q3 defective fixture returns failed", async () => {
  const { dir } = await baseProject();
  addEdit(dir);
  const r = await run(dir, "Q3", { ctx: NPX_CTX("lint-error") });
  assert.equal(r.state, "failed");
});

// ------------------------------------------------------------------ not_run without external tools
test("without hyperframes, mp4, mix or an evaluator the dependent Checks are not_run and Q3 is never passed", async () => {
  const { dir } = await baseProject();
  addEdit(dir);
  const r = await run(dir, "Q3", { ctx: { tools: { npx: ["/nonexistent/imagine-npx"] }, env: process.env } });
  for (const id of ["scene-lint", "mp4-technical", "visual-review", "audio-mix-review"]) assert.equal(resultOf(r, id).result, "not_run", id);
  assert.notEqual(r.state, "passed");
  assert.deepEqual(resultOf(r, "visual-review").unevaluated, ["visual-review"]);
});

// ------------------------------------------------------------------ capability gating
test("writeEvidence forces not_run for every Check when the evaluator lacks a required capability", async () => {
  const { dir } = await baseProject();
  for (const cp of Object.values(CHECKPOINTS)) {
    for (const check of cp.checks) {
      const w = writeEvidence(dir, { itemId: `checkpoint:${cp.id}`, checkId: check.id, evaluator: "blind", evaluatorCapabilities: ["unrelated"], requires: check.requires,
        ruleVersion: check.ruleVersion, inputHashes: {}, outputRefs: [], result: "passed", now: NOW });
      assert.equal(w.record.result, "not_run", check.id);
      assert.equal(w.errors[0].rule, "EVALUATOR-CAPABILITY", check.id);
    }
  }
  const stored = Object.values(getProject(dir).items).flatMap((i) => i.evidence ?? []);
  assert.ok(stored.length > 0 && stored.every((e) => e.result !== "passed"));
});

test("judged Checks reject a passing verdict from an evaluator that cannot inspect images", async () => {
  const { dir } = await baseProject();
  const blind = async () => ({ result: "passed", evaluator: "text-only", capabilities: ["text"] });
  const q2 = await run(dir, "Q2", { evaluators: { "visual-continuity": blind } });
  const q3 = await run(dir, "Q3", { evaluators: { "visual-review": blind } });
  assert.equal(resultOf(q2, "visual-continuity").result, "not_run");
  assert.equal(resultOf(q3, "visual-review").result, "not_run");
  assert.notEqual(q2.state, "passed");
  assert.notEqual(q3.state, "passed");
});

test("a bare 'no findings' response from a capable evaluator is never recorded as passed by the default evaluators", async () => {
  const { dir } = await baseProject();
  const dispatch = async () => ({ findings: [] });
  const r = await run(dir, "Q2", { dispatch });
  assert.notEqual(resultOf(r, "visual-continuity").result, "passed");
});

// ------------------------------------------------------------------ security
test("isolation: a manifest path that escapes the project is rejected by the schema and recorded as failed image-integrity evidence", async () => {
  const outside = mkdtempSync(join(tmpdir(), "outside-"));
  const { dir } = await baseProject();
  const target = join(outside, "secret.png");
  makePng(target, 64, 64);
  for (const path of ["assets/../../outside.png", target]) {
    setManifest(dir, (m) => { m.assets = [asset("bg", "img", 1, { path, sha256: sha256File(target), w: 64, h: 64, required_px: { w: 64, h: 64 }, status: "approved" })]; });
    const { r, c } = await assertFails(dir, "Q2", "image-integrity");
    assert.equal(r.state, "failed");
  }
});

test("isolation: a symlink inside the project that points outside it fails image-integrity", async () => {
  const outside = mkdtempSync(join(tmpdir(), "outside-"));
  const { dir } = await baseProject();
  const target = join(outside, "secret.png");
  makePng(target, 64, 64);
  mkdirSync(join(dir, "assets/img"), { recursive: true });
  symlinkSync(target, join(dir, "assets/img/link.v1.png"));
  setManifest(dir, (m) => { m.assets.push(asset("link", "img", 1, { path: "assets/img/link.v1.png", sha256: sha256File(target), w: 64, h: 64, required_px: { w: 64, h: 64 }, status: "approved" })); });
  await assertFails(dir, "Q2", "image-integrity");
});

test("isolation: Evidence_Records never record an input outside the project", async () => {
  const { dir } = await baseProject();
  addImg(dir, "bg");
  const r = await run(dir, "Q2");
  for (const rec of getProject(dir).items[r.itemId].evidence) {
    for (const ref of rec.outputRefs) assert.ok(!ref.startsWith("..") || ref.startsWith("/"), ref);
    for (const k of Object.keys(rec.inputHashes)) assert.ok(!k.includes(".."), k);
  }
});

test("provenance: an approved file changed after approval fails and the Evidence_Record names the evaluator and rule version", async () => {
  const { dir } = await baseProject();
  const file = addImg(dir, "bg");
  const before = await run(dir, "Q2");
  assert.notEqual(resultOf(before, "image-integrity").result, "failed");
  writeFileSync(file, readFileSync(file).subarray(0, -1)); // truncate one byte
  const { r } = await assertFails(dir, "Q2", "image-integrity");
  const rec = getProject(dir).items[r.itemId].evidence.filter((e) => e.checkId === "image-integrity").at(-1);
  assert.equal(rec.evaluator, "checkpoints/image-integrity");
  assert.match(rec.ruleVersion, /^HARD-REAL-RASTER@\d+$/);
  assert.ok(rec.evaluatorCapabilities.includes("file-hash"));
});

test("provenance: an Evidence_Record without an evaluator or rule version is refused and nothing is stored", async () => {
  const { dir } = await baseProject();
  const base = { itemId: "checkpoint:Q2", checkId: "image-integrity", evaluatorCapabilities: ["file-hash"], requires: ["file-hash"], inputHashes: {}, outputRefs: [], result: "passed", now: NOW };
  for (const drop of ["evaluator", "ruleVersion"]) {
    const w = writeEvidence(dir, { ...base, evaluator: "x", ruleVersion: "R@1", [drop]: "" });
    assert.equal(w.errors[0].rule, "EVIDENCE-INCOMPLETE");
    assert.ok(!w.record);
  }
  assert.ok(!getProject(dir).items?.["checkpoint:Q2"]);
});

test("provenance: a cloned voice with no recorded owner consent fails (a consent_record for another scope does not help)", async () => {
  const { dir } = await baseProject({ narrator: "file:voices/clone.wav" });
  assert.deepEqual(recordConsent(dir, { kind: "material_change", scope: "s01", quote: "yes swap the ending please", now: NOW }).errors, []);
  await assertFails(dir, "Q1", "voice-usage-permission");
});

test("Consent_Record quote validation rejects blank, whitespace, invisible, boilerplate and template quotes for both kinds", async () => {
  const { dir } = await baseProject();
  const bad = ["", "   ", "\u200b\u200d", "approved", "User approved", "the user approves", "auto approved", "<quote>", "{{quote}}", "[user words]", "The agent confirmed the change"];
  for (const kind of ["material_change", "publication"]) {
    for (const quote of bad) {
      const r = recordConsent(dir, { kind, scope: kind === "publication" ? "youtube" : "s01", quote, now: NOW });
      assert.equal(r.errors[0]?.rule, "GATE-QUOTE", JSON.stringify(quote));
    }
  }
  assert.equal((getProject(dir).consents ?? []).length, 0);
  assert.equal(recordConsent(dir, { kind: "publication", scope: "youtube", quote: "ok, publish it to youtube", now: NOW }).errors.length, 0);
  assert.equal(getProject(dir).consents.length, 1);
});

test("Consent_Record rejects an unknown kind, an empty scope and a malformed fileHash", async () => {
  const { dir } = await baseProject();
  const q = "yes go ahead with that";
  assert.equal(recordConsent(dir, { kind: "waiver", scope: "s01", quote: q, now: NOW }).errors[0].rule, "CONSENT-KIND");
  assert.equal(recordConsent(dir, { kind: "material_change", scope: " ", quote: q, now: NOW }).errors[0].rule, "CONSENT-SCOPE");
  assert.equal(recordConsent(dir, { kind: "publication", scope: "youtube", quote: q, fileHash: "abc", now: NOW }).errors[0].rule, "CONSENT-FILEHASH");
  assert.equal((getProject(dir).consents ?? []).length, 0);
});

// ------------------------------------------------------------------ non-waivable checks
async function withConsents(dir) {
  for (const scope of ["s01", "bg", "bed", "checkpoint:Q2", "checkpoint:Q3"]) {
    assert.deepEqual(recordConsent(dir, { kind: "material_change", scope, quote: `yes I accept that for ${scope}, carry on`, now: NOW }).errors, []);
  }
}

test("non-waivable: placeholder text in the root composition fails motion-assertions even with consent on record", async () => {
  const { dir } = await baseProject();
  addEdit(dir, { index: ROOT().replace("<body>", "<body><p>TODO replace this headline</p>") });
  await withConsents(dir);
  const { c } = await assertFails(dir, "Q3", "motion-assertions", { ctx: NPX_CTX("ok") });
  assert.ok(c.errors.some((e) => e.rule === "HARD-NO-PLACEHOLDER"));
});

test("non-waivable: missing audio licence fails audio-licence even with consent on record", async () => {
  const { dir } = await baseProject();
  writeFileSync(join(dir, "assets/music.v1.wav"), encodeWav(1));
  setManifest(dir, (m) => { m.assets.push(asset("bed", "music", 1, { path: "assets/music.v1.wav", sha256: sha256File(join(dir, "assets/music.v1.wav")), status: "approved", license: " ", source: " ", credit: " " })); });
  await withConsents(dir);
  const { c } = await assertFails(dir, "Q2", "audio-licence");
  assert.ok(c.errors.every((e) => e.rule === "HARD-AUDIO-LICENCE"));
});

test("non-waivable: a raster below the quality floor fails raster-quality-floor even with consent on record and a high claimed tier", async () => {
  const { dir } = await baseProject();
  addImg(dir, "bg", { w: 64, h: 64, req: { w: 256, h: 256 }, extra: { tier: "native", q: 1 } });
  await withConsents(dir);
  const { c } = await assertFails(dir, "Q2", "raster-quality-floor");
  assert.ok(c.errors.every((e) => e.rule === "HARD-RASTER-TIER"));
});

test("non-waivable: an evaluator cannot overrule a validator failure by returning passed", async () => {
  const { dir } = await baseProject();
  addImg(dir, "bg", { w: 64, h: 64, req: { w: 256, h: 256 } });
  const evaluators = { "raster-quality-floor": async () => ({ result: "passed", evaluator: "x", capabilities: ["file-hash"] }) };
  await assertFails(dir, "Q2", "raster-quality-floor", { evaluators });
});
