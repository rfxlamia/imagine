import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { adapt } from "./scene-builder-scope-grok.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const entry = join(here, "scene-builder-scope.mjs");
const PREFIX = "HYPERFRAMES_NO_TELEMETRY=1 ";

function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), "imagine-grok-"));
  const shadow = join(cwd, ".imagine", "p1", "stage", "edit", "s02");
  mkdirSync(join(shadow, "compositions"), { recursive: true });
  return { cwd, shadow };
}

const scene = (cwd, tool_name, tool_input, extra = {}) => adapt({
  cwd,
  subagentType: "imagine:scene-builder",
  tool_name,
  tool_input,
  ...extra,
}, {});

function runEntry(input, extraEnv = {}) {
  const env = { PATH: process.env.PATH, GROK_HOOK_EVENT: "pre_tool_use", ...extraEnv };
  if (!Object.prototype.hasOwnProperty.call(extraEnv, "CLAUDE_PROJECT_DIR")) delete env.CLAUDE_PROJECT_DIR;
  return spawnSync(process.execPath, [entry], {
    input: JSON.stringify(input),
    encoding: "utf8",
    env,
  });
}

test("search_replace inside the shadow is allowed and does not rewrite the input", () => {
  const { cwd, shadow } = fixture();
  const file_path = join(shadow, "compositions", "s02.html");
  const r = scene(cwd, "search_replace", { file_path, old_string: "a", new_string: "b" });
  assert.equal(r.decision, "allow");
  assert.equal(r.updatedInput, undefined);
});

test("search_replace outside the shadow is denied", () => {
  const { cwd } = fixture();
  const r = scene(cwd, "search_replace", { file_path: join(cwd, ".imagine", "p1", "STORY.md"), old_string: "a", new_string: "b" });
  assert.equal(r.decision, "deny");
  assert.equal(r.updatedInput, undefined);
});

test("write and hashline_edit outside the shadow are denied", () => {
  const { cwd } = fixture();
  for (const tool_name of ["write", "hashline_edit"]) {
    const r = scene(cwd, tool_name, { file_path: join(cwd, "outside.html"), content: "x" });
    assert.equal(r.decision, "deny", tool_name);
    assert.equal(r.updatedInput, undefined, tool_name);
  }
});

test("read_file, grep and list_dir stay allowed outside the shadow", () => {
  const { cwd } = fixture();
  for (const tool_name of ["read_file", "grep", "list_dir"]) {
    assert.equal(scene(cwd, tool_name, { target_file: join(cwd, "x") }).decision, "allow", tool_name);
  }
});

test("an unmapped tool name is denied for scene-builder", () => {
  const { cwd } = fixture();
  const r = scene(cwd, "web_search", { query: "hyperframes" });
  assert.equal(r.decision, "deny");
  assert.equal(r.updatedInput, undefined);
});

test("an allowed hyperframes command gains one telemetry prefix", () => {
  const { cwd, shadow } = fixture();
  const command = `npx hyperframes@0.8.223 lint ${shadow}`;
  const r = scene(cwd, "run_terminal_command", { command, description: "lint shot" });
  assert.equal(r.decision, "allow");
  assert.equal(r.updatedInput.command, `${PREFIX}${command}`);
  assert.equal(r.updatedInput.description, "lint shot");
  assert.equal(r.updatedInput.command.split(PREFIX).length - 1, 1);
});

test("a command that already has the prefix is not doubled and still obeys decide", () => {
  const { cwd, shadow } = fixture();
  const bare = `npx hyperframes@0.8.223 lint ${shadow}`;
  const once = scene(cwd, "run_terminal_command", { command: `${PREFIX}${bare}`, description: "lint shot" });
  assert.equal(once.decision, "allow");
  assert.equal(once.updatedInput.command, `${PREFIX}${bare}`);
  assert.equal(once.updatedInput.description, "lint shot");

  const blocked = scene(cwd, "run_terminal_command", { command: `${PREFIX}rm -rf /` });
  assert.equal(blocked.decision, "deny");
  assert.equal(blocked.updatedInput, undefined);

  const doubled = scene(cwd, "run_terminal_command", { command: `${PREFIX}${PREFIX}${bare}` });
  assert.equal(doubled.decision, "deny");
  assert.equal(doubled.updatedInput, undefined);
});

