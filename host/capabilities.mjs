import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const HOST_IDS = Object.freeze([
  "claude-code",
  "grok",
  "antigravity",
  "cursor",
  "pi",
]);

export const HOSTS = Object.freeze({
  "claude-code": Object.freeze({
    subagents: "VERIFIED-RUN",
    pretooluse_hook: "VERIFIED-RUN",
    hook_failure: "block",
    scene_builder_enforcement: "VERIFIED-RUN",
    evidence: "tests/slice/evidence/ac17-hook.final.txt",
    corroborate: Object.freeze({ name: "CLAUDECODE", value: "1" }),
    kit_guard_run: null,
  }),
  "grok": Object.freeze({
    subagents: "UNKNOWN",
    pretooluse_hook: "VERIFIED-TEST",
    hook_failure: "UNKNOWN",
    scene_builder_enforcement: "UNKNOWN",
    evidence: "hooks/scene-builder-scope.grok.test.mjs",
    corroborate: null,
    kit_guard_run: null,
  }),
  "antigravity": Object.freeze({
    subagents: "VERIFIED-RUN",
    pretooluse_hook: "UNKNOWN",
    hook_failure: "UNKNOWN",
    scene_builder_enforcement: "UNKNOWN",
    evidence: "docs/harnesses/evidence/antigravity-8b-run.md",
    corroborate: null,
    kit_guard_run: "docs/harnesses/evidence/antigravity-8b-run.md",
  }),
  "cursor": Object.freeze({
    subagents: "UNKNOWN",
    pretooluse_hook: "UNKNOWN",
    hook_failure: "UNKNOWN",
    scene_builder_enforcement: "UNKNOWN",
    evidence: null,
    corroborate: null,
    kit_guard_run: null,
  }),
  "pi": Object.freeze({
    subagents: "UNKNOWN",
    pretooluse_hook: "UNKNOWN",
    hook_failure: "UNKNOWN",
    scene_builder_enforcement: "UNKNOWN",
    evidence: null,
    corroborate: null,
    kit_guard_run: null,
  }),
});

// checkStage cannot run the test, it only refuses to pass when the test that proves the guard is missing.
export const KIT_GUARD_TEST_FILE = "packages/imagine-kit/test/guard-integration.test.mjs";

export const PROTECTED_STAGES = Object.freeze(["scene-builder"]);

export function checkStage({
  host,
  stage,
  env = process.env,
  hosts = HOSTS,
  rootDir,
} = {}) {
  if (typeof stage !== "string" || !PROTECTED_STAGES.includes(stage)) {
    throw new TypeError(`unknown stage: ${stage}`);
  }

  if (typeof host !== "string" || host === "" || !Object.prototype.hasOwnProperty.call(hosts, host)) {
    return {
      status: "BLOCKED",
      host,
      stage,
      reason: "unknown host id; no verified enforcement",
    };
  }

  const entry = hosts[host];

  // a) The branch is chosen by the host's OWN claim. If entry.scene_builder_enforcement === "VERIFIED-RUN"
  // (the host claims a write hook), ONLY the existing hook path may pass, with all three existing
  // conditions unchanged (hook verified, hook_failure === "block", env corroboration).
  // On failure it stays BLOCKED with today's reasons. It must NEVER fall through to the kit-guard path.
  if (entry.scene_builder_enforcement === "VERIFIED-RUN") {
    const missing = [];
    if (entry.hook_failure !== "block") {
      missing.push(`hook_failure (${entry.hook_failure})`);
    }

    if (missing.length > 0) {
      return {
        status: "BLOCKED",
        host,
        stage,
        reason: `missing verified enforcement evidence: ${missing.join(", ")}`,
      };
    }

    const corroborated =
      Boolean(entry.corroborate) &&
      Object.prototype.hasOwnProperty.call(env ?? {}, entry.corroborate.name) &&
      env[entry.corroborate.name] === entry.corroborate.value;

    if (!corroborated) {
      return {
        status: "BLOCKED",
        host,
        stage,
        reason: "host claim not corroborated by environment",
      };
    }

    return {
      status: "ok",
      host,
      stage,
      isolation: "hook",
      reason: null,
    };
  }

  // b) Hosts with no hook claim may pass only via the kit-guard path, which requires ALL of:
  // - entry.subagents === "VERIFIED-RUN"
  // - entry.kit_guard_run is a repo-relative evidence path which EXISTS on disk (resolve from plugin root)
  // - kit guard test file packages/imagine-kit/test/guard-integration.test.mjs exists on disk
  const effectiveRoot = rootDir ?? resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const missing = [];

  const testFile = resolve(effectiveRoot, KIT_GUARD_TEST_FILE);
  if (!existsSync(testFile)) {
    missing.push(`kit guard test file missing (${KIT_GUARD_TEST_FILE})`);
  }

  if (!entry.kit_guard_run) {
    missing.push("kit_guard_run evidence missing");
  } else {
    const evidencePath = resolve(effectiveRoot, entry.kit_guard_run);
    if (!existsSync(evidencePath)) {
      missing.push(`kit_guard_run evidence missing (${entry.kit_guard_run})`);
    }
  }

  if (entry.subagents !== "VERIFIED-RUN") {
    missing.push("subagents not VERIFIED-RUN");
  }

  if (missing.length > 0) {
    return {
      status: "BLOCKED",
      host,
      stage,
      reason: missing.join("; "),
    };
  }

  return {
    status: "ok",
    host,
    stage,
    isolation: "kit-guard",
    coverage: "detective; detects changes to canon, plan inputs and media after stage-shot; does not prevent writes",
    reason: null,
  };
}
