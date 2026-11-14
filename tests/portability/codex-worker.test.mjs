import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, symlinkSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { runCodexWorker } from "../../host/codex-worker.mjs";
import { canonicalDigest, snapshotProtected } from "../../packages/imagine-kit/src/edit/guard.mjs";

const PATCH = "stage: storyboard\nauthor: storyboard-artist\nbase_story_rev: 0\ninputs: {}\nops:\n  - shot: s01\n    set: {scene: lighthouse}\n";
function fixture(t, mode = "ok") {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "codex-worker-test-")));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const project = join(dir, "project"), home = join(dir, "user-home");
  mkdirSync(project); mkdirSync(home);
  writeFileSync(join(home, "auth.json"), "{\"synthetic\":true}\n");
  writeFileSync(join(project, "project.yaml"), "contract: 1\n");
  const brief = join(dir, "brief.txt"); writeFileSync(brief, "Synthetic dispatch brief.");
  const fake = join(dir, "fake.mjs");
  writeFileSync(fake, `import {writeFileSync,readFileSync} from 'node:fs';
const args=process.argv.slice(2), mode=process.env.PROBE_MODE;
if(args.includes('--version')){console.log(mode==='version'?'codex-cli 9.0.0':'codex-cli 0.169.0');process.exit(0)}
if(args.includes('list')){console.log(mode==='mcp'?'[{"name":"mutator"}]':mode==='bad-mcp'?'{}':'[]');process.exit(0)}
writeFileSync(process.env.PROBE_CAPTURE,JSON.stringify({args,home:process.env.CODEX_HOME,config:readFileSync(process.env.CODEX_HOME+'/config.toml','utf8')}));
if(mode==='exit')process.exit(5);
if(mode==='timeout'){setInterval(()=>{},1000)}else if(mode==='signal'){
const {spawn}=await import('node:child_process');
const grand=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});
writeFileSync(process.env.PROBE_CAPTURE,JSON.stringify({home:process.env.CODEX_HOME,pid:process.pid,grandchild:grand.pid}));setInterval(()=>{},1000);
}else if(mode!=='missing'){
const value=mode==='review-blocked'?'outcome: blocked\\nreason: mandatory image unavailable\\n':mode==='review-markdown'?'### Review identity\\n- **outcome**: \x60blocked\x60\\n### Inputs\\nImage missing.\\n':mode==='empty'?' ':mode==='prose'?'Explanation: extra prose\\n'+${JSON.stringify(PATCH)}:mode==='fenced'?'\x60\x60\x60yaml\\n'+${JSON.stringify(PATCH)}+'\x60\x60\x60':mode==='blocked'?'status: blocked\\nreason: missing inputs\\n':${JSON.stringify(PATCH)};
if(process.env.PROBE_TAMPER)writeFileSync(process.env.PROBE_TAMPER,'tampered');
writeFileSync(args[args.indexOf('--output-last-message')+1],process.env.PROBE_OUTPUT??value);}
`);
  const ctx = { platform: "darwin", arch: "arm64", tools: { codex: [process.execPath, fake] }, env: { ...process.env, CODEX_HOME: home, PROBE_MODE: mode, PROBE_CAPTURE: join(dir, "capture.json") } };
  return { dir, project, home, brief, ctx, options: { role: "storyboard-artist", project, brief, provider: "openai", model: "gpt-6.1-sol", reasoningEffort: "medium", timeoutMs: 5000 } };
}

test("worker pins canonical instructions and permissions, returns bytes unchanged and cleans private home", async t => {
  const f = fixture(t); const result = await runCodexWorker(f.options, f.ctx);
  assert.equal(result.ok, true, JSON.stringify(result)); assert.equal(result.output, PATCH);
  const c = JSON.parse(readFileSync(join(f.dir, "capture.json")));
  assert.ok(c.args.includes('sandbox_mode="read-only"')); assert.ok(c.args.includes('approval_policy="never"'));
  assert.ok(c.args.some(a => a === "features.apps=false"));
  assert.ok(c.args.some(a => a === "features.image_generation=false"));
  assert.ok(c.args.some(a => a.includes("trust_level=\"untrusted\"")));
  assert.ok(c.args.some(a => a.startsWith("developer_instructions=") && a.includes("# Storyboard Artist")));
  assert.equal(existsSync(c.home), false); assert.equal(existsSync(join(f.home, "auth.json")), true);
});

