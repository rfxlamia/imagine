#!/usr/bin/env node
// Fake `uv run --with faster-whisper==1.2.1 --with 'av==18.0.0' ... python -I asr_worker.py`.
// FAKE_UV_MODE: ok (prints the JSON in FAKE_UV_REPLY) | fail | garbage. Each request is appended to FAKE_UV_LOG.
// `uv --version` (the preflight probe) always succeeds and is not logged, whatever the mode.
import { appendFileSync, readFileSync } from "node:fs";

if (process.argv[2] === "--version") {
  console.log("uv 0.0.0 (fake)");
  process.exit(0);
}
const raw = readFileSync(0, "utf8");
if (process.env.FAKE_UV_LOG) appendFileSync(process.env.FAKE_UV_LOG, `${JSON.stringify({ argv: process.argv.slice(2), request: raw ? JSON.parse(raw) : null })}\n`);
const mode = process.env.FAKE_UV_MODE ?? "ok";
if (mode === "fail") {
  console.log(JSON.stringify({ ok: false, error: "RuntimeError: simulated ASR failure" }));
  process.exit(1);
}
if (mode === "garbage") {
  console.log("not json");
  process.exit(0);
}
console.log(readFileSync(process.env.FAKE_UV_REPLY, "utf8").trim());
