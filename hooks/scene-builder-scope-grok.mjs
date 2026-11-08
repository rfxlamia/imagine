// Grok PreToolUse adapter. Claude Code never loads this module.
// It translates Grok tool names and subagentType, then calls decide().
// Path checks and the HyperFrames allowlist stay in scene-builder-scope-lib.mjs.
import { readFileSync } from "node:fs";
import { decide, SCENE_BUILDER_TYPES } from "./scene-builder-scope-lib.mjs";

const TOOL_NAMES = {
  read_file: "Read",
  grep: "Grep",
  list_dir: "Glob",
  search_replace: "Edit",
  hashline_edit: "Edit",
  write: "Write",
  run_terminal_command: "Bash",
};

export const TELEMETRY_PREFIX = "HYPERFRAMES_NO_TELEMETRY=1 ";

function objectInput(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function grokToolName(input) {
  if (typeof input?.tool_name === "string") return input.tool_name;
  if (typeof input?.toolName === "string") return input.toolName;
  return "";
}

// Drop at most one exact telemetry assignment so decide() sees the bare command.
// The assignment is put back only after decide() allows that same remainder.
function commandForDecide(claudeName, toolInput) {
  const command = toolInput?.command;
  if (claudeName !== "Bash" || typeof command !== "string" || !command.startsWith(TELEMETRY_PREFIX)) {
    return { toolInput, remainder: command };
  }
  const remainder = command.slice(TELEMETRY_PREFIX.length);
  return { toolInput: { ...toolInput, command: remainder }, remainder };
}

export function adapt(input, env = process.env) {
  const subagentType = input?.subagentType;
  if (!SCENE_BUILDER_TYPES.includes(subagentType)) return { decision: "pass", reason: "" };
  if (input?.toolInputTruncated === true) {
    return { decision: "deny", reason: "scene-builder hook input is truncated" };
  }

  const grokName = grokToolName(input);
  const claudeName = Object.prototype.hasOwnProperty.call(TOOL_NAMES, grokName) ? TOOL_NAMES[grokName] : grokName;
  const original = objectInput(input?.tool_input) ?? objectInput(input?.toolInput);
  const prepared = commandForDecide(claudeName, original);
  const telemetryToken = TELEMETRY_PREFIX.trim();
  if (claudeName === "Bash" && typeof prepared.remainder === "string" && prepared.remainder.includes(telemetryToken)) {
    return { decision: "deny", reason: "doubled telemetry prefix" };
  }
  const decision = decide({
    cwd: input?.cwd,
    agent_type: subagentType,
    tool_name: claudeName,
    tool_input: prepared.toolInput ?? undefined,
  }, env);
  if (decision.decision !== "allow" || claudeName !== "Bash" || typeof prepared.remainder !== "string" || original === null) {
    return decision;
  }
  return {
    ...decision,
    updatedInput: { ...original, command: `${TELEMETRY_PREFIX}${prepared.remainder}` },
  };
}

export function main() {
  let input;
  try {
    input = JSON.parse(readFileSync(0, "utf8"));
  } catch (e) {
    process.stderr.write(`scene-builder-scope: unreadable hook input (${e.message}); blocked\n`);
    process.exitCode = 2;
    return;
  }
  const result = adapt(input);
  if (result.decision === "pass") return;
  const hookSpecificOutput = {
    hookEventName: "PreToolUse",
    permissionDecision: result.decision,
    permissionDecisionReason: result.reason,
  };
  if (result.decision === "allow" && result.updatedInput) hookSpecificOutput.updatedInput = result.updatedInput;
  process.stdout.write(JSON.stringify({ hookSpecificOutput }));
}