async function sceneFixture(t) {
  const f = fixture(t);
  const shadow = join(f.project, "stage/edit/s01");
  mkdirSync(join(shadow, "compositions"), { recursive: true });
  mkdirSync(join(f.project, "stage/guard"), { recursive: true });
  writeFileSync(join(shadow, "compositions/s01.html"), "synthetic composition");
  writeFileSync(join(f.project, "bible.yaml"), "world: original\n");
  const baseline = await snapshotProtected(f.project, "s01");
  writeFileSync(join(f.project, "stage/guard/s01.json"), JSON.stringify(baseline));
  Object.assign(f.options, { role: "scene-builder", shotId: "s01", briefHash: "b".repeat(64), guardDigest: canonicalDigest(baseline) });
  const report = { status: "proposed", shot_id: "s01", brief_hash: f.options.briefHash, shadow_root: shadow,
    artifacts: [{ path: join(shadow, "compositions/s01.html"), purpose: "scene" }], validation: { lint_attempts: 1, lint_clean: true } };
  f.ctx.env.PROBE_OUTPUT = JSON.stringify(report);
  return { ...f, shadow, report };
}

test("scene worker uses canonical body, writable shadow cwd and verified parent baseline", async t => {
  const f = await sceneFixture(t);
  const r = await runCodexWorker(f.options, f.ctx);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.output, f.ctx.env.PROBE_OUTPUT);
  const capture = JSON.parse(readFileSync(join(f.dir, "capture.json")));
  assert.ok(capture.args.includes('sandbox_mode="workspace-write"'));
  assert.ok(capture.args.includes('shell_environment_policy.set.npm_config_offline="true"'));
  assert.ok(capture.args.includes(`shell_environment_policy.set.npm_config_cache=${JSON.stringify(join(f.shadow, ".npm-cache"))}`));
  assert.equal(capture.args[capture.args.indexOf("-C") + 1], f.shadow);
  assert.ok(capture.args.some(a => a.startsWith("developer_instructions=") && a.includes("# Scene Builder") && a.includes("kit guard")));
  assert.equal(JSON.stringify(capture.args).includes(f.options.guardDigest), false);
});

for (const invalid of ["missing-baseline", "wrong-baseline-shot", "missing-digest", "wrong-digest", "shot-traversal", "shadow-symlink", "shadow-config"]) {
  test(`scene rejects ${invalid} before worker execution`, async t => {
    const f = await sceneFixture(t);
    if (invalid === "missing-baseline") rmSync(join(f.project, "stage/guard/s01.json"));
    if (invalid === "wrong-baseline-shot") writeFileSync(join(f.project, "stage/guard/s01.json"), '{"shot":"s02","files":{}}');
    if (invalid === "missing-digest") delete f.options.guardDigest;
    if (invalid === "wrong-digest") f.options.guardDigest = "a".repeat(64);
    if (invalid === "shot-traversal") f.options.shotId = "../s01";
    if (invalid === "shadow-symlink") { rmSync(f.shadow, { recursive: true }); symlinkSync(f.home, f.shadow); }
    if (invalid === "shadow-config") { mkdirSync(join(f.shadow, ".codex")); writeFileSync(join(f.shadow, ".codex/config.toml"), "[mcp_servers.evil]\ncommand='unused'"); }
    const r = await runCodexWorker(f.options, f.ctx);
    assert.equal(r.ok, false); assert.equal(existsSync(join(f.dir, "capture.json")), false);
  });
}

for (const invalid of ["malformed", "wrong-shot", "wrong-shadow", "wrong-brief", "no-lint", "too-many-lints", "dirty-lint", "artifact-escape"]) {
  test(`scene rejects ${invalid} handoff`, async t => {
    const f = await sceneFixture(t);
    if (invalid === "wrong-shot") f.report.shot_id = "s02";
    if (invalid === "wrong-shadow") f.report.shadow_root = f.project;
    if (invalid === "wrong-brief") f.report.brief_hash = "c".repeat(64);
    if (invalid === "no-lint") f.report.validation.lint_attempts = 0;
    if (invalid === "too-many-lints") f.report.validation.lint_attempts = 4;
    if (invalid === "dirty-lint") f.report.validation.lint_clean = false;
    if (invalid === "artifact-escape") f.report.artifacts[0].path = join(f.project, "bible.yaml");
    f.ctx.env.PROBE_OUTPUT = invalid === "malformed" ? "arbitrary prose" : JSON.stringify(f.report);
    const r = await runCodexWorker(f.options, f.ctx);
    assert.equal(r.ok, false);
    assert.ok(existsSync(join(f.dir, "capture.json")), "handoff must be checked after dispatch");
  });
}

