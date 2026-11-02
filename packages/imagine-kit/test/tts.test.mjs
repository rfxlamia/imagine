import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import YAML from "yaml";
import { sha256File } from "../src/hash.mjs";
import { wavInfo } from "../src/media.mjs";
import { approveThrough, cli, cliWith, getManifest, getProject, put, setProject } from "./helpers/fixture.mjs";
import { FAKE_UV, NARRATOR, ttsProject } from "./helpers/tts.mjs";
import { editProject } from "./helpers/edit.mjs";
import { encodeWav } from "./helpers/wav.mjs";

test("PROC-ONE-LINE-PER-WAV, PROC-CAPTION-ORIGINAL, HARD-TTS-EOS: production takes: one WAV per line, manifest entry id = line, seed = seed_base + take, pending listen_status", async () => {
  const p = await ttsProject({ edit: (t) => t.replace("She lit it anyway.", "She lit Skerryvore anyway.") });
  const r = await p.run({}, "tts", "L01,L03");
  assert.equal(r.exit, 0, JSON.stringify(r.env.errors));
  assert.deepEqual(r.env.data.takes.map((t) => [t.line, t.v, t.seed]), [["L01", 1, 1301], ["L03", 1, 1301]]);
  assert.deepEqual(Object.keys(r.env.data.takes[0]), ["line", "v", "seed", "duration_s", "sha256", "params_hash"]);
  const m = getManifest(p.dir).assets.find((a) => a.id === "L03");
  assert.equal(m.kind, "vo");
  assert.equal(m.path, "assets/vo/L03.v1.wav");
  assert.equal(m.text, "She lit Skerryvore anyway.", "captions keep the original text");
  assert.match(m.tts_text, /SKERRY-vor/);
  assert.equal(m.voice, "builtin:george");
  assert.equal(m.listen_status, "pending");
  assert.equal(m.sha256, sha256File(join(p.dir, m.path)));
  const info = wavInfo(readFileSync(join(p.dir, m.path)));
  assert.deepEqual([info.channels, info.bits, info.sample_rate], [1, 16, 24000]);
  assert.equal(m.duration_s, info.duration_s);
  const [call] = p.calls();
  assert.equal(call.request.jobs.length, 2, "one worker process serves the whole request");
  assert.ok(call.argv.includes("pocket-tts[audio]==4.0.1") && call.argv.includes("-I"));
  assert.match(call.request.jobs[1].text, /SKERRY-vor/);
  assert.equal(call.request.jobs[1].seed, 1301);
  assert.equal(call.env_eos, "1", "KPOCKET_TTS_ERROR_WITHOUT_EOS=1 reaches the worker");
});

test("repeated line ids in one invocation produce one plan entry, one take and a real hash", async () => {
  const p = await ttsProject();
  const r = await p.run({}, "tts", "L01,L01");
  assert.equal(r.exit, 0, JSON.stringify(r.env.errors));
  assert.equal(p.calls().length, 1, "one worker request");
  assert.equal(p.calls()[0].request.jobs.length, 1, "one job, not one per duplicate");
  assert.equal(r.env.data.takes.length, 1);
  assert.notEqual(r.env.data.takes[0].sha256, "0".repeat(64), "the reported hash is the committed one, not the placeholder");
  assert.match(r.env.data.takes[0].sha256, /^[0-9a-f]{64}$/);
  assert.equal(getManifest(p.dir).assets.filter((a) => a.id === "L01").length, 1);
  const r2 = await p.run({}, "tts", "L02", "L02");
  assert.equal(r2.exit, 0, JSON.stringify(r2.env.errors));
  assert.equal(p.calls()[1].request.jobs.length, 1, "repeated separate positionals deduplicate too");
  assert.equal(r2.env.data.takes.length, 1);
  assert.notEqual(r2.env.data.takes[0].sha256, "0".repeat(64));
});

