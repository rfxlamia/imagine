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
  assert.equal(res.isolation, "hook");
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
    assert.match(res.reason, /kit_guard_run evidence missing/);
    assert.match(res.reason, /subagents not VERIFIED-RUN/);
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
    isolation: "hook",
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
  assert.match(parsed.reason, /kit_guard_run evidence missing/i);
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

test("claude-code with hook_failure != 'block' returns BLOCKED", () => {
  const customHosts = {
    ...HOSTS,
    "claude-code": Object.freeze({
      ...HOSTS["claude-code"],
      hook_failure: "warn",
    }),
  };
  const res = checkStage({
    host: "claude-code",
    stage: "scene-builder",
    env: { CLAUDECODE: "1" },
    hosts: customHosts,
  });
  assert.equal(res.status, "BLOCKED");
  assert.match(res.reason, /hook_failure/);
});

test("synthetic host with hook claim and kit_guard_run set, but failing hook condition, stays BLOCKED and never reaches kit-guard branch", () => {
  const customHosts = {
    "hybrid-host": Object.freeze({
      subagents: "VERIFIED-RUN",
      pretooluse_hook: "VERIFIED-RUN",
      hook_failure: "warn",
      scene_builder_enforcement: "VERIFIED-RUN",
      evidence: "tests/slice/evidence/ac17-hook.final.txt",
      corroborate: Object.freeze({ name: "HYBRID_ENV", value: "1" }),
      kit_guard_run: "tests/slice/evidence/ac17-hook.final.txt",
    }),
  };
  const res = checkStage({
    host: "hybrid-host",
    stage: "scene-builder",
    env: { HYBRID_ENV: "1" },
    hosts: customHosts,
  });
  assert.equal(res.status, "BLOCKED");
  assert.match(res.reason, /hook_failure/);
  assert.doesNotMatch(res.reason, /kit_guard_run/);
  assert.doesNotMatch(res.reason, /subagents/);
});

test("synthetic host with no hook claim, subagents VERIFIED-RUN, real evidence path and real guard test file returns ok with isolation: 'kit-guard' and coverage", () => {
  const customHosts = {
    "kit-guard-host": Object.freeze({
      subagents: "VERIFIED-RUN",
      pretooluse_hook: "UNKNOWN",
      hook_failure: "UNKNOWN",
      scene_builder_enforcement: "UNKNOWN",
      evidence: null,
      corroborate: null,
      kit_guard_run: "tests/slice/evidence/ac17-hook.final.txt",
    }),
  };
  const res = checkStage({
    host: "kit-guard-host",
    stage: "scene-builder",
    hosts: customHosts,
  });
  assert.equal(res.status, "ok");
  assert.equal(res.host, "kit-guard-host");
  assert.equal(res.stage, "scene-builder");
  assert.equal(res.isolation, "kit-guard");
  assert.equal(
    res.coverage,
    "detective; detects changes to canon, plan inputs and media after stage-shot; does not prevent writes"
  );
  assert.equal(res.reason, null);
});

test("synthetic host with non-existent kit_guard_run path returns BLOCKED naming the missing path", () => {
  const customHosts = {
    "missing-evidence-host": Object.freeze({
      subagents: "VERIFIED-RUN",
      pretooluse_hook: "UNKNOWN",
      hook_failure: "UNKNOWN",
      scene_builder_enforcement: "UNKNOWN",
      evidence: null,
      corroborate: null,
      kit_guard_run: "tests/nonexistent/evidence.txt",
    }),
  };
  const res = checkStage({
    host: "missing-evidence-host",
    stage: "scene-builder",
    hosts: customHosts,
  });
  assert.equal(res.status, "BLOCKED");
  assert.match(res.reason, /kit_guard_run evidence missing/);
  assert.match(res.reason, /tests\/nonexistent\/evidence\.txt/);
});

test("synthetic host with subagents 'UNKNOWN' returns BLOCKED naming subagents", () => {
  const customHosts = {
    "unverified-subagents-host": Object.freeze({
      subagents: "UNKNOWN",
      pretooluse_hook: "UNKNOWN",
      hook_failure: "UNKNOWN",
      scene_builder_enforcement: "UNKNOWN",
      evidence: null,
      corroborate: null,
      kit_guard_run: "tests/slice/evidence/ac17-hook.final.txt",
    }),
  };
  const res = checkStage({
    host: "unverified-subagents-host",
    stage: "scene-builder",
    hosts: customHosts,
  });
  assert.equal(res.status, "BLOCKED");
  assert.match(res.reason, /subagents not VERIFIED-RUN/);
});

test("real antigravity host returns BLOCKED naming kit_guard_run and subagents requirements", () => {
  const res = checkStage({ host: "antigravity", stage: "scene-builder" });
  assert.equal(res.status, "BLOCKED");
  assert.equal(res.host, "antigravity");
  assert.equal(res.stage, "scene-builder");
  assert.equal(res.reason, "kit_guard_run evidence missing; subagents not VERIFIED-RUN");
});
