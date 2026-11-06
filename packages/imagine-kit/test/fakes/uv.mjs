#!/usr/bin/env node
// Fake `uv run --with pocket-tts ... python -I tts_worker.py`: follows the worker's JSON protocol and writes real WAV files.
// FAKE_UV_MODE: ok | fail | short | badwav | noresults | badwav-second. Every request is appended to FAKE_UV_LOG.
import { appendFileSync, mkdirSync, readdirSync, readFileSync, watch, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { encodeWav } from "../helpers/wav.mjs";

const request = JSON.parse(readFileSync(0, "utf8"));
const isElevenLabs = process.argv.includes("elevenlabs==2.73.0");
if (process.env.FAKE_UV_LOG) {
  if (isElevenLabs) {
    appendFileSync(process.env.FAKE_UV_LOG, `${JSON.stringify({ argv: process.argv.slice(2), eleven_key_present: Boolean(process.env.ELEVENLABS_API_KEY), request })}\n`);
  } else {
    appendFileSync(process.env.FAKE_UV_LOG, `${JSON.stringify({ argv: process.argv.slice(2), env_eos: process.env.KPOCKET_TTS_ERROR_WITHOUT_EOS ?? null, request })}\n`);
  }
}
const barrier = process.env.FAKE_UV_BARRIER;
if (barrier) {
  mkdirSync(barrier, { recursive: true });
  writeFileSync(join(barrier, `${process.pid}`), "ready");
  await new Promise((resolve, reject) => {
    const reached = () => readdirSync(barrier).length >= 2;
    const watcher = watch(barrier, () => { if (reached()) { watcher.close(); resolve(); } });
    watcher.on("error", (error) => { watcher.close(); reject(error); });
    if (reached()) { watcher.close(); resolve(); }
  });
}
const mode = process.env.FAKE_UV_MODE ?? "ok";
if (mode === "eleven-401") {
  console.log(JSON.stringify({ ok: false, id: request.jobs[0].id, status: 401, error: "HTTP 401: invalid api key " + process.env.ELEVENLABS_API_KEY }));
  process.exit(1);
}
if (mode === "eleven-garbage") {
  process.stderr.write(`oops ${process.env.ELEVENLABS_API_KEY}\n`);
  process.exit(1);
}
if (mode === "eleven-split-key") {
  const key = process.env.ELEVENLABS_API_KEY ?? "dummy_key";
  const prefix = "A".repeat(200);
  const suffix = "B".repeat(280);
  process.stderr.write(`${prefix}${key}${suffix}\n`);
  process.exit(1);
}
if (mode === "fail") {
  console.log(JSON.stringify({ ok: false, id: request.jobs[0].id, error: "RuntimeError: simulated failure" }));
  process.exit(1);
}
if (mode === "noresults") {
  for (const job of request.jobs) {
    mkdirSync(dirname(job.out), { recursive: true });
  }
  console.log(JSON.stringify({ ok: true }));
  process.exit(0);
}
const results = [];
for (let i = 0; i < request.jobs.length; i++) {
  const job = request.jobs[i];
  const seconds = Math.round((0.5 + job.text.split(/\s+/).length * 0.25) * 1000) / 1000;
  mkdirSync(dirname(job.out), { recursive: true });
  const isBad = mode === "badwav" || (mode === "badwav-second" && i === 1);
  writeFileSync(job.out, isBad ? Buffer.from("not a wav") : encodeWav(seconds, { freq: 200 + (job.seed % 200) }));
  results.push({ id: job.id, duration_s: seconds, sample_rate: 24000 });
}
if (isElevenLabs) {
  const fakeTier = process.env.FAKE_ELEVEN_TIER;
  const tier = fakeTier === "none" ? null : (fakeTier ?? "creator");
  console.log(JSON.stringify({ ok: true, tier, results: mode === "short" ? results.slice(1) : results }));
} else {
  console.log(JSON.stringify({ ok: true, results: mode === "short" ? results.slice(1) : results }));
}