test("scene post-dispatch guard catches protected changes even with a valid handoff", async t => {
  const f = await sceneFixture(t); f.ctx.env.PROBE_TAMPER = join(f.project, "bible.yaml");
  const r = await runCodexWorker(f.options, f.ctx);
  assert.equal(r.ok, false); assert.match(r.message, /guard|protected/i);
  assert.ok(existsSync(join(f.dir, "capture.json")));
});

test("unsupported role, platform and invalid inputs fail before execution", async t => {
  const f = fixture(t);
  for (const over of [{ role: "scene-builder" }, { role: "../scene-builder" }, { timeoutMs: 0 }, { model: "" }, { brief: join(f.dir, "missing") }]) {
    const r = await runCodexWorker({ ...f.options, ...over }, f.ctx); assert.equal(r.ok, false); assert.equal(existsSync(join(f.dir, "capture.json")), false);
  }
  assert.equal((await runCodexWorker(f.options, { ...f.ctx, platform: "linux" })).ok, false);
});

for (const mode of ["version", "mcp", "bad-mcp", "exit", "timeout", "missing", "empty", "fenced", "blocked", "prose"]) {
  test(`worker rejects ${mode} and preserves user authentication`, async t => {
    const f = fixture(t, mode); if (mode === "timeout") f.options.timeoutMs = 100;
    const result = await runCodexWorker(f.options, f.ctx); assert.equal(result.ok, false, JSON.stringify(result));
    if (existsSync(join(f.dir, "capture.json"))) assert.equal(existsSync(JSON.parse(readFileSync(join(f.dir, "capture.json"))).home), false);
    assert.equal(readFileSync(join(f.home, "auth.json"), "utf8"), "{\"synthetic\":true}\n");
  });
}

test("missing Codex is BLOCKED", async t => {
  const f = fixture(t); f.ctx.tools.codex = [join(f.dir, "absent-codex")];
  assert.equal((await runCodexWorker(f.options, f.ctx)).ok, false);
});

test("CLI invoked through a symlink still executes and rejects incomplete scene dispatch", t => {
  const f = fixture(t), alias = join(f.dir, "worker-alias.mjs");
  symlinkSync(new URL("../../host/codex-worker.mjs", import.meta.url), alias);
  const result = spawnSync(process.execPath, [alias, "--role", "scene-builder"], { encoding: "utf8" });
  assert.equal(result.status, 3); assert.equal(JSON.parse(result.stdout).status, "BLOCKED");
});

for (const mode of ["review-blocked", "review-markdown"]) test(`canonical continuity ${mode} remains BLOCKED verbatim`, async t => {
  const f = fixture(t, mode); f.options.role = "continuity-reviewer";
  const result = await runCodexWorker(f.options, f.ctx);
  assert.equal(result.ok, false); assert.match(result.output, /blocked/);
});

test("project config and hook layers are rejected before any worker process", async t => {
  const f = fixture(t); mkdirSync(join(f.project, ".codex"));
  writeFileSync(join(f.project, ".codex/config.toml"), '[mcp_servers.mutator]\ncommand="unused"\n');
  const result = await runCodexWorker(f.options, f.ctx);
  assert.equal(result.ok, false); assert.match(result.message, /project.*config|config.*project/i);
  assert.equal(existsSync(join(f.dir, "capture.json")), false);
});

for (const signal of ["SIGINT", "SIGTERM"]) test(`signal ${signal} kills worker tree and removes private home`, async t => {
  const f = fixture(t, "signal");
  const driver = join(f.dir, "driver.mjs");
  writeFileSync(driver, `import {runCodexWorker} from ${JSON.stringify(new URL("../../host/codex-worker.mjs", import.meta.url).href)}; await runCodexWorker(${JSON.stringify(f.options)},${JSON.stringify(f.ctx)});`);
  const child = spawn(process.execPath, [driver], { stdio: "ignore" });
  t.after(() => { try { child.kill("SIGKILL"); } catch {} });
  let info;
  for (let n = 0; n < 150; n++) {
    if (existsSync(join(f.dir, "capture.json"))) {
      try { const value = JSON.parse(readFileSync(join(f.dir, "capture.json"))); if (value.grandchild) { info = value; break; } } catch {}
    }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.ok(info, "fake worker did not start");
  const closed = once(child, "exit"); child.kill(signal); await closed;
  assert.equal(existsSync(info.home), false);
  assert.equal(readFileSync(join(f.home, "auth.json"), "utf8"), "{\"synthetic\":true}\n");
  for (const pid of [info.pid, info.grandchild]) {
    let alive = true;
    for (let n = 0; n < 50; n++) {
      try { process.kill(pid, 0); } catch { alive = false; break; }
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.equal(alive, false, `process ${pid} survived ${signal}`);
  }
});