test("a truncated scene-builder call is denied with no rewrite", () => {
  const { cwd, shadow } = fixture();
  const r = scene(cwd, "write", { file_path: join(shadow, "compositions", "a.html") }, { toolInputTruncated: true });
  assert.equal(r.decision, "deny");
  assert.match(r.reason, /truncated/);
  assert.equal(r.updatedInput, undefined);
});

test("another subagent type passes through", () => {
  const { cwd } = fixture();
  const r = adapt({
    cwd,
    subagentType: "imagine:previz-designer",
    tool_name: "write",
    tool_input: { file_path: join(cwd, "x") },
  }, {});
  assert.equal(r.decision, "pass");
  assert.equal(r.updatedInput, undefined);
});

test("agent_type alone does not select the scene-builder guard", () => {
  const { cwd, shadow } = fixture();
  const r = adapt({
    cwd,
    agent_type: "imagine:scene-builder",
    tool_name: "write",
    tool_input: { file_path: join(shadow, "compositions", "a.html") },
  }, {});
  assert.equal(r.decision, "pass");
});

test("entry prints allow and deny without a rewrite for search_replace", () => {
  const { cwd, shadow } = fixture();
  const inside = runEntry({
    cwd,
    subagentType: "imagine:scene-builder",
    tool_name: "search_replace",
    tool_input: { file_path: join(shadow, "compositions", "s02.html"), old_string: "a", new_string: "b" },
  });
  assert.equal(inside.status, 0, inside.stderr);
  const insideBody = JSON.parse(inside.stdout);
  assert.equal(insideBody.hookSpecificOutput.permissionDecision, "allow");
  assert.equal(insideBody.hookSpecificOutput.updatedInput, undefined);

  const outside = runEntry({
    cwd,
    subagentType: "imagine:scene-builder",
    tool_name: "search_replace",
    tool_input: { file_path: join(cwd, ".imagine", "p1", "STORY.md"), old_string: "a", new_string: "b" },
  });
  assert.equal(outside.status, 0, outside.stderr);
  const outsideBody = JSON.parse(outside.stdout);
  assert.equal(outsideBody.hookSpecificOutput.permissionDecision, "deny");
  assert.equal(outsideBody.hookSpecificOutput.updatedInput, undefined);
});

test("entry rewrites an allowed command and leaves a denied command untouched", () => {
  const { cwd, shadow } = fixture();
  const command = `npx hyperframes@0.8.223 lint ${shadow}`;
  const allowed = runEntry({
    cwd,
    subagentType: "imagine:scene-builder",
    tool_name: "run_terminal_command",
    tool_input: { command, description: "lint shot" },
  });
  assert.equal(allowed.status, 0, allowed.stderr);
  const allowedBody = JSON.parse(allowed.stdout);
  assert.equal(allowedBody.hookSpecificOutput.permissionDecision, "allow");
  assert.equal(allowedBody.hookSpecificOutput.updatedInput.command, `${PREFIX}${command}`);
  assert.equal(allowedBody.hookSpecificOutput.updatedInput.description, "lint shot");

  const denied = runEntry({
    cwd,
    subagentType: "imagine:scene-builder",
    tool_name: "run_terminal_command",
    tool_input: { command: "rm -rf /" },
  });
  assert.equal(denied.status, 0, denied.stderr);
  const deniedBody = JSON.parse(denied.stdout);
  assert.equal(deniedBody.hookSpecificOutput.permissionDecision, "deny");
  assert.equal(deniedBody.hookSpecificOutput.updatedInput, undefined);
});

