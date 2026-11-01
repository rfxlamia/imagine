import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pngInfo, isUniformImage, probeMedia, measureLoudness } from "../src/media.mjs";
import { rasterQ, tierOf, round2 } from "../src/raster.mjs";
import { runTool, ensureTool } from "../src/tools.mjs";
import { createContext, resolveRef } from "../src/sources.mjs";
import { sha256File } from "../src/hash.mjs";
import { makeProject, put } from "./helpers/fixture.mjs";
import { makeMp4, makePng, hasFfmpeg } from "./helpers/media.mjs";

const scratch = () => mkdtempSync(join(tmpdir(), "imagine-media-"));
const ffTest = hasFfmpeg ? test : test.skip;

test("rasterQ and tierOf reproduce the proposal section 7.2 worked examples", () => {
  const cases = [
    [1536, 1024, { w: 2172, h: 1188 }, 0.71, "replan"],
    [1536, 1024, { w: 1997, h: 1123 }, 0.77, "soft"],
    [1024, 1536, { w: 1080, h: 1920 }, 0.8, "soft"],
    [1672, 941, { w: 1920, h: 1080 }, 0.87, "soft"],
    [1920, 1080, { w: 1920, h: 1080 }, 1, "native"],
  ];
  for (const [w, h, req, q, tier] of cases) {
    assert.equal(round2(rasterQ(w, h, req)), q);
    assert.equal(tierOf(rasterQ(w, h, req)), tier);
  }
  // Thresholds compare unrounded: 0.7496 rounds to 0.75 but is still replan.
  assert.equal(tierOf(0.7496), "replan");
  assert.equal(tierOf(0.75), "soft");
  assert.equal(tierOf(0.9999), "soft");
});

test("pngInfo reads the IHDR and rejects non-PNG bytes", () => {
  const dir = scratch();
  const p = makePng(join(dir, "a.png"), 64, 32);
  assert.deepEqual(pngInfo(Buffer.from(require_read(p))), { w: 64, h: 32 });
  assert.equal(pngInfo(Buffer.from("not a png at all, just text bytes")), null);
});
import { readFileSync } from "node:fs";
const require_read = (p) => readFileSync(p);

ffTest("isUniformImage flags blank plates and passes busy images", async () => {
  const dir = scratch();
  const busy = makePng(join(dir, "busy.png"), 128, 128);
  const blank = makePng(join(dir, "blank.png"), 128, 128, () => 90);
  assert.equal(await isUniformImage({}, busy), false);
  assert.equal(await isUniformImage({}, blank), true);
});

ffTest("probeMedia and measureLoudness read a generated MP4", async () => {
  const dir = scratch();
  const mp4 = makeMp4(join(dir, "a.mp4"), { seconds: 4 });
  const info = await probeMedia({}, mp4);
  assert.equal(info.w, 1080);
  assert.equal(info.h, 1920);
  assert.equal(info.fps, 30);
  assert.ok(info.audio);
  assert.ok(Math.abs(info.duration_s - 4) < 0.2);
  const loud = await measureLoudness({}, mp4);
  assert.ok(Math.abs(loud.lufs - -16) < 1, `lufs ${loud.lufs}`);
  const quiet = await measureLoudness({}, makeMp4(join(dir, "q.mp4"), { seconds: 4, volume: 1 }));
  assert.ok(quiet.lufs < -20);
});

test("a missing tool is BLOCKED, not a pass", async () => {
  const ctx = { tools: { codex: ["/nonexistent/codex-binary"] } };
  const r = await runTool(ctx, "codex", ["--version"]);
  assert.equal(r.missing, true);
  assert.throws(() => ensureTool(r, "codex", "HARD-REAL-RASTER"), (e) => e.code === "BLOCKED" && e.rule === "HARD-REAL-RASTER");
});