test("PROC-RESUME-IDEMPOTENT and PROC-VERSIONS-IMMUTABLE: rerun skips; --redo makes take 2 with seed_base + 2", async () => {
  const p = await ttsProject();
  await p.run({}, "tts", "L01");
  const sha = sha256File(join(p.dir, "assets/vo/L01.v1.wav"));
  const again = await p.run({}, "tts", "L01");
  assert.equal(again.exit, 0);
  assert.equal(p.calls().length, 1);
  assert.equal(again.env.data.takes[0].sha256, sha);
  assert.equal((await p.run({}, "tts", "L01", "--redo", "L01")).exit, 2);
  const redo = await p.run({}, "tts", "L01", "--redo", "L01", "--note", "too fast");
  assert.deepEqual([redo.env.data.takes[0].v, redo.env.data.takes[0].seed], [2, 1302]);
  assert.equal(sha256File(join(p.dir, "assets/vo/L01.v1.wav")), sha);
  assert.equal(getManifest(p.dir).assets.find((a) => a.v === 2).note, "too fast");
});

test("production TTS creates a new take when the approved voice cast changes", async () => {
  const p = await ttsProject();
  await p.run({}, "tts", "L01");
  await approveThrough(p.cwd, "G4");
  await cli(p.cwd, "gate", "G5a", "approve", "--quote", "voice take approved");
  const bible = readFileSync(join(p.dir, "bible.yaml"), "utf8");
  put(p.dir, "bible.yaml", bible.replace("source: builtin:george", "source: builtin:jane"));
  await cli(p.cwd, "gate", "G2", "approve", "--quote", "cast changed and reviewed");

  const status = await cli(p.cwd, "status");
  assert.equal(status.env.data.gates.G5a.state, "reopened", "the old take approval must stale with its cast source");
  const changed = await p.run({}, "tts", "L01");
  assert.equal(changed.exit, 0, JSON.stringify(changed.env.errors));
  assert.deepEqual([changed.env.data.takes[0].v, changed.env.data.takes[0].seed], [2, 1302]);
  assert.equal(p.calls().length, 2, "changed effective voice parameters regenerate the take");
});

test("production TTS creates a new take when the approved script line changes", async () => {
  const p = await ttsProject();
  await p.run({}, "tts", "L01");
  await approveThrough(p.cwd, "G4");
  await cli(p.cwd, "gate", "G5a", "approve", "--quote", "voice take approved");
  const narration = readFileSync(join(p.dir, "script/narration.md"), "utf8");
  put(p.dir, "script/narration.md", narration.replace("Every night for forty years, Mara climbed the stairs and lit the lamp.", "Every night for forty years, Mara carefully climbed the stairs and lit the lamp."));
  await cli(p.cwd, "gate", "G1", "approve", "--quote", "script line changed and reviewed");

  const status = await cli(p.cwd, "status");
  assert.equal(status.env.data.gates.G5a.state, "reopened", "the old take approval must stale with its script source");
  const changed = await p.run({}, "tts", "L01");
  assert.equal(changed.exit, 0, JSON.stringify(changed.env.errors));
  assert.equal(changed.env.data.takes[0].v, 2);
  assert.equal(p.calls().length, 2, "changed effective TTS text regenerates the take");
});

test("concurrent production TTS requests isolate worker outputs and report the committed hash", async () => {
  const p = await ttsProject();
  const barrier = join(mkdtempSync(join(tmpdir(), "imagine-tts-barrier-")), "arrivals");
  const [first, second] = await Promise.all([
    p.run({ FAKE_UV_BARRIER: barrier }, "tts", "L01"),
    p.run({ FAKE_UV_BARRIER: barrier }, "tts", "L01"),
  ]);
  assert.equal(first.exit, 0, JSON.stringify(first.env.errors));
  assert.equal(second.exit, 0, JSON.stringify(second.env.errors));
  const calls = p.calls();
  assert.equal(calls.length, 2);
  const outputs = calls.map((call) => call.request.jobs[0].out);
  assert.notEqual(outputs[0], outputs[1], "concurrent workers must not share the versioned WAV path");
  assert.equal(getManifest(p.dir).assets.filter((a) => a.id === "L01").length, 1);
  assert.equal(first.env.data.takes[0].sha256, second.env.data.takes[0].sha256, "the losing invocation reports the committed asset hash");
  assert.equal(first.env.data.takes[0].sha256, getManifest(p.dir).assets.find((a) => a.id === "L01").sha256);
});

test("legacy approved TTS records without take provenance fail closed", async () => {
  const p = await ttsProject();
  await p.run({}, "tts", "L01");
  await approveThrough(p.cwd, "G4");
  await cli(p.cwd, "gate", "G5a", "approve", "--quote", "take approved");
  setProject(p.dir, (project) => { delete project.items["asset:L01.v1"].inputs["tts:take:L01.v1"]; });
  const status = await cli(p.cwd, "status");
  assert.equal(status.env.data.gates.G5a.state, "reopened");
  assert.equal(status.env.data.items.find((item) => item.id === "asset:L01.v1").status, "stale");
  assert.ok(getProject(p.dir).items["asset:L01.v1"]);
});

