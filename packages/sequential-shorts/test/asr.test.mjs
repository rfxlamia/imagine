import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyTranscript, transcribe, transcribeSource } from "../src/analyze/asr.mjs";
import { probe } from "../src/probe.mjs";
import { TOOLS, fakeUv, hasFfmpeg, makeVideo, speechWav, tmp, writeAsrReply } from "./helpers/media.mjs";

const uvCtx = (dir, mode = "ok", reply) => ({
  tools: { ...TOOLS, uv: [process.execPath, fakeUv] },
  env: { ...process.env, FAKE_UV_MODE: mode, FAKE_UV_REPLY: reply ?? "", FAKE_UV_LOG: join(dir, "uv.log") },
});
const W = (n, { step = 1, len = 0.8, p = 0.9 } = {}) => Array.from({ length: n }, (_, i) => ({ start: i * step, end: i * step + len, word: ` kata${i}`, probability: p }));

test("classifyTranscript flags each reliability rule", () => {
  assert.equal(classifyTranscript(W(10), { language_probability: 0.9, duration_s: 10 }).status, "ok");
  const sparse = classifyTranscript(W(1), { language_probability: 0.9, duration_s: 10 });
  assert.equal(sparse.status, "unreliable");
  assert.match(sparse.reasons[0], /15 percent/);
  assert.match(classifyTranscript(W(10), { language_probability: 0.3, duration_s: 10 }).reasons.join(), /language probability/);
  assert.match(classifyTranscript(W(10, { p: 0.2 }), { language_probability: 0.9, duration_s: 10 }).reasons.join(), /median word probability/);
  assert.equal(classifyTranscript([], { language_probability: 0.9, duration_s: 10 }).status, "unreliable");
});

test("transcribe normalizes the worker reply and applies the audio offset", async () => {
  const dir = tmp("asr-");
  const reply = writeAsrReply(dir, [...W(10), { start: 10, end: 10.2, word: "  ", probability: 0.9 }]);
  const t = await transcribe(uvCtx(dir, "ok", reply), { wav: "/x.wav", model: "large-v3-turbo", language: "auto", offset_s: 0.5, duration_s: 10.0, source_sha256: "abc" });
  assert.equal(t.status, "ok");
  assert.equal(t.words.length, 10);
  assert.deepEqual(t.words[0], { i: 0, start: 0.5, end: 1.3, word: "kata0", probability: 0.9 });
  assert.equal(t.words[9].start, 9.5);
  assert.equal(t.words[9].end, 10, "word end is clamped to the source duration");
  assert.equal(t.provenance.model.revision, "fake-rev");
  assert.equal(t.provenance.faster_whisper, "1.2.1");
  const log = JSON.parse(readFileSync(join(dir, "uv.log"), "utf8").trim());
  assert.deepEqual(log.argv.slice(0, 8), ["run", "--python", "3.12", "--with", "faster-whisper==1.2.1", "--with", "av==18.0.0", "python"]);
  assert.equal(log.request.language, null);
  assert.equal(log.request.model, "large-v3-turbo");
  assert.equal(log.request.revision, null);
  assert.deepEqual(t.request, { model: "large-v3-turbo", language: "auto", revision: null });
});

test("a pinned model revision reaches the worker and the transcript", async () => {
  const dir = tmp("asr-");
  const t = await transcribe(uvCtx(dir, "ok", writeAsrReply(dir, W(10))), { wav: "/x.wav", model: "large-v3-turbo", language: "id", revision: "41f1a9c", offset_s: 0, duration_s: 10, source_sha256: "s" });
  assert.equal(JSON.parse(readFileSync(join(dir, "uv.log"), "utf8").trim()).request.revision, "41f1a9c");
  assert.equal(t.request.revision, "41f1a9c");
});

test("worker failure and garbage become a failed transcript", async () => {
  const dir = tmp("asr-");
  const failed = await transcribe(uvCtx(dir, "fail"), { wav: "/x.wav", model: "m", language: "id", offset_s: 0, duration_s: 5, source_sha256: "s" });
  assert.equal(failed.status, "failed");
  assert.match(failed.reasons[0], /simulated ASR failure/);
  assert.deepEqual(failed.words, []);
  const garbage = await transcribe(uvCtx(dir, "garbage"), { wav: "/x.wav", model: "m", language: "id", offset_s: 0, duration_s: 5, source_sha256: "s" });
  assert.equal(garbage.status, "failed");
});

test("missing uv is BLOCKED", async () => {
  await assert.rejects(transcribe({ tools: { uv: "/nonexistent/uv" } }, { wav: "/x.wav", model: "m", language: "id", offset_s: 0, duration_s: 5 }), (e) => e.code === "BLOCKED");
});

test("transcribeSource extracts 16 kHz audio and skips the worker without audio", { skip: !hasFfmpeg && "NOT_RUN: ffmpeg not available" }, async () => {
  const dir = tmp("asr-");
  const { words, duration } = speechWav(join(dir, "s.wav"), { sentences: [4, 4] });
  const withAudio = await probe({ tools: TOOLS }, makeVideo(join(dir, "a.mp4"), { seconds: duration, wav: join(dir, "s.wav") }));
  const t = await transcribeSource(uvCtx(dir, "ok", writeAsrReply(dir, words)), withAudio, { workDir: dir, model: "large-v3-turbo", language: "id" });
  assert.equal(t.status, "ok");
  const wav = spawnSync(process.env.SEQ_SHORTS_FFPROBE ?? "ffprobe", ["-v", "error", "-show_entries", "stream=sample_rate,channels", "-of", "csv=p=0", join(dir, "asr-16k.wav")], { encoding: "utf8" });
  assert.equal(wav.stdout.trim(), "16000,1");
  const silent = await probe({ tools: TOOLS }, makeVideo(join(dir, "v.mp4"), { seconds: 2 }));
  const none = await transcribeSource({ tools: { ...TOOLS, uv: "/nonexistent/uv" } }, silent, { workDir: dir, model: "m", language: "auto" });
  assert.equal(none.status, "failed");
  assert.match(none.reasons[0], /no audio stream/);
});

test("asr_worker.py compiles", { skip: spawnSync("python3", ["--version"]).status !== 0 && "NOT_RUN: python3 not available" }, () => {
  const worker = fileURLToPath(new URL("../python/asr_worker.py", import.meta.url));
  const r = spawnSync("python3", ["-I", "-c", `import ast,sys; ast.parse(open(sys.argv[1]).read())`, worker], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
});
