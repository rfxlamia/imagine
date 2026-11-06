// Grok SessionStart adapter. Claude Code never loads this module.
// Grok does not source CLAUDE_ENV_FILE. The Grok PreToolUse adapter adds
// HYPERFRAMES_NO_TELEMETRY=1 to an allowed HyperFrames command instead.
export function main() {
  return { ok: true };
}
