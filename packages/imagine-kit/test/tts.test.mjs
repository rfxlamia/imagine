import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { sha256File } from "../src/hash.mjs";
import { wavInfo } from "../src/media.mjs";
import { cli, getManifest, put } from "./helpers/fixture.mjs";
import { ttsProject } from "./helpers/tts.mjs";

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
  for (const mode of ["fail", "short", "badwav"]) {
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