test("G5a refuses a production take generated from script text that changed before approval", async () => {
  const p = await ttsProject();
  await p.run({}, "tts", "L01");
  await approveThrough(p.cwd, "G4");
  const narration = readFileSync(join(p.dir, "script/narration.md"), "utf8");
  put(p.dir, "script/narration.md", narration.replace("Every night for forty years, Mara climbed the stairs and lit the lamp.", "Every night for forty years, Mara carefully climbed the stairs and lit the lamp."));
  await cli(p.cwd, "gate", "G1", "approve", "--quote", "script edit reviewed");

  const approval = await cli(p.cwd, "gate", "G5a", "approve", "--quote", "old take must not approve");
  assert.equal(approval.exit, 1);
  assert.ok(approval.env.errors.some((e) => /tts:take:L01\.v1/.test(e.message)), JSON.stringify(approval.env.errors));
  assert.equal(getManifest(p.dir).assets.find((a) => a.id === "L01").status, "pending");
});

test("changing a voice file at the same path stales and blocks approval of the old take", async () => {
  const p = await ttsProject();
  const bible = readFileSync(join(p.dir, "bible.yaml"), "utf8").replace("source: builtin:george", "source: file:voices/narrator.wav");
  put(p.dir, "bible.yaml", bible);
  put(p.dir, "voices/narrator.wav", encodeWav(2, { freq: 220 }));
  await cli(p.cwd, "gate", "G2", "approve", "--quote", "file voice selected");
  await p.run({}, "tts", "L01");
  await approveThrough(p.cwd, "G4");
  await cli(p.cwd, "gate", "G5a", "approve", "--quote", "file voice take approved");

  writeFileSync(join(p.dir, "voices/narrator.wav"), encodeWav(2, { freq: 330 }));
  const status = await cli(p.cwd, "status");
  assert.equal(status.env.data.gates.G5a.state, "reopened");
  const approval = await cli(p.cwd, "gate", "G5a", "approve", "--quote", "old file voice must not approve");
  assert.equal(approval.exit, 1);
});

test("changing seed_base after take creation stales G5a and generates the next version with the new seed", async () => {
  const p = await ttsProject();
  await p.run({}, "tts", "L01");
  await approveThrough(p.cwd, "G4");
  await cli(p.cwd, "gate", "G5a", "approve", "--quote", "take approved");
  const bible = readFileSync(join(p.dir, "bible.yaml"), "utf8");
  put(p.dir, "bible.yaml", bible.replace("seed_base: 1300", "seed_base: 1400"));
  await cli(p.cwd, "gate", "G2", "approve", "--quote", "seed changed and reviewed");

  const status = await cli(p.cwd, "status");
  assert.equal(status.env.data.gates.G5a.state, "reopened");
  const changed = await p.run({}, "tts", "L01");
  assert.deepEqual([changed.env.data.takes[0].v, changed.env.data.takes[0].seed], [2, 1402]);
});

test("production take approval works when the bible has no pronunciation section", async () => {
  const p = await ttsProject();
  const bible = readFileSync(join(p.dir, "bible.yaml"), "utf8");
  put(p.dir, "bible.yaml", bible.replace("\npronunciation:\n  - term: Skerryvore\n    say: SKERRY-vor\n", "\n"));
  await cli(p.cwd, "gate", "G2", "approve", "--quote", "bible without lexicon");
  await p.run({}, "tts", "L01");
  await approveThrough(p.cwd, "G4");
  const approval = await cli(p.cwd, "gate", "G5a", "approve", "--quote", "take approved without lexicon");
  assert.equal(approval.exit, 0, JSON.stringify(approval.env.errors));
});