test("entry writes nothing when the subagent is not scene-builder", () => {
  const { cwd } = fixture();
  const r = runEntry({
    cwd,
    subagentType: "imagine:previz-designer",
    tool_name: "write",
    tool_input: { file_path: join(cwd, "x") },
  });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, "");
});

test("entry exits 2 when grok stdin is unreadable", () => {
  const env = { PATH: process.env.PATH, GROK_HOOK_EVENT: "pre_tool_use" };
  const r = spawnSync(process.execPath, [entry], { input: "not json", encoding: "utf8", env });
  assert.equal(r.status, 2);
  assert.equal(r.stdout, "");
  assert.match(r.stderr, /unreadable hook input/);
});

test("entry exits 2 when the grok module cannot load", () => {
  const dir = mkdtempSync(join(tmpdir(), "imagine-grok-noload-"));
  copyFileSync(entry, join(dir, "scene-builder-scope.mjs"));
  const r = spawnSync(process.execPath, [join(dir, "scene-builder-scope.mjs")], {
    input: "{}",
    encoding: "utf8",
    env: { PATH: process.env.PATH, GROK_HOOK_EVENT: "pre_tool_use" },
  });
  assert.equal(r.status, 2);
  assert.equal(r.stdout, "");
  assert.match(r.stderr, /hook failed/);
});

test("grok tests do not rewrite the claude env contract file", () => {
  const hooks = readFileSync(join(here, "hooks.json"), "utf8");
  assert.match(hooks, /\$\{CLAUDE_PLUGIN_ROOT\}\/hooks\/scene-builder-scope\.mjs/);
  assert.doesNotMatch(hooks, /scene-builder-scope-grok/);
});

test("doubled telemetry prefix in grok adapter is denied with reason doubled telemetry prefix", () => {
  const { cwd, shadow } = fixture();
  const bare = `npx hyperframes@0.8.223 lint ${shadow}`;
  const doubled = scene(cwd, "run_terminal_command", { command: `${PREFIX}${PREFIX}${bare}` });
  assert.equal(doubled.decision, "deny");
  assert.equal(doubled.reason, "doubled telemetry prefix");
  assert.equal(doubled.updatedInput, undefined);
});

test("grok adapter denies commands with leading whitespace or BOM before telemetry prefix", () => {
  const { cwd, shadow } = fixture();
  const bare = `npx hyperframes@0.8.223 lint ${shadow}`;

  const singleSpace = scene(cwd, "run_terminal_command", { command: ` ${PREFIX}${bare}` });
  assert.equal(singleSpace.decision, "deny");
  assert.equal(singleSpace.reason, "doubled telemetry prefix");
  assert.equal(singleSpace.updatedInput, undefined);

  const twoSpaces = scene(cwd, "run_terminal_command", { command: `  ${PREFIX}${bare}` });
  assert.equal(twoSpaces.decision, "deny");
  assert.equal(twoSpaces.reason, "doubled telemetry prefix");
  assert.equal(twoSpaces.updatedInput, undefined);

  const nbsp = scene(cwd, "run_terminal_command", { command: `\u00a0${PREFIX}${bare}` });
  assert.equal(nbsp.decision, "deny");
  assert.equal(nbsp.reason, "doubled telemetry prefix");
  assert.equal(nbsp.updatedInput, undefined);

  const bom = scene(cwd, "run_terminal_command", { command: `\ufeff${PREFIX}${bare}` });
  assert.equal(bom.decision, "deny");
  assert.equal(bom.reason, "doubled telemetry prefix");
  assert.equal(bom.updatedInput, undefined);
});

test("grok adapter still allows and re-adds a single prefix for PREFIX + bare", () => {
  const { cwd, shadow } = fixture();
  const bare = `npx hyperframes@0.8.223 lint ${shadow}`;
  const res = scene(cwd, "run_terminal_command", { command: `${PREFIX}${bare}`, description: "lint shot" });
  assert.equal(res.decision, "allow");
  assert.equal(res.updatedInput.command, `${PREFIX}${bare}`);
  assert.equal(res.updatedInput.description, "lint shot");
});
