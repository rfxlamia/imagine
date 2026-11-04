// SessionStart hook logic: persist HYPERFRAMES_NO_TELEMETRY=1 for every Bash
// command of the session through CLAUDE_ENV_FILE. scene-builder runs bare
// `npx hyperframes@0.8.223 ...` commands (its PreToolUse hook denies an env
// prefix), so the variable has to come from the session environment instead.
import { appendFileSync, existsSync, readFileSync } from "node:fs";

export const ENV_LINE = "export HYPERFRAMES_NO_TELEMETRY=1";

// Appends ENV_LINE to envFile once. Returns { ok, changed } or { ok: false, reason }.
export function persistEnv(envFile) {
  if (!envFile) {
    return { ok: false, reason: "CLAUDE_ENV_FILE is not set; HYPERFRAMES_NO_TELEMETRY=1 is not active for this session" };
  }
  const prior = existsSync(envFile) ? readFileSync(envFile, "utf8") : "";
  if (prior.split(/\r?\n/).some((line) => line.trim() === ENV_LINE)) return { ok: true, changed: false };
  const sep = prior === "" || prior.endsWith("\n") ? "" : "\n";
  appendFileSync(envFile, `${sep}${ENV_LINE}\n`);
  return { ok: true, changed: true };
}

// Writes nothing to stdout: SessionStart stdout is added to Claude's context.
// A failure exits 1, which Claude Code reports as a non-blocking hook error.
export function main(env = process.env) {
  let result;
  try {
    result = persistEnv(env.CLAUDE_ENV_FILE);
  } catch (e) {
    result = { ok: false, reason: `could not write CLAUDE_ENV_FILE (${e?.message ?? e}); HYPERFRAMES_NO_TELEMETRY=1 is not active for this session` };
  }
  if (!result.ok) {
    process.stderr.write(`imagine session-env: ${result.reason}\n`);
    process.exitCode = 1;
  }
  return result;
}