test("a stale production take reopens G5a and the G6 approval that depends on it", async () => {
  const p = await editProject();
  put(p.dir, "bible.yaml", `${readFileSync(join(p.dir, "bible.yaml"), "utf8")}\n${NARRATOR}`);
  await cli(p.cwd, "gate", "G2", "approve", "--quote", "narrator cast added");
  const take = await cliWith(p.cwd, { tools: { uv: [process.execPath, FAKE_UV] } }, "tts", "L01");
  assert.equal(take.exit, 0, JSON.stringify(take.env.errors));
  const g5a = await cli(p.cwd, "gate", "G5a", "approve", "--quote", "production take approved");
  assert.equal(g5a.exit, 0, JSON.stringify(g5a.env.errors));
  const staged = await p.run({}, "stage-shot", "s01");
  assert.equal(staged.exit, 0, JSON.stringify(staged.env.errors));
  p.buildScene("s01");
  const promoted = await p.run({}, "promote-shot", "s01");
  assert.equal(promoted.exit, 0, JSON.stringify(promoted.env.errors));
  const g6 = await cli(p.cwd, "gate", "G6", "approve", "--quote", "edit and production audio approved");
  assert.equal(g6.exit, 0, JSON.stringify(g6.env.errors));

  const narration = readFileSync(join(p.dir, "script/narration.md"), "utf8");
  put(p.dir, "script/narration.md", narration.replace("Every night for forty years, Mara climbed the stairs and lit the lamp.", "Every night for forty years, Mara carefully climbed the stairs and lit the lamp."));
  await cli(p.cwd, "gate", "G1", "approve", "--quote", "script edit reviewed");

  const status = await cli(p.cwd, "status");
  assert.equal(status.env.data.gates.G5a.state, "reopened");
  assert.equal(status.env.data.gates.G6.state, "reopened");
});