test("runTool passes env, stdin and reports timeouts", async () => {
  const ctx = { tools: { uv: [process.execPath, "-e", "process.stdin.pipe(process.stdout); process.stderr.write(process.env.PROBE ?? '')"] }, env: { ...process.env } };
  const r = await runTool(ctx, "uv", [], { input: "hello", env: { PROBE: "yes" } });
  assert.equal(r.stdout, "hello");
  assert.equal(r.stderr, "yes");
  const slow = await runTool({ tools: { uv: [process.execPath, "-e", "setTimeout(()=>{},5000)"] } }, "uv", [], { timeoutMs: 100 });
  assert.equal(slow.timedOut, true);
});

test("runTool timeout kills the whole process group, grandchildren included", async () => {
  const dir = mkdtempSync(join(tmpdir(), "imagine-pg-"));
  const pidFile = join(dir, "grandchild.pid");
  const script = `const { spawn } = require("node:child_process"); const fs = require("node:fs");
    const g = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { stdio: "ignore" });
    fs.writeFileSync(${JSON.stringify(pidFile)}, String(g.pid)); setInterval(()=>{},1000);`;
  const r = await runTool({ tools: { uv: [process.execPath, "-e", script] } }, "uv", [], { timeoutMs: 600 });
  assert.equal(r.timedOut, true);
  const pid = Number(readFileSync(pidFile, "utf8"));
  await new Promise((done) => setTimeout(done, 200));
  assert.throws(() => process.kill(pid, 0), (e) => e.code === "ESRCH", "grandchild must be gone");
});

test("runTool forwards SIGINT to the tool's process group, so Ctrl-C leaves no orphan", async () => {
  const dir = mkdtempSync(join(tmpdir(), "imagine-sig-"));
  const pidFile = join(dir, "tool.pid");
  const toolSrc = `require("node:fs").writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); setInterval(()=>{},1000);`;
  const driver = `import { runTool } from ${JSON.stringify(new URL("../src/tools.mjs", import.meta.url).href)};
    await runTool({ tools: { uv: [process.execPath, "-e", ${JSON.stringify(toolSrc)}] } }, "uv", [], { timeoutMs: 60000 });`;
  const kit = spawn(process.execPath, ["--input-type=module", "-e", driver], { stdio: "ignore" });
  const exited = new Promise((done) => kit.on("exit", (code, signal) => done({ code, signal })));
  for (let i = 0; i < 100 && !existsSync(pidFile); i += 1) await new Promise((done) => setTimeout(done, 50));
  assert.ok(existsSync(pidFile), "the tool started");
  const pid = Number(readFileSync(pidFile, "utf8"));
  kit.kill("SIGINT");
  assert.equal((await exited).signal, "SIGINT");
  await new Promise((done) => setTimeout(done, 200));
  assert.throws(() => process.kill(pid, 0), (e) => e.code === "ESRCH", "the tool must be gone");
});

test("file: refs hash only the allowed project files and stay inside the project", async () => {
  const { dir, cwd } = await makeProject();
  const sctx = () => createContext(dir);
  assert.equal(resolveRef(sctx(), "file:assets/plan.yaml", undefined), null);
  put(dir, "assets/plan.yaml", "assets: []\n");
  assert.equal(resolveRef(sctx(), "file:assets/plan.yaml", undefined), sha256File(join(dir, "assets/plan.yaml")));
  assert.equal(resolveRef(sctx(), "file:project.yaml", undefined), null, "only the documented files resolve");
  assert.equal(resolveRef(sctx(), "file:../outside.html", undefined), null);
  put(dir, "edit/compositions/s01.html", "<div></div>");
  assert.ok(resolveRef(sctx(), "file:edit/compositions/s01.html", undefined));
  // A symlink that leaves the project does not resolve.
  const outside = join(cwd, "outside.html");
  writeFileSync(outside, "x");
  symlinkSync(outside, join(dir, "edit/compositions/leak.html"));
  assert.equal(resolveRef(sctx(), "file:edit/compositions/leak.html", undefined), null);
});
