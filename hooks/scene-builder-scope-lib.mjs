// PreToolUse hook logic: confines the scene-builder subagent to its shadow project
// (.imagine/<project>/stage/edit/<shot>/). Other agents pass through untouched.
// Scene-builder is restricted to an allowlist of tools:
// - Read-only tools (Read, Glob, Grep) are allowed.
// - File mutation tools (Write, Edit, MultiEdit) require file_path inside shadow
//   and deny if notebook_path is present.
// - NotebookEdit requires notebook_path inside shadow and denies if file_path is present.
// - Bash is restricted to 'npx hyperframes@0.8.223 lint|snapshot|check|validate'
//   with a typed per-subcommand flag allowlist and exactly one required shadow DIR positional.
// - SubagentHandback (exact name) is allowed: it only carries the final report to the parent agent.
// All other tools are denied.
// Path validation splits into two predicates:
// - insideShadowWrite: strictly below the shadow root (rejects writing the shadow root itself)
//   and guards against hard links to external files (rejects existing non-directories with nlink > 1).
// - insideShadowArg: the shadow root itself or below it (for Bash arguments).
// Both reject non-normalised paths, relative paths, non-shadow paths, and symlinks.
// Unreadable stdin blocks every caller (exit 2).
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";

export const SCENE_BUILDER_TYPES = ["imagine:scene-builder", "scene-builder"];
const READ_ONLY_TOOLS = new Set(["Read", "Glob", "Grep"]);
const WRITE_TOOLS = new Set(["Write", "Edit", "MultiEdit"]);
const ALLOWED = ".imagine/<project>/stage/edit/s<NN>/";
const BASH_PREFIX = ["npx", "hyperframes@0.8.223"];
const BASH_SUBCOMMANDS = new Set(["lint", "snapshot", "check", "validate"]);
const TOKEN_RE = /^[A-Za-z0-9._/=:,@+-]+$/;
const SHADOW_WRITE_RE = /^[^/]+\/stage\/edit\/s\d{2}\/.+$/;
const SHADOW_ARG_RE = /^[^/]+\/stage\/edit\/s\d{2}(\/.+)?$/;

const INT_RE = /^[0-9]+$/;
const NUM_RE = /^[0-9]+(\.[0-9]+)?$/;
const NUMLIST_RE = /^[0-9]+(\.[0-9]+)?(,[0-9]+(\.[0-9]+)?)*$/;

const SUBCOMMAND_FLAGS = {
  lint: { json: "bool", verbose: "bool" },
  snapshot: {
    output: "outdir", frames: "int", at: "numlist", timeout: "int", "zoom-scale": "num",
    end: "bool", "no-end": "bool", keep: "bool", review: "bool", json: "bool",
  },
  check: {
    json: "bool", "at-transitions": "bool", "collapse-static": "bool", "no-collapse-static": "bool",
    contrast: "bool", "no-contrast": "bool", strict: "bool", snapshots: "bool",
    samples: "int", "max-transition-samples": "int", "max-issues": "int", tolerance: "int",
    at: "numlist", timeout: "int",
  },
  validate: { json: "bool", contrast: "bool", "no-contrast": "bool", timeout: "int" },
};
const SHORT_ALIASES = { snapshot: { o: "output" } };

const deny = (reason) => ({ decision: "deny", reason });

export function shadowRel(cwd, p) {
  if (typeof p !== "string" || !p.startsWith("/") || p !== resolve(p)) return null;
  const abs = resolve(p);
  const realCwd = realpathSync(cwd);
  const components = abs.split("/").filter(Boolean);
  let canonical = null;
  for (let k = 1; k <= components.length; k++) {
    const head = "/" + components.slice(0, k).join("/");
    try {
      if (realpathSync(head) === realCwd) {
        canonical = k === components.length ? realCwd : realCwd + "/" + components.slice(k).join("/");
        break;
      }
    } catch {
      continue;
    }
  }
  if (!canonical) return null;

  const prefixBase = realCwd + "/.imagine/";
  if (!canonical.startsWith(prefixBase)) return null;
  const rel = canonical.slice(prefixBase.length);

  let prefix = realCwd + "/.imagine";
  const segments = rel.split("/");
  const prefixes = [prefix];
  for (const seg of segments) {
    prefix += "/" + seg;
    prefixes.push(prefix);
  }

  for (const item of prefixes) {
    try {
      const st = lstatSync(item);
      if (st.isSymbolicLink()) return null;
    } catch (e) {
      if (e.code === "ENOENT") break;
      throw e;
    }
  }
  return { rel, canonical };
}

export function insideShadowWrite(cwd, p) {
  const info = shadowRel(cwd, p);
  if (info === null || !SHADOW_WRITE_RE.test(info.rel)) return false;
  try {
    const st = lstatSync(info.canonical);
    if (!st.isDirectory() && st.nlink > 1) return false;
  } catch (e) {
    if (e.code === "ENOENT") return true;
    throw e;
  }
  return true;
}

export function insideShadowArg(cwd, p) {
  const info = shadowRel(cwd, p);
  return info !== null && SHADOW_ARG_RE.test(info.rel);
}