test("params_hash changes with the seed and the text, and is stable for the same inputs", async () => {
  const p = await ttsProject();
  const a = (await p.run({}, "tts", "L01")).env.data.takes[0].params_hash;
  const b = (await p.run({}, "tts", "L01", "--redo", "L01", "--note", "x")).env.data.takes[0].params_hash;
  assert.notEqual(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
});

test("PROC-CLOCK-PER-MODE: --scratch writes tmp/scratch-vo and durations.yaml, never the manifest, and needs no cast", async () => {
  const p = await ttsProject({ upTo: "G1" });
  const r = await p.run({}, "tts", "--all", "--scratch");
  assert.equal(r.exit, 0, JSON.stringify(r.env.errors));
  assert.equal(r.env.data.takes.length, 3);
  assert.equal(getManifest(p.dir).assets.length, 0);
  const d = YAML.parse(readFileSync(join(p.dir, "tmp/scratch-vo/durations.yaml"), "utf8"));
  assert.deepEqual(Object.keys(d), ["L01", "L02", "L03"]);
  assert.ok(existsSync(join(p.dir, "tmp/scratch-vo/L02.wav")));
  assert.ok(r.env.advice.some((a) => a.rule === "PROC-SCRATCH-NOT-ASSET"));
});

test("--audition writes one file per voice under tmp/audition", async () => {
  const p = await ttsProject();
  const r = await p.run({}, "tts", "--audition", "--voices", "eve,george,alba", "--line", "L02");
  assert.equal(r.exit, 0, JSON.stringify(r.env.errors));
  assert.equal(r.env.data.takes.length, 3);
  for (const v of ["eve", "george", "alba"]) assert.ok(existsSync(join(p.dir, `tmp/audition/narrator-${v}.wav`)));
  assert.equal(getManifest(p.dir).assets.length, 0);
  assert.equal((await p.run({}, "tts", "--audition", "--voices", "eve")).exit, 2);
});

test("production needs G2 and a cast voice; a missing cast voice is HARD", async () => {
  const early = await ttsProject({ upTo: "G1" });
  const r = await early.run({}, "tts", "L01");
  assert.equal(r.exit, 1);
  assert.equal(r.env.errors[0].rule, "HARD-GATES-RECORDED");
  const p = await ttsProject();
  put(p.dir, "bible.yaml", readFileSync(join(p.dir, "bible.yaml"), "utf8").replace("narrator:", "narratorx:"));
  const g2 = await cli(p.cwd, "gate", "G2", "approve", "--quote", "again");
  assert.equal(g2.exit, 0, JSON.stringify(g2.env.errors));
  const nocast = await p.run({}, "tts", "L01");
  assert.equal(nocast.exit, 1);
  assert.equal(nocast.env.errors[0].rule, "HARD-ENTITIES-EXIST");
});

test("PROC-CLOCK-PER-MODE: tts is for narrated projects only; unknown lines are usage errors", async () => {
  const p = await ttsProject();
  assert.equal((await p.run({}, "tts", "L99")).exit, 2);
  assert.equal((await p.run({}, "tts")).exit, 2);
  const { makeProject } = await import("./helpers/fixture.mjs");
  const text = await makeProject({ mode: "text-led" });
  const { cliWith } = await import("./helpers/fixture.mjs");
  assert.equal((await cliWith(text.cwd, {}, "tts", "--all")).exit, 2);
});

test("a failing, short or malformed worker is BLOCKED and leaves no asset behind", async () => {
  for (const mode of ["fail", "short", "badwav", "noresults", "badwav-second"]) {
    const p = await ttsProject();
    const r = await p.run({ FAKE_UV_MODE: mode }, "tts", "L01,L02");
    assert.equal(r.exit, 3, `${mode}: ${JSON.stringify(r.env.errors)}`);
    assert.equal(r.env.code, "BLOCKED");
    assert.equal(getManifest(p.dir).assets.length, 0);
  }
  const p = await ttsProject();
  const { cliWith } = await import("./helpers/fixture.mjs");
  const none = await cliWith(p.cwd, { tools: { uv: ["/nonexistent/uv"] } }, "tts", "L01");
  assert.equal(none.exit, 3);
});

test("a worker exiting 0 with { ok: true } but no results returns BLOCKED and writes no asset", async () => {
  const p = await ttsProject();
  const r = await p.run({ FAKE_UV_MODE: "noresults" }, "tts", "L01");
  assert.equal(r.exit, 3, JSON.stringify(r.env.errors));
  assert.equal(r.env.code, "BLOCKED");
  assert.equal(getManifest(p.dir).assets.length, 0);
});

test("a worker returning success with valid first WAV and malformed second WAV returns BLOCKED and leaves manifest with neither asset", async () => {
  const p = await ttsProject();
  const r = await p.run({ FAKE_UV_MODE: "badwav-second" }, "tts", "L01,L02");
  assert.equal(r.exit, 3, JSON.stringify(r.env.errors));
  assert.equal(r.env.code, "BLOCKED");
  assert.equal(getManifest(p.dir).assets.length, 0);
});

test("HARD-HAS-VOICE-CLONING: a file voice outside the project or missing is HARD; Indonesian needs a file voice", async () => {
  const p = await ttsProject();
  put(p.dir, "bible.yaml", readFileSync(join(p.dir, "bible.yaml"), "utf8").replace("source: builtin:george", "source: file:voices/narrator.wav"));
  assert.equal((await cli(p.cwd, "gate", "G2", "approve", "--scope", "narrator", "--quote", "ok")).exit, 0);
  const missing = await p.run({}, "tts", "L01");
  assert.equal(missing.exit, 1);
  assert.match(missing.env.errors[0].message, /does not exist/);
  const { encodeWav } = await import("./helpers/wav.mjs");
  const { writeFileSync, mkdirSync } = await import("node:fs");
  mkdirSync(join(p.dir, "voices"), { recursive: true });
  writeFileSync(join(p.dir, "voices/narrator.wav"), encodeWav(2));
  const ok = await p.run({}, "tts", "L01");
  assert.equal(ok.exit, 0, JSON.stringify(ok.env.errors));
  assert.equal(p.calls().at(-1).request.jobs[0].voice_is_file, true);
});

test("Finding A: symlink escapes at tmp, subdirectories, and leaves fail closed with HARD-ASSETS-APPROVED without calling worker or mutating external files", async () => {
  // Case 1: tmp is a symlink to an external directory
  {
    const p = await ttsProject({ upTo: "G1" });
    const outside = mkdtempSync(join(tmpdir(), "imagine-tts-outside-tmp-"));
    const sentinel = join(outside, "sentinel.txt");
    writeFileSync(sentinel, "original-sentinel");
    rmSync(join(p.dir, "tmp"), { recursive: true, force: true });
    symlinkSync(outside, join(p.dir, "tmp"));

    const r = await p.run({}, "tts", "--all", "--scratch");
    assert.equal(r.exit, 1);
    assert.ok(r.env.errors.some((e) => e.rule === "HARD-ASSETS-APPROVED"));
    assert.equal(p.calls().length, 0, "fake worker must not be called");
    assert.equal(readFileSync(sentinel, "utf8"), "original-sentinel", "external sentinel must not be mutated");
    assert.equal(existsSync(join(outside, "scratch-vo")), false, "outside scratch-vo directory must not be created");
  }

  // Case 2a: tmp/scratch-vo symlink escape
  {
    const p = await ttsProject({ upTo: "G1" });
    const outside = mkdtempSync(join(tmpdir(), "imagine-tts-outside-scratch-"));
    const sentinel = join(outside, "sentinel.txt");
    writeFileSync(sentinel, "original-sentinel");
    mkdirSync(join(p.dir, "tmp"), { recursive: true });
    rmSync(join(p.dir, "tmp", "scratch-vo"), { recursive: true, force: true });
    symlinkSync(outside, join(p.dir, "tmp", "scratch-vo"));

    const r = await p.run({}, "tts", "--scratch", "L01");
    assert.equal(r.exit, 1);
    assert.ok(r.env.errors.some((e) => e.rule === "HARD-ASSETS-APPROVED"));
    assert.equal(p.calls().length, 0, "fake worker must not be called");
    assert.equal(readFileSync(sentinel, "utf8"), "original-sentinel", "external sentinel must not be mutated");
    assert.equal(existsSync(join(outside, "L01.wav")), false);
    assert.equal(existsSync(join(outside, "durations.yaml")), false);
  }

  // Case 2b: tmp/audition symlink escape
  {
    const p = await ttsProject();
    const outside = mkdtempSync(join(tmpdir(), "imagine-tts-outside-audition-"));
    const sentinel = join(outside, "sentinel.txt");
    writeFileSync(sentinel, "original-sentinel");
    mkdirSync(join(p.dir, "tmp"), { recursive: true });
    rmSync(join(p.dir, "tmp", "audition"), { recursive: true, force: true });
    symlinkSync(outside, join(p.dir, "tmp", "audition"));

    const r = await p.run({}, "tts", "--audition", "--voices", "eve", "--line", "L01");
    assert.equal(r.exit, 1);
    assert.ok(r.env.errors.some((e) => e.rule === "HARD-ASSETS-APPROVED"));
    assert.equal(p.calls().length, 0, "fake worker must not be called");
    assert.equal(readFileSync(sentinel, "utf8"), "original-sentinel", "external sentinel must not be mutated");
    assert.equal(existsSync(join(outside, "narrator-eve.wav")), false);
  }

  // Case 2c: tmp/tts symlink escape
  {
    const p = await ttsProject();
    const outside = mkdtempSync(join(tmpdir(), "imagine-tts-outside-tts-"));
    const sentinel = join(outside, "sentinel.txt");
    writeFileSync(sentinel, "original-sentinel");
    mkdirSync(join(p.dir, "tmp"), { recursive: true });
    rmSync(join(p.dir, "tmp", "tts"), { recursive: true, force: true });
    symlinkSync(outside, join(p.dir, "tmp", "tts"));

    const r = await p.run({}, "tts", "L01");
    assert.equal(r.exit, 1);
    assert.ok(r.env.errors.some((e) => e.rule === "HARD-ASSETS-APPROVED"));
    assert.equal(p.calls().length, 0, "fake worker must not be called");
    assert.equal(readFileSync(sentinel, "utf8"), "original-sentinel", "external sentinel must not be mutated");
    assert.equal(existsSync(join(outside, "L01.v1.wav")), false);
  }

  // Case 3a: tmp/scratch-vo/durations.yaml leaf symlink escape
  {
    const p = await ttsProject({ upTo: "G1" });
    mkdirSync(join(p.dir, "tmp", "scratch-vo"), { recursive: true });
    const outside = mkdtempSync(join(tmpdir(), "imagine-tts-outside-dur-leaf-"));
    const sentinel = join(outside, "sentinel.yaml");
    writeFileSync(sentinel, "safe: original");
    rmSync(join(p.dir, "tmp", "scratch-vo", "durations.yaml"), { force: true });
    symlinkSync(sentinel, join(p.dir, "tmp", "scratch-vo", "durations.yaml"));

    const r = await p.run({}, "tts", "--scratch", "L01");
    assert.equal(r.exit, 1);
    assert.ok(r.env.errors.some((e) => e.rule === "HARD-ASSETS-APPROVED"));
    assert.equal(p.calls().length, 0, "fake worker must not be called when durations destination escapes");
    assert.equal(readFileSync(sentinel, "utf8"), "safe: original", "sentinel must remain untouched");
  }

  // Case 3b: tmp/scratch-vo/L01.wav leaf symlink escape
  {
    const p = await ttsProject({ upTo: "G1" });
    mkdirSync(join(p.dir, "tmp", "scratch-vo"), { recursive: true });
    const outside = mkdtempSync(join(tmpdir(), "imagine-tts-outside-leaf-"));
    const sentinel = join(outside, "sentinel.wav");
    writeFileSync(sentinel, "original wav sentinel");
    rmSync(join(p.dir, "tmp", "scratch-vo", "L01.wav"), { force: true });
    symlinkSync(sentinel, join(p.dir, "tmp", "scratch-vo", "L01.wav"));

    const r = await p.run({}, "tts", "--scratch", "L01");
    assert.equal(r.exit, 1);
    assert.ok(r.env.errors.some((e) => e.rule === "HARD-ASSETS-APPROVED"));
    assert.equal(p.calls().length, 0, "fake worker must not be called");
    assert.equal(readFileSync(sentinel, "utf8"), "original wav sentinel");
  }

  // Case 3c: batch pre-validation: earlier job (L01) is valid, later job (L02) leaf escapes
  {
    const p = await ttsProject({ upTo: "G1" });
    mkdirSync(join(p.dir, "tmp", "scratch-vo"), { recursive: true });
    const outside = mkdtempSync(join(tmpdir(), "imagine-tts-outside-batch-"));
    const sentinel = join(outside, "sentinel.wav");
    writeFileSync(sentinel, "original sentinel");
    rmSync(join(p.dir, "tmp", "scratch-vo", "L02.wav"), { force: true });
    symlinkSync(sentinel, join(p.dir, "tmp", "scratch-vo", "L02.wav"));

    const r = await p.run({}, "tts", "--scratch", "L01,L02");
    assert.equal(r.exit, 1);
    assert.ok(r.env.errors.some((e) => e.rule === "HARD-ASSETS-APPROVED"));
    assert.equal(p.calls().length, 0, "worker must not be called for entire batch if any destination escapes");
    assert.equal(existsSync(join(p.dir, "tmp/scratch-vo/L01.wav")), false, "valid earlier job must not write if later job fails validation");
    assert.equal(readFileSync(sentinel, "utf8"), "original sentinel");
  }

  // Case 3d: audition leaf symlink escape
  {
    const p = await ttsProject();
    mkdirSync(join(p.dir, "tmp", "audition"), { recursive: true });
    const outside = mkdtempSync(join(tmpdir(), "imagine-tts-outside-aud-leaf-"));
    const sentinel = join(outside, "sentinel.wav");
    writeFileSync(sentinel, "original sentinel");
    rmSync(join(p.dir, "tmp", "audition", "narrator-eve.wav"), { force: true });
    symlinkSync(sentinel, join(p.dir, "tmp", "audition", "narrator-eve.wav"));

    const r = await p.run({}, "tts", "--audition", "--voices", "eve", "--line", "L01");
    assert.equal(r.exit, 1);
    assert.ok(r.env.errors.some((e) => e.rule === "HARD-ASSETS-APPROVED"));
    assert.equal(p.calls().length, 0, "fake worker must not be called");
    assert.equal(readFileSync(sentinel, "utf8"), "original sentinel");
  }

  // Case 3e: production worker WAV leaf symlink escape
  {
    const p = await ttsProject();
    mkdirSync(join(p.dir, "tmp", "tts"), { recursive: true });
    const outside = mkdtempSync(join(tmpdir(), "imagine-tts-outside-prod-leaf-"));
    const sentinel = join(outside, "sentinel.wav");
    writeFileSync(sentinel, "original sentinel");
    rmSync(join(p.dir, "tmp", "tts", "L01.v1.wav"), { force: true });
    symlinkSync(sentinel, join(p.dir, "tmp", "tts", "L01.v1.wav"));

    const r = await p.run({}, "tts", "L01");
    assert.equal(r.exit, 1);
    assert.ok(r.env.errors.some((e) => e.rule === "HARD-ASSETS-APPROVED"));
    assert.equal(p.calls().length, 0, "fake worker must not be called");
    assert.equal(readFileSync(sentinel, "utf8"), "original sentinel");
  }
});
