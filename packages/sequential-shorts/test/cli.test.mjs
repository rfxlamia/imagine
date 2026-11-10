import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "../src/cli.mjs";
import { envelope, exitCode } from "../src/envelope.mjs";
import { requireTools } from "../src/preflight.mjs";
import { runTool } from "../src/run/tools.mjs";
import { canonical, hashValue, sha256, sha256File } from "../src/run/hash.mjs";
import { readJson, writeJsonAtomic } from "../src/run/fsx.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const BIN = join(here, "..", "bin", "sequential-shorts.mjs");

test("--help returns an ok envelope with usage text", async () => {
  const r = await run(["--help"]);
  assert.equal(r.exit, 0);
  assert.equal(r.env.ok, true);
  assert.equal(r.env.command, "help");
  assert.match(r.env.data.usage, /sequential-shorts <command>/);
  assert.deepEqual(Object.keys(r.env), ["ok", "command", "version", "code", "data", "errors", "warnings", "not_run"]);
});

test("unknown command is USAGE with exit 2", async () => {
  const r = await run(["bogus"]);
  assert.equal(r.exit, 2);
  assert.equal(r.env.code, "USAGE");
  assert.match(r.env.errors[0].message, /unknown command: bogus/);
});

test("no command is USAGE", async () => {
  const r = await run([]);
  assert.equal(r.exit, 2);
  assert.equal(r.env.command, "(none)");
});

test("exit codes follow the kit convention", () => {
  for (const [code, exit] of [[null, 0], ["HARD", 1], ["HARD_NOT_RUN", 1], ["USAGE", 2], ["BLOCKED", 3], ["CONFLICT", 4]]) {
    assert.equal(exitCode(envelope({ command: "x", code })), exit);
  }
});

test("bin prints exactly one JSON line", () => {
  const r = spawnSync(process.execPath, [BIN, "--help"], { encoding: "utf8" });
  assert.equal(r.status, 0);
  const lines = r.stdout.trim().split("\n");
  assert.equal(lines.length, 1);
  assert.equal(JSON.parse(lines[0]).ok, true);
});

test("bin reports a USAGE envelope and exit 2 for an unknown command", () => {
  const r = spawnSync(process.execPath, [BIN, "nope"], { encoding: "utf8" });
  assert.equal(r.status, 2);
  assert.equal(JSON.parse(r.stdout).code, "USAGE");
});

test("requireTools reports a missing tool as BLOCKED with not_run", async () => {
  await assert.rejects(requireTools({ tools: { ffmpeg: "/nonexistent/ffmpeg-x" } }, ["ffmpeg"]), (e) => {
    assert.equal(e.code, "BLOCKED");
    assert.deepEqual(e.notRun.map((n) => n.check), ["ffmpeg"]);
    return true;
  });
});

test("requireTools returns version lines for present tools", async () => {
  const fake = [process.execPath, "-e", "console.log('fake 1.0')", "--"];
  const v = await requireTools({ tools: { ffmpeg: fake, ffprobe: fake } }, ["ffmpeg", "ffprobe"]);
  assert.deepEqual(v, { ffmpeg: "fake 1.0", ffprobe: "fake 1.0" });
});

test("env override selects the ffmpeg binary and ctx.tools wins over it", async () => {
  const viaEnv = await runTool({ env: { ...process.env, SEQ_SHORTS_FFMPEG: "/nonexistent/ff-env" } }, "ffmpeg", ["-version"]);
  assert.equal(viaEnv.missing, true);
  const viaTools = await runTool({ env: { ...process.env, SEQ_SHORTS_FFMPEG: "/nonexistent/ff-env" }, tools: { ffmpeg: [process.execPath, "-e", "process.exit(0)"] } }, "ffmpeg", []);
  assert.equal(viaTools.missing, false);
  assert.equal(viaTools.status, 0);
});

test("runTool times out a hung child", async () => {
  const r = await runTool({ tools: { sleeper: [process.execPath, "-e", "setTimeout(() => {}, 20000)"] } }, "sleeper", [], { timeoutMs: 300 });
  assert.equal(r.timedOut, true);
});

test("hash helpers are stable", async () => {
  assert.equal(canonical({ b: 1, a: [2, { d: 3, c: undefined }] }), '{"a":[2,{"d":3}],"b":1}');
  assert.equal(hashValue({ a: 1, b: 2 }), hashValue({ b: 2, a: 1 }));
  const dir = mkdtempSync(join(tmpdir(), "ss-hash-"));
  writeFileSync(join(dir, "f"), "hello");
  assert.equal(await sha256File(join(dir, "f")), sha256("hello"));
});

test("writeJsonAtomic round-trips", () => {
  const dir = mkdtempSync(join(tmpdir(), "ss-fsx-"));
  writeJsonAtomic(join(dir, "a", "b.json"), { x: 1 });
  assert.deepEqual(readJson(join(dir, "a", "b.json")), { x: 1 });
});