function decideWrite(cwd, toolInput) {
  if (!toolInput || typeof toolInput !== "object") return deny("scene-builder write without input");
  if ("notebook_path" in toolInput && toolInput.notebook_path !== undefined) {
    return deny("scene-builder write with notebook_path present");
  }
  const file = toolInput.file_path;
  if (typeof file !== "string" || file === "") return deny("scene-builder write without a path");
  return insideShadowWrite(cwd, file)
    ? { decision: "allow", reason: "inside shadow project" }
    : deny(`scene-builder may only write inside ${ALLOWED}; got ${file}`);
}

function decideNotebookEdit(cwd, toolInput) {
  if (!toolInput || typeof toolInput !== "object") return deny("scene-builder write without input");
  if ("file_path" in toolInput && toolInput.file_path !== undefined) {
    return deny("scene-builder NotebookEdit with file_path present");
  }
  const file = toolInput.notebook_path;
  if (typeof file !== "string" || file === "") return deny("scene-builder write without a path");
  return insideShadowWrite(cwd, file)
    ? { decision: "allow", reason: "inside shadow project" }
    : deny(`scene-builder may only write inside ${ALLOWED}; got ${file}`);
}

function checkValueType(cwd, type, value) {
  if (typeof value !== "string" || value === "") return false;
  if (type === "int") return INT_RE.test(value);
  if (type === "num") return NUM_RE.test(value);
  if (type === "numlist") return NUMLIST_RE.test(value);
  if (type === "outdir") return insideShadowWrite(cwd, value);
  return false;
}

function decideBash(cwd, command) {
  const usage = `scene-builder Bash is limited to 'npx hyperframes@0.8.223 lint|snapshot|check|validate' with absolute paths inside ${ALLOWED}`;
  if (typeof command !== "string" || /[\r\n\t]/.test(command)) return deny(usage);
  const tokens = command.trim().split(" ");
  if (tokens.some((t) => t === "" || !TOKEN_RE.test(t))) return deny(usage);
  if (tokens[0] !== BASH_PREFIX[0] || tokens[1] !== BASH_PREFIX[1] || !BASH_SUBCOMMANDS.has(tokens[2])) {
    return deny(usage);
  }
  const sub = tokens[2];
  const flagTable = SUBCOMMAND_FLAGS[sub] || {};
  const aliases = SHORT_ALIASES[sub] || {};
  let dirCount = 0;

  for (let i = 3; i < tokens.length; i++) {
    const token = tokens[i];
    const mAssign = token.match(/^--([a-z][a-z-]*)=(.*)$/);
    if (mAssign) {
      const name = mAssign[1];
      const value = mAssign[2];
      if (value === "") return deny(usage);
      const type = flagTable[name];
      if (!type || type === "bool") return deny(usage);
      if (!checkValueType(cwd, type, value)) return deny(usage);
      continue;
    }

    const mLong = token.match(/^--([a-z][a-z-]*)$/);
    if (mLong) {
      const name = mLong[1];
      const type = flagTable[name];
      if (!type) return deny(usage);
      if (type === "bool") continue;
      i++;
      if (i >= tokens.length) return deny(usage);
      const value = tokens[i];
      if (!checkValueType(cwd, type, value)) return deny(usage);
      continue;
    }

    const mShort = token.match(/^-([a-z])$/);
    if (mShort) {
      const shortName = mShort[1];
      const name = aliases[shortName];
      if (!name) return deny(usage);
      const type = flagTable[name];
      if (!type) return deny(usage);
      if (type === "bool") continue;
      i++;
      if (i >= tokens.length) return deny(usage);
      const value = tokens[i];
      if (!checkValueType(cwd, type, value)) return deny(usage);
      continue;
    }

    if (token.startsWith("-")) {
      return deny(usage);
    }

    if (dirCount > 0) return deny(usage);
    if (!insideShadowArg(cwd, token)) return deny(usage);
    dirCount++;
  }

  if (dirCount !== 1) return deny(usage);
  return { decision: "allow", reason: "allowed hyperframes command" };
}

export function decide(input) {
  if (!SCENE_BUILDER_TYPES.includes(input?.agent_type)) return { decision: "pass", reason: "" };
  try {
    if (typeof input.cwd !== "string" || input.cwd === "") return deny("scene-builder call without cwd");
    if (READ_ONLY_TOOLS.has(input.tool_name)) return { decision: "allow", reason: "read-only tool" };
    if (WRITE_TOOLS.has(input.tool_name)) return decideWrite(input.cwd, input.tool_input);
    if (input.tool_name === "NotebookEdit") return decideNotebookEdit(input.cwd, input.tool_input);
    if (input.tool_name === "SubagentHandback") return { decision: "allow", reason: "report to the parent agent" };
    if (input.tool_name === "Bash") return decideBash(input.cwd, input.tool_input?.command);
    return deny(`scene-builder may not use ${input.tool_name}`);
  } catch (e) {
    return deny(`scene-builder scope check failed (${e.message}); denied`);
  }
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
  const r = decide(input);
  if (r.decision === "pass") return;
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: r.decision,
      permissionDecisionReason: r.reason,
    },
  }));
}
