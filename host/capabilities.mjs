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
  }),
  "grok": Object.freeze({
    subagents: "UNKNOWN",
    pretooluse_hook: "VERIFIED-TEST",
    hook_failure: "UNKNOWN",
    scene_builder_enforcement: "UNKNOWN",
    evidence: "hooks/scene-builder-scope.grok.test.mjs",
    corroborate: null,
  }),
  "antigravity": Object.freeze({
    subagents: "UNKNOWN",
    pretooluse_hook: "UNKNOWN",
    hook_failure: "UNKNOWN",
    scene_builder_enforcement: "UNKNOWN",
    evidence: null,
    corroborate: null,
  }),
  "cursor": Object.freeze({
    subagents: "UNKNOWN",
    pretooluse_hook: "UNKNOWN",
    hook_failure: "UNKNOWN",
    scene_builder_enforcement: "UNKNOWN",
    evidence: null,
    corroborate: null,
  }),
  "pi": Object.freeze({
    subagents: "UNKNOWN",
    pretooluse_hook: "UNKNOWN",
    hook_failure: "UNKNOWN",
    scene_builder_enforcement: "UNKNOWN",
    evidence: null,
    corroborate: null,
  }),
});

export const PROTECTED_STAGES = Object.freeze(["scene-builder"]);

export function checkStage({ host, stage, env = process.env } = {}) {
  if (typeof stage !== "string" || !PROTECTED_STAGES.includes(stage)) {
    throw new TypeError(`unknown stage: ${stage}`);
  }

  if (typeof host !== "string" || host === "" || !Object.prototype.hasOwnProperty.call(HOSTS, host)) {
    return {
      status: "BLOCKED",
      host,
      stage,
      reason: "unknown host id; no verified enforcement",
    };
  }

  const entry = HOSTS[host];
  const missing = [];
  if (entry.scene_builder_enforcement !== "VERIFIED-RUN") {
    missing.push(`scene_builder_enforcement (${entry.scene_builder_enforcement})`);
  }
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
    reason: null,
  };
}
