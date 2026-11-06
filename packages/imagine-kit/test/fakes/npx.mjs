#!/usr/bin/env node
// Fake `npx --yes hyperframes@x <sub> ...`: records argv and the telemetry env, answers lint --json and render.
// FAKE_NPX_MODE: ok | lint-error | no-json | warn | render-fail | lint-ok-exit-nonzero | lint-timeout. render writes FAKE_NPX_MP4 (a path to copy) to the -o target.
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { encodeRgbaPng } from "../helpers/png.mjs";

const argv = process.argv.slice(2);
const log = process.env.FAKE_NPX_LOG;
const priorLines = log && existsSync(log) ? readFileSync(log, "utf8").split("\n").filter(Boolean) : [];
const rbCalls = priorLines.filter((l) => {
  try { return JSON.parse(l).argv.includes("remove-background"); } catch { return false; }
}).length;
if (log) appendFileSync(log, `${JSON.stringify({ argv, telemetry_off: process.env.HYPERFRAMES_NO_TELEMETRY ?? null, cwd: process.cwd() })}\n`);
const mode = process.env.FAKE_NPX_MODE ?? "ok";
const sub = argv.find((a) => ["lint", "render", "init"].includes(a));
if (argv.includes("remove-background")) {
  const rbModes = (process.env.FAKE_NPX_RB_MODE ?? "ok").split(",");
  const rbMode = rbModes[Math.min(rbCalls, rbModes.length - 1)];
  if (rbMode === "fail") {
    process.stderr.write("simulated remove-background failure\n");
    process.exit(1);
  }
  if (rbMode === "nofile") {
    process.exit(0);
  }
  const inputIdx = argv.indexOf("remove-background") + 1;
  const inputPath = argv[inputIdx];
  const inBytes = readFileSync(inputPath);
  const w = inBytes.readUInt32BE(16);
  const h = inBytes.readUInt32BE(20);
  const out = argv[argv.indexOf("-o") + 1];
  mkdirSync(dirname(out), { recursive: true });

  let outW = w;
  let outH = h;
  if (rbMode === "resize") {
    outW = Math.max(1, w - 1);
    outH = Math.max(1, h - 1);
  }
  let pixel;
  if (rbMode === "empty") {
    pixel = () => [0, 0, 0, 0];
  } else if (rbMode === "edge") {
    pixel = () => [255, 255, 255, 255];
  } else {
    const minX = Math.floor(outW * 0.25);
    const maxX = Math.floor(outW * 0.75);
    const minY = Math.floor(outH * 0.25);
    const maxY = Math.floor(outH * 0.75);
    pixel = (x, y) => {
      if (x >= minX && x < maxX && y >= minY && y < maxY) {
        return [((x * 7 + y * 13) ^ (x >> 3)) & 255, ((x * 11 + y * 5) ^ (y >> 2)) & 255, 128, 255];
      }
      return [0, 0, 0, 0];
    };
  }
  writeFileSync(out, encodeRgbaPng(outW, outH, pixel));
  process.exit(0);
}
if (sub === "lint") {
  if (process.env.FAKE_NPX_HOOK_FILE && process.env.FAKE_NPX_HOOK_CONTENT !== undefined) {
    writeFileSync(process.env.FAKE_NPX_HOOK_FILE, process.env.FAKE_NPX_HOOK_CONTENT);
  }
  if (process.env.FAKE_NPX_UNLINK) {
    try { unlinkSync(process.env.FAKE_NPX_UNLINK); } catch {}
  }
  if (process.env.FAKE_NPX_SLEEP_MS) await new Promise((r) => setTimeout(r, Number(process.env.FAKE_NPX_SLEEP_MS)));
  if (mode === "lint-timeout") {
    await new Promise((r) => setTimeout(r, 60000));
  }
  if (mode === "lint-ok-exit-nonzero") {
    console.log(JSON.stringify({ ok: true, errorCount: 0, warningCount: 0, findings: [] }));
    process.exit(1);
  }
  if (process.env.FAKE_NPX_LINT_JSON !== undefined) {
    console.log(process.env.FAKE_NPX_LINT_JSON);
    process.exit(0);
  }
  const findings = mode === "lint-error" ? [{ code: "missing_timeline", severity: "error", message: "no timeline", fixHint: "register it", file: "/x/compositions/s01.html" }]
    : mode === "warn" ? [{ code: "studio_missing_editable_id", severity: "warning", message: "no id" }] : [];
  if (mode === "no-json") { console.log("something else"); process.exit(0); }
  console.log(JSON.stringify({ ok: mode !== "lint-error", errorCount: findings.filter((f) => f.severity === "error").length, warningCount: findings.filter((f) => f.severity === "warning").length, findings }));
  process.exit(mode === "lint-error" ? 1 : 0);
}
if (sub === "render") {
  if (process.env.FAKE_NPX_SLEEP_MS) await new Promise((r) => setTimeout(r, Number(process.env.FAKE_NPX_SLEEP_MS)));
  if (mode === "render-fail") { console.error("render failed"); process.exit(1); }
  const out = argv[argv.indexOf("-o") + 1];
  mkdirSync(dirname(out), { recursive: true });
  copyFileSync(process.env.FAKE_NPX_MP4, out);
  process.exit(0);
}
process.exit(0);
