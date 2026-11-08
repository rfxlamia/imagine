import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { HOST_IDS, HOSTS, PROTECTED_STAGES, checkStage } from "../../host/capabilities.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliPath = join(__dirname, "..", "..", "host", "check-stage.mjs");

test("CAP-HOST-ENFORCEMENT: claude-code scene-builder with CLAUDECODE=1 returns ok", () => {
  const res = checkStage({ host: "claude-code", stage: "scene-builder", env: { CLAUDECODE: "1" } });
  assert.equal(res.status, "ok");
  assert.equal(res.host, "claude-code");
  assert.equal(res.stage, "scene-builder");
  assert.equal(res.reason, null);
});

test("claude-code with env: {} or { CLAUDECODE: '0' } gives BLOCKED with corroboration reason", () => {
  const resEmpty = checkStage({ host: "claude-code", stage: "scene-builder", env: {} });
  assert.equal(resEmpty.status, "BLOCKED");
  assert.equal(resEmpty.host, "claude-code");
  assert.equal(resEmpty.stage, "scene-builder");
  assert.equal(resEmpty.reason, "host claim not corroborated by environment");

  const resZero = checkStage({ host: "claude-code", stage: "scene-builder", env: { CLAUDECODE: "0" } });
  assert.equal(resZero.status, "BLOCKED");
  assert.equal(resZero.host, "claude-code");
  assert.equal(resZero.stage, "scene-builder");
  assert.equal(resZero.reason, "host claim not corroborated by environment");
});

test("grok, antigravity, cursor, pi, '', 'unknown', and 'claude' give BLOCKED, even with CLAUDECODE=1 set", () => {
  const env = { CLAUDECODE: "1" };

  for (const host of ["grok", "antigravity", "cursor", "pi"]) {
    const res = checkStage({ host, stage: "scene-builder", env });
    assert.equal(res.status, "BLOCKED", `expected host ${host} to be BLOCKED`);
    assert.equal(res.host, host);
    assert.equal(res.stage, "scene-builder");
    assert.match(res.reason, /missing verified enforcement evidence/i);
    assert.match(res.reason, /scene_builder_enforcement/);
  }

  for (const host of ["", "unknown", "claude"]) {
    const res = checkStage({ host, stage: "scene-builder", env });
    assert.equal(res.status, "BLOCKED", `expected host ${host} to be BLOCKED`);
    assert.equal(res.host, host);
    assert.equal(res.stage, "scene-builder");
    assert.equal(res.reason, "unknown host id; no verified enforcement");
  }
});

test("an unknown stage throws TypeError", () => {
  assert.throws(() => {
    checkStage({ host: "claude-code", stage: "unknown-stage", env: { CLAUDECODE: "1" } });
  }, TypeError);

  assert.throws(() => {
    checkStage({ host: "claude-code", stage: "", env: { CLAUDECODE: "1" } });
  }, TypeError);

  assert.throws(() => {
    checkStage({ host: "claude-code", stage: undefined, env: { CLAUDECODE: "1" } });
  }, TypeError);
});

test("HOSTS is frozen and contains valid host definitions", () => {
  assert.equal(Object.isFrozen(HOSTS), true);
  for (const id of HOST_IDS) {
    assert.ok(HOSTS[id], `missing host definition for ${id}`);
    assert.equal(Object.isFrozen(HOSTS[id]), true);
  }
});

