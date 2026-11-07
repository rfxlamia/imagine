#!/usr/bin/env node
// Fake `codex exec`: records its argv, writes out.png into the -C directory and a rollout log with a revised prompt.
// Behaviour per call comes from FAKE_CODEX_MODES (comma list, last entry repeats): ok | uniform | notpng | fail | nofile.
import { appendFileSync, copyFileSync, mkdirSync, readFileSync, existsSync, readdirSync, watch, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { encodePng, encodeRgbaPng } from "../helpers/png.mjs";

if (process.argv[2] === "--version") { process.stdout.write("codex-cli 0.0.0-fake\n"); process.exit(0); }

const argv = process.argv.slice(2);
const log = process.env.FAKE_CODEX_LOG;
const calls = log && existsSync(log) ? readFileSync(log, "utf8").split("\n").filter(Boolean).length : 0;
if (log) appendFileSync(log, `${JSON.stringify({ argv, cwd: process.cwd() })}\n`);
const modes = (process.env.FAKE_CODEX_MODES ?? "ok").split(",");
const mode = modes[Math.min(calls, modes.length - 1)];
const [w, h] = (process.env.FAKE_CODEX_SIZE ?? "1536x1024").split("x").map(Number);
const dir = argv[argv.indexOf("-C") + 1];
const sid = randomUUID();
process.stderr.write(`OpenAI Codex v0\n--------\nsession id: ${sid}\n--------\n`);
const barrier = process.env.FAKE_CODEX_BARRIER;
if (barrier) {
  mkdirSync(barrier, { recursive: true });
  writeFileSync(join(barrier, sid), "ready");
  await new Promise((resolve, reject) => {
    const reached = () => readdirSync(barrier).length >= 2;
    const watcher = watch(barrier, () => { if (reached()) { watcher.close(); resolve(); } });
    watcher.on("error", (error) => { watcher.close(); reject(error); });
    if (reached()) { watcher.close(); resolve(); }
  });
}
const sleep = Number(process.env.FAKE_CODEX_SLEEP_MS ?? 0);
if (sleep) await new Promise((r) => setTimeout(r, sleep));
if (mode === "fail") { process.stderr.write("simulated failure\n"); process.exit(1); }
const prompt = argv.at(-1);
const [, cols = "1", rows = "1"] = prompt.match(/grid of (\d+) columns and (\d+) rows/) ?? [];
const isSheet = /CELL 1: /.test(prompt);
const nativePixels = (edge, opaque, dark = false) => {
  const C = Number(cols), R = Number(rows);
  const cw = Math.floor(w / C), ch = Math.floor(h / R);
  // Decided once per cell, not per pixel: a 1200x1200 image has 1.44M pixels and building a RegExp for each would take minutes.
  const live = Array.from({ length: C * R + 1 }, (_, k) => (isSheet
    ? k >= 1 && new RegExp(`CELL ${k}: `).test(prompt) && !new RegExp(`CELL ${k}: leave this cell empty`).test(prompt)
    : k === 1));   // a single (non-sheet) image is one live cell
  return (x, y) => {
    if (opaque) return [((x * 7 + y * 13) ^ (x >> 3)) & 255, 90, 160, 255];
    const k = Math.floor(y / ch) * C + Math.floor(x / cw) + 1;
    if (!live[k]) return [0, 0, 0, 0];
    const lx = x % cw, ly = y % ch;
    const inFigure = edge ? lx < cw * 0.7 && ly >= ch * 0.2 && ly < ch * 0.8 : lx >= cw * 0.3 && lx < cw * 0.7 && ly >= ch * 0.2 && ly < ch * 0.8;
    return inFigure ? (dark ? [0, 0, 0, 252] : [((x * 7 + y * 13) ^ (x >> 3)) & 255, 90, 160, 252]) : [0, 0, 0, 0];
  };
};
if (mode !== "nofile") {
  let bytes;
  if (mode === "notpng") bytes = Buffer.from("this is not a png, only text");
  else if (mode === "native") bytes = encodeRgbaPng(w, h, nativePixels(false, false));
  else if (mode === "native-edge") bytes = encodeRgbaPng(w, h, nativePixels(true, false));
  else if (mode === "native-opaque") bytes = encodeRgbaPng(w, h, nativePixels(false, true));
  else if (mode === "native-dark") bytes = encodeRgbaPng(w, h, nativePixels(false, false, true));
  else bytes = encodePng(w, h, mode === "uniform" ? () => 128 : undefined);
  writeFileSync(join(dir, "out.png"), bytes);
}
const home = process.env.CODEX_HOME;
if (home) {
  const d = join(home, "sessions", "2026", "11", "01");
  mkdirSync(d, { recursive: true });
  const flag = process.env.FAKE_CODEX_FLAG ? process.env.FAKE_CODEX_FLAG === "true" : mode.startsWith("native");
  const gen = join(home, "generated_images", sid);
  mkdirSync(gen, { recursive: true });
  const item = (extra) => JSON.stringify({ type: "event_msg", payload: { item: { kind: "image_gen.generation", revisedPrompt: `REVISED: ${prompt.split("\n")[0]}`, transparentBackground: flag, ...extra } } });
  const lines = [JSON.stringify({ type: "session_meta" })];
  if (process.env.FAKE_CODEX_DECOY) {
    const decoy = join(gen, "decoy.png");
    writeFileSync(decoy, "decoy bytes");
    lines.push(item({ revisedPrompt: "DECOY", transparentBackground: !flag, savedPath: decoy }));
  }
  if (existsSync(join(dir, "out.png")) && !process.env.FAKE_CODEX_NO_SAVED) {
    const saved = join(gen, "img.png");
    copyFileSync(join(dir, "out.png"), saved);
    lines.push(item({ savedPath: process.env.FAKE_CODEX_SAVED_PATH ?? saved }));
  } else {
    lines.push(item({}));
  }
  writeFileSync(join(d, `rollout-2026-11-01T10-00-00-${sid}.jsonl`), `${lines.join("\n")}\n`);
}
