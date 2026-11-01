#!/usr/bin/env node
// Fake `codex exec`: records its argv, writes out.png into the -C directory and a rollout log with a revised prompt.
// Behaviour per call comes from FAKE_CODEX_MODES (comma list, last entry repeats): ok | uniform | notpng | fail | nofile.
import { appendFileSync, mkdirSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { encodePng } from "../helpers/png.mjs";

const argv = process.argv.slice(2);
const log = process.env.FAKE_CODEX_LOG;
const calls = log && existsSync(log) ? readFileSync(log, "utf8").split("\n").filter(Boolean).length : 0;
if (log) appendFileSync(log, `${JSON.stringify({ argv, cwd: process.cwd() })}\n`);
const modes = (process.env.FAKE_CODEX_MODES ?? "ok").split(",");
const mode = modes[Math.min(calls, modes.length - 1)];
const [w, h] = (process.env.FAKE_CODEX_SIZE ?? "1536x1024").split("x").map(Number);
const dir = argv[argv.indexOf("-C") + 1];
const sid = randomUUID();
process.stdout.write(`OpenAI Codex v0\n--------\nsession id: ${sid}\n--------\n`);
const sleep = Number(process.env.FAKE_CODEX_SLEEP_MS ?? 0);
if (sleep) await new Promise((r) => setTimeout(r, sleep));
if (mode === "fail") { process.stderr.write("simulated failure\n"); process.exit(1); }
if (mode !== "nofile") {
  const bytes = mode === "notpng" ? Buffer.from("this is not a png, only text") : encodePng(w, h, mode === "uniform" ? () => 128 : undefined);
  writeFileSync(join(dir, "out.png"), bytes);
}
const home = process.env.CODEX_HOME;
if (home) {
  const d = join(home, "sessions", "2026", "11", "01");
  mkdirSync(d, { recursive: true });
  const line = { type: "event_msg", payload: { item: { kind: "image_gen.generation", revisedPrompt: `REVISED: ${argv.at(-1).split("\n")[0]}` } } };
  writeFileSync(join(d, `rollout-2026-11-01T10-00-00-${sid}.jsonl`), `${JSON.stringify({ type: "session_meta" })}\n${JSON.stringify(line)}\n`);
}