test("CLI: spawned with env CLAUDECODE=1 exits 0 for claude-code; spawned without CLAUDECODE exits 3", () => {
  const childEnvOk = { ...process.env, CLAUDECODE: "1" };
  const okRun = spawnSync(process.execPath, [cliPath, "--host", "claude-code", "--stage", "scene-builder"], {
    env: childEnvOk,
    encoding: "utf8",
  });
  assert.equal(okRun.status, 0);
  const okParsed = JSON.parse(okRun.stdout.trim());
  assert.deepEqual(okParsed, {
    ok: true,
    status: "ok",
    host: "claude-code",
    stage: "scene-builder",
    reason: null,
  });

  const childEnvBlocked = { ...process.env };
  delete childEnvBlocked.CLAUDECODE;
  const blockedRun = spawnSync(process.execPath, [cliPath, "--host", "claude-code", "--stage", "scene-builder"], {
    env: childEnvBlocked,
    encoding: "utf8",
  });
  assert.equal(blockedRun.status, 3);
  const blockedParsed = JSON.parse(blockedRun.stdout.trim());
  assert.deepEqual(blockedParsed, {
    ok: false,
    status: "BLOCKED",
    host: "claude-code",
    stage: "scene-builder",
    reason: "host claim not corroborated by environment",
  });
});

test("CLI: exits 3 for cursor and stdout is JSON", () => {
  const childEnv = { ...process.env, CLAUDECODE: "1" };
  const run = spawnSync(process.execPath, [cliPath, "--host", "cursor", "--stage", "scene-builder"], {
    env: childEnv,
    encoding: "utf8",
  });
  assert.equal(run.status, 3);
  const parsed = JSON.parse(run.stdout.trim());
  assert.equal(parsed.ok, false);
  assert.equal(parsed.status, "BLOCKED");
  assert.equal(parsed.host, "cursor");
  assert.equal(parsed.stage, "scene-builder");
  assert.match(parsed.reason, /missing verified enforcement evidence/i);
});

test("CLI: exits 2 when --host is missing and stdout is JSON", () => {
  const run = spawnSync(process.execPath, [cliPath, "--stage", "scene-builder"], {
    encoding: "utf8",
  });
  assert.equal(run.status, 2);
  const parsed = JSON.parse(run.stdout.trim());
  assert.equal(parsed.ok, false);
  assert.equal(parsed.status, "error");
  assert.match(parsed.reason, /missing required flag: --host/i);
});

test("CLI: exits 2 on unknown stage and stdout is JSON", () => {
  const run = spawnSync(process.execPath, [cliPath, "--host", "claude-code", "--stage", "invalid-stage"], {
    encoding: "utf8",
  });
  assert.equal(run.status, 2);
  const parsed = JSON.parse(run.stdout.trim());
  assert.equal(parsed.ok, false);
  assert.equal(parsed.status, "error");
  assert.match(parsed.reason, /unknown stage/i);
});

test("Fix B: prototype-inherited env is BLOCKED with corroboration reason", () => {
  const inheritedEnv = Object.create({ CLAUDECODE: "1" });
  const res = checkStage({ host: "claude-code", stage: "scene-builder", env: inheritedEnv });
  assert.equal(res.status, "BLOCKED");
  assert.equal(res.host, "claude-code");
  assert.equal(res.stage, "scene-builder");
  assert.equal(res.reason, "host claim not corroborated by environment");
});

test("Fix C: CLI exits 2 and outputs JSON on duplicate --host", () => {
  const childEnv = { ...process.env, CLAUDECODE: "1" };
  const run = spawnSync(
    process.execPath,
    [cliPath, "--host", "cursor", "--host=claude-code", "--stage", "scene-builder"],
    {
      env: childEnv,
      encoding: "utf8",
    }
  );
  assert.equal(run.status, 2);
  const parsed = JSON.parse(run.stdout.trim());
  assert.equal(parsed.ok, false);
  assert.equal(parsed.status, "error");
  assert.equal(parsed.reason, "duplicate flag: --host");
});

test("Fix C: CLI exits 2 and outputs JSON on duplicate --stage", () => {
  const childEnv = { ...process.env, CLAUDECODE: "1" };
  const run = spawnSync(
    process.execPath,
    [cliPath, "--host", "claude-code", "--stage", "scene-builder", "--stage=scene-builder"],
    {
      env: childEnv,
      encoding: "utf8",
    }
  );
  assert.equal(run.status, 2);
  const parsed = JSON.parse(run.stdout.trim());
  assert.equal(parsed.ok, false);
  assert.equal(parsed.status, "error");
  assert.equal(parsed.reason, "duplicate flag: --stage");
});
