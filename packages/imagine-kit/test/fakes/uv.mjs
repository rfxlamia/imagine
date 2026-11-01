#!/usr/bin/env node
// Fake `uv run --with pocket-tts ... python -I tts_worker.py`: follows the worker's JSON protocol and writes real WAV files.
// FAKE_UV_MODE: ok | fail | short | badwav | noresults | badwav-second. Every request is appended to FAKE_UV_LOG.
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { encodeWav } from "../helpers/wav.mjs";

const request = JSON.parse(readFileSync(0, "utf8"));
if (process.env.FAKE_UV_LOG) appendFileSync(process.env.FAKE_UV_LOG, `${JSON.stringify({ argv: process.argv.slice(2), env_eos: process.env.KPOCKET_TTS_ERROR_WITHOUT_EOS ?? null, request })}\n`);
const mode = process.env.FAKE_UV_MODE ?? "ok";
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
console.log(JSON.stringify({ ok: true, results: mode === "short" ? results.slice(1) : results }));
