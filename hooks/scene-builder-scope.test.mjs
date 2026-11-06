import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, linkSync, mkdtempSync, mkdirSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { decide } from "./scene-builder-scope-lib.mjs";

function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), "imagine-hook-"));
  const shadow = join(cwd, ".imagine", "p1", "stage", "edit", "s02");
  mkdirSync(join(shadow, "compositions"), { recursive: true });
  return { cwd, shadow };
}
// The env is explicit so the real process env never leaks into a decision.
const sb = (cwd, tool_name, tool_input, env = {}) =>
  decide({ cwd, tool_name, tool_input, agent_id: "a1", agent_type: "imagine:scene-builder" }, env);
const bash = (cwd, command, env = {}) => sb(cwd, "Bash", { command }, env);

test("scene-builder may write inside its shadow project", () => {
  const { cwd, shadow } = fixture();
  assert.equal(sb(cwd, "Write", { file_path: join(shadow, "compositions", "s02.html") }).decision, "allow");
});

test("scene-builder may not write STORY.md", () => {
  const { cwd } = fixture();
  const r = sb(cwd, "Edit", { file_path: join(cwd, ".imagine", "p1", "STORY.md") });
  assert.equal(r.decision, "deny");
  assert.match(r.reason, /stage\/edit\//);
});

test("dot-dot escape is denied", () => {
  const { cwd, shadow } = fixture();
  assert.equal(sb(cwd, "Write", { file_path: join(shadow, "..", "..", "..", "bible.yaml") }).decision, "deny");
});

test("symlinked ancestor resolving outside is denied", () => {
  const { cwd, shadow } = fixture();
  const outside = mkdtempSync(join(tmpdir(), "imagine-out-"));
  symlinkSync(outside, join(shadow, "link"));
  assert.equal(sb(cwd, "Write", { file_path: join(shadow, "link", "x.html") }).decision, "deny");
});

test("missing cwd is denied for scene-builder", () => {
  assert.equal(decide({ tool_name: "Write", tool_input: { file_path: "/x" }, agent_type: "imagine:scene-builder" }, {}).decision, "deny");
});

test("nonexistent cwd is denied, not thrown", () => {
  assert.equal(sb("/nonexistent-imagine-dir", "Write", { file_path: "/nonexistent-imagine-dir/.imagine/p/stage/edit/s01/a" }).decision, "deny");
});

test("allowed hyperframes bash command inside shadow", () => {
  const { cwd, shadow } = fixture();
  assert.equal(bash(cwd, `npx hyperframes@0.8.223 lint ${shadow}`).decision, "allow");
});

test("snapshot with numeric flag values and shadow output is allowed", () => {
  const { cwd, shadow } = fixture();
  assert.equal(bash(cwd, `npx hyperframes@0.8.223 snapshot ${shadow} --at 0.5,1.5 -o ${shadow}/snaps`).decision, "allow");
});

test("bash with redirection is denied", () => {
  const { cwd, shadow } = fixture();
  assert.equal(bash(cwd, `npx hyperframes@0.8.223 lint ${shadow} > ${cwd}/x`).decision, "deny");
});

test("newline-injected second command is denied", () => {
  const { cwd, shadow } = fixture();
  assert.equal(bash(cwd, `npx hyperframes@0.8.223 lint ${shadow}\nrm -rf .`).decision, "deny");
});

test("relative output dir outside shadow is denied", () => {
  const { cwd, shadow } = fixture();
  assert.equal(bash(cwd, `npx hyperframes@0.8.223 snapshot ${shadow} -o ..`).decision, "deny");
});

test("flag=value pointing elsewhere is denied", () => {
  const { cwd, shadow } = fixture();
  assert.equal(bash(cwd, `npx hyperframes@0.8.223 snapshot ${shadow} --output=/elsewhere`).decision, "deny");
});

test("tilde path is denied", () => {
  const { cwd, shadow } = fixture();
  assert.equal(bash(cwd, `npx hyperframes@0.8.223 snapshot ${shadow} -o ~/x`).decision, "deny");
});

test("other bash is denied", () => {
  const { cwd } = fixture();
  assert.equal(bash(cwd, "rm -rf .imagine").decision, "deny");
});

test("other agent types pass through", () => {
  const { cwd } = fixture();
  assert.equal(decide({ cwd, tool_name: "Write", tool_input: { file_path: join(cwd, "x") }, agent_type: "imagine:previz-designer" }, {}).decision, "pass");
});

test("main agent (no agent_type) passes through", () => {
  const { cwd } = fixture();
  assert.equal(decide({ cwd, tool_name: "Write", tool_input: { file_path: join(cwd, "x") } }, {}).decision, "pass");
});

test("unreadable stdin blocks with exit code 2", () => {
  const hook = fileURLToPath(new URL("./scene-builder-scope.mjs", import.meta.url));
  const childEnv = { ...process.env };
  delete childEnv.GROK_HOOK_EVENT;
  const r = spawnSync(process.execPath, [hook], { input: "not json", encoding: "utf8", env: childEnv });
  assert.equal(r.status, 2);
  assert.equal(r.stdout, "");
  assert.match(r.stderr, /unreadable hook input/);
});

test("dangling symlink leaf inside shadow is denied", () => {
  const { cwd, shadow } = fixture();
  symlinkSync(join(tmpdir(), "imagine-pwned-target.txt"), join(shadow, "dangling"));
  assert.equal(sb(cwd, "Write", { file_path: join(shadow, "dangling") }).decision, "deny");
});

test("existing symlink leaf inside shadow is denied", () => {
  const { cwd, shadow } = fixture();
  const target = join(cwd, "outside.txt");
  writeFileSync(target, "x");
  symlinkSync(target, join(shadow, "link.html"));
  assert.equal(sb(cwd, "Write", { file_path: join(shadow, "link.html") }).decision, "deny");
});

test("nested .imagine under another directory is denied", () => {
  const { cwd } = fixture();
  assert.equal(sb(cwd, "Write", { file_path: join(cwd, "src", ".imagine", "x", "stage", "edit", "s01", "evil.js") }).decision, "deny");
});

test("writing the shadow root path itself is denied", () => {
  const { cwd, shadow } = fixture();
  assert.equal(sb(cwd, "Write", { file_path: shadow }).decision, "deny");
});

test("relative write path is denied", () => {
  const { cwd } = fixture();
  assert.equal(sb(cwd, "Write", { file_path: ".imagine/p1/stage/edit/s02/a.html" }).decision, "deny");
});

test("short flag with attached value is denied", () => {
  const { cwd, shadow } = fixture();
  assert.equal(bash(cwd, `npx hyperframes@0.8.223 snapshot -o/tmp/out.png ${shadow}`).decision, "deny");
});

test("bare flag followed by shadow value is allowed", () => {
  const { cwd, shadow } = fixture();
  assert.equal(bash(cwd, `npx hyperframes@0.8.223 snapshot ${shadow} -o ${join(shadow, "out")}`).decision, "allow");
});

test("non-allowlisted tools are denied for scene-builder", () => {
  const { cwd, shadow } = fixture();
  for (const tool_name of ["Monitor", "Agent", "Task", "WebFetch", "mcp__x__write", "PowerShell"]) {
    assert.equal(sb(cwd, tool_name, { command: "rm -rf ~" }).decision, "deny", tool_name);
  }
});

test("read-only tools are allowed for scene-builder", () => {
  const { cwd } = fixture();
  for (const tool_name of ["Read", "Glob", "Grep"]) {
    assert.equal(sb(cwd, tool_name, { file_path: join(cwd, "x") }).decision, "allow", tool_name);
  }
});

test("NotebookEdit checks notebook_path and rejects conflicting keys", () => {
  const { cwd, shadow } = fixture();
  assert.equal(sb(cwd, "NotebookEdit", { notebook_path: join(shadow, "n.ipynb") }).decision, "allow");
  assert.equal(sb(cwd, "NotebookEdit", { file_path: join(shadow, "a"), notebook_path: "/etc/x" }).decision, "deny");
  assert.equal(sb(cwd, "Write", { file_path: join(shadow, "a"), notebook_path: "/etc/x" }).decision, "deny");
});

test("other agents still pass for non-allowlisted tools", () => {
  const { cwd } = fixture();
  assert.equal(decide({ cwd, tool_name: "Monitor", tool_input: {}, agent_type: "imagine:previz-designer" }, {}).decision, "pass");
});

test("snapshot without a shadow DIR is denied", () => {
  const { cwd } = fixture();
  assert.equal(bash(cwd, "npx hyperframes@0.8.223 snapshot").decision, "deny");
  assert.equal(bash(cwd, "npx hyperframes@0.8.223 check --snapshots").decision, "deny");
  assert.equal(bash(cwd, "npx hyperframes@0.8.223 lint --json").decision, "deny");
});

test("two DIR positionals are denied", () => {
  const { cwd, shadow } = fixture();
  assert.equal(bash(cwd, `npx hyperframes@0.8.223 lint ${shadow} ${shadow}`).decision, "deny");
});

test("numeric output path is denied", () => {
  const { cwd, shadow } = fixture();
  assert.equal(bash(cwd, `npx hyperframes@0.8.223 snapshot -o 5 ${shadow}`).decision, "deny");
  assert.equal(bash(cwd, `npx hyperframes@0.8.223 snapshot --output=5 ${shadow}`).decision, "deny");
});

test("output at the shadow root itself is denied", () => {
  const { cwd, shadow } = fixture();
  assert.equal(bash(cwd, `npx hyperframes@0.8.223 snapshot ${shadow} -o ${shadow}`).decision, "deny");
});

test("unlisted or wrongly typed flags are denied", () => {
  const { cwd, shadow } = fixture();
  for (const extra of ["--describe", "--against", `--against=${shadow}/a`, "--proxy", "--range 1", "--composition x",
    "--frames abc", "--frames=1.5", "--json=true", "--verbose", "--at", "-x 1", "--", "-"]) {
    assert.equal(bash(cwd, `npx hyperframes@0.8.223 snapshot ${shadow} ${extra}`).decision, "deny", extra);
  }
});

test("listed typed flags are allowed", () => {
  const { cwd, shadow } = fixture();
  assert.equal(bash(cwd, `npx hyperframes@0.8.223 snapshot ${shadow} --frames 3 --timeout=5000 --keep --no-end --json`).decision, "allow");
  assert.equal(bash(cwd, `npx hyperframes@0.8.223 check ${shadow} --snapshots --at 1,2.5 --samples=4 --strict`).decision, "allow");
  assert.equal(bash(cwd, `npx hyperframes@0.8.223 validate ${shadow} --no-contrast --timeout 3000`).decision, "allow");
  assert.equal(bash(cwd, `npx hyperframes@0.8.223 lint ${join(shadow, "compositions", "s02.html")} --verbose`).decision, "allow");
});

test("hard link inside shadow to an outside file is denied", () => {
  const { cwd, shadow } = fixture();
  const outside = join(cwd, "outside.txt");
  writeFileSync(outside, "x");
  linkSync(outside, join(shadow, "hard.html"));
  assert.equal(sb(cwd, "Write", { file_path: join(shadow, "hard.html") }).decision, "deny");
});

function aliasFixture() {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "imagine-alias-")));
  const real = join(base, "real");
  const rel = join(".imagine", "p1", "stage", "edit", "s02");
  mkdirSync(join(real, rel), { recursive: true });
  const alias = join(base, "alias");
  symlinkSync(real, alias);
  return { real, alias, rel };
}

test("real cwd with alias file_path: inside allowed, outside denied", () => {
  const { real, alias, rel } = aliasFixture();
  assert.equal(sb(real, "Write", { file_path: join(alias, rel, "a.html") }).decision, "allow");
  assert.equal(sb(real, "Write", { file_path: join(alias, ".imagine", "p1", "bible.yaml") }).decision, "deny");
});

test("alias cwd with real file_path: inside allowed, outside denied", () => {
  const { real, alias, rel } = aliasFixture();
  assert.equal(sb(alias, "Write", { file_path: join(real, rel, "a.html") }).decision, "allow");
  assert.equal(sb(alias, "Write", { file_path: join(real, ".imagine", "p1", "bible.yaml") }).decision, "deny");
});

test("bash shadow DIR given in alias form is allowed", () => {
  const { real, alias, rel } = aliasFixture();
  assert.equal(bash(real, `npx hyperframes@0.8.223 lint ${join(alias, rel)}`).decision, "allow");
});

test("symlinked .imagine directory is denied", () => {
  const cwd = mkdtempSync(join(tmpdir(), "imagine-hook-"));
  const elsewhere = mkdtempSync(join(tmpdir(), "imagine-else-"));
  mkdirSync(join(elsewhere, "p1", "stage", "edit", "s02"), { recursive: true });
  symlinkSync(elsewhere, join(cwd, ".imagine"));
  assert.equal(sb(cwd, "Write", { file_path: join(cwd, ".imagine", "p1", "stage", "edit", "s02", "a.html") }).decision, "deny");
});

test("symlinked project directory is denied", () => {
  const cwd = mkdtempSync(join(tmpdir(), "imagine-hook-"));
  const elsewhere = mkdtempSync(join(tmpdir(), "imagine-else-"));
  mkdirSync(join(elsewhere, "stage", "edit", "s02"), { recursive: true });
  mkdirSync(join(cwd, ".imagine"));
  symlinkSync(elsewhere, join(cwd, ".imagine", "p1"));
  assert.equal(sb(cwd, "Write", { file_path: join(cwd, ".imagine", "p1", "stage", "edit", "s02", "a.html") }).decision, "deny");
});

test("symlink inside shadow pointing back to cwd is denied", () => {
  const { cwd, shadow } = fixture();
  symlinkSync(cwd, join(shadow, "back"));
  assert.equal(sb(cwd, "Write", { file_path: join(shadow, "back", ".imagine", "p1", "stage", "edit", "s02", "a.html") }).decision, "deny");
});

test("hook entry run through a symlinked path still decides", () => {
  const hooksDir = dirname(fileURLToPath(import.meta.url));
  const linkBase = mkdtempSync(join(tmpdir(), "imagine-entry-"));
  symlinkSync(hooksDir, join(linkBase, "hooks"));
  const entry = join(linkBase, "hooks", "scene-builder-scope.mjs");
  const { cwd, shadow } = fixture();
  const childEnv = { ...process.env };
  delete childEnv.CLAUDE_PROJECT_DIR;
  delete childEnv.GROK_HOOK_EVENT;
  const run = (file_path) => spawnSync(process.execPath, [entry], {
    input: JSON.stringify({ cwd, tool_name: "Write", tool_input: { file_path, content: "x" }, agent_type: "imagine:scene-builder" }),
    encoding: "utf8",
    env: childEnv,
  });
  const bad = run(join(cwd, ".imagine", "p1", "bible.yaml"));
  assert.equal(bad.status, 0);
  assert.match(bad.stdout, /"permissionDecision":"deny"/);
  const good = run(join(shadow, "compositions", "ok.html"));
  assert.equal(good.status, 0);
  assert.match(good.stdout, /"permissionDecision":"allow"/);
  assert.doesNotMatch(good.stdout, /updatedInput/);
  assert.doesNotMatch(bad.stdout, /updatedInput/);
});

test("non-normalised paths are denied (symlink + .. escape)", () => {
  const { cwd, shadow } = fixture();
  const elsewhere = mkdtempSync(join(tmpdir(), "imagine-else-"));
  mkdirSync(join(elsewhere, "deep"));
  symlinkSync(join(elsewhere, "deep"), join(cwd, "lnk"));
  assert.equal(sb(cwd, "Write", { file_path: `${cwd}/lnk/../.imagine/p1/stage/edit/s02/pwn` }).decision, "deny");
  assert.equal(sb(cwd, "Write", { file_path: `${shadow}/./a.html` }).decision, "deny");
  assert.equal(sb(cwd, "Write", { file_path: `${shadow}//a.html` }).decision, "deny");
  assert.equal(bash(cwd, `npx hyperframes@0.8.223 lint ${cwd}/lnk/../.imagine/p1/stage/edit/s02`).decision, "deny");
  assert.equal(bash(cwd, `npx hyperframes@0.8.223 lint ${shadow}/`).decision, "deny");
  assert.equal(bash(cwd, `npx hyperframes@0.8.223 snapshot ${shadow} -o ${shadow}/out/../x`).decision, "deny");
});

test("entry exits 2 when the logic module cannot load", () => {
  const dir = mkdtempSync(join(tmpdir(), "imagine-noload-"));
  copyFileSync(fileURLToPath(new URL("./scene-builder-scope.mjs", import.meta.url)), join(dir, "scene-builder-scope.mjs"));
  const childEnv = { ...process.env };
  delete childEnv.GROK_HOOK_EVENT;
  const r = spawnSync(process.execPath, [join(dir, "scene-builder-scope.mjs")], { input: "{}", encoding: "utf8", env: childEnv });
  assert.equal(r.status, 2);
  assert.equal(r.stdout, "");
  assert.match(r.stderr, /hook failed/);
});



test("scene-builder may hand its report back to the parent via SubagentHandback", () => {
  const { cwd } = fixture();
  const r = sb(cwd, "SubagentHandback", { message: "done" });
  assert.equal(r.decision, "allow");
  assert.equal(r.reason, "report to the parent agent");
});

test("near-miss SubagentHandback tool names are still denied", () => {
  const { cwd } = fixture();
  for (const name of ["subagenthandback", "SubagentHandbackX", "XSubagentHandback", "SubagentHandback "]) {
    const r = sb(cwd, name, { message: "done" });
    assert.equal(r.decision, "deny", name);
    assert.equal(r.reason, `scene-builder may not use ${name}`);
  }
});

test("unknown tools stay denied for scene-builder", () => {
  const { cwd } = fixture();
  const r = sb(cwd, "WebFetch", { url: "https://example.com" });
  assert.equal(r.decision, "deny");
  assert.equal(r.reason, "scene-builder may not use WebFetch");
});


// --- anchor is CLAUDE_PROJECT_DIR (session start root), falling back to the hook cwd ---

function anchored() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "imagine-root-")));
  const projectDir = join(root, ".imagine", "p1");
  const shadow = join(projectDir, "stage", "edit", "s01");
  mkdirSync(join(shadow, "compositions"), { recursive: true });
  return { root, projectDir, shadow, env: { CLAUDE_PROJECT_DIR: root } };
}

test("anchored: cwd moved into the project dir still allows shadow writes", () => {
  const { projectDir, shadow, env } = anchored();
  assert.equal(sb(projectDir, "Write", { file_path: join(shadow, "compositions", "a.html") }, env).decision, "allow");
});

test("anchored: an unrelated cwd tree with its own shadow is denied", () => {
  const { root, env } = anchored();
  const other = realpathSync(mkdtempSync(join(tmpdir(), "imagine-other-")));
  const otherShadow = join(other, ".imagine", "p9", "stage", "edit", "s01");
  mkdirSync(otherShadow, { recursive: true });
  const input = { file_path: join(otherShadow, "a.html") };
  assert.equal(sb(other, "Write", input, {}).decision, "allow");
  assert.equal(sb(other, "Write", input, env).decision, "deny");
  assert.notEqual(root, other);
});

test("anchored: symlink escape out of the shadow is denied", () => {
  const { root, projectDir, shadow, env } = anchored();
  symlinkSync("../../..", join(shadow, "assets"));
  assert.equal(sb(projectDir, "Write", { file_path: join(shadow, "assets", "hooktest.txt") }, env).decision, "deny");
  assert.equal(sb(root, "Write", { file_path: join(shadow, "assets", "hooktest.txt") }, env).decision, "deny");
});

test("anchored: bash lint on the shadow dir with cwd in the project dir is allowed", () => {
  const { projectDir, shadow, env } = anchored();
  assert.equal(bash(projectDir, `npx hyperframes@0.8.223 lint ${shadow}`, env).decision, "allow");
});

test("anchored: NotebookEdit and snapshot output follow the anchor too", () => {
  const { projectDir, shadow, env } = anchored();
  assert.equal(sb(projectDir, "NotebookEdit", { notebook_path: join(shadow, "n.ipynb") }, env).decision, "allow");
  assert.equal(bash(projectDir, `npx hyperframes@0.8.223 snapshot ${shadow} -o ${shadow}/snaps`, env).decision, "allow");
});

test("anchored: unset or empty CLAUDE_PROJECT_DIR falls back to the hook cwd", () => {
  const { cwd, shadow } = fixture();
  for (const env of [{}, { CLAUDE_PROJECT_DIR: "" }]) {
    assert.equal(sb(cwd, "Write", { file_path: join(shadow, "compositions", "a.html") }, env).decision, "allow");
    assert.equal(sb(cwd, "Write", { file_path: join(cwd, ".imagine", "p1", "STORY.md") }, env).decision, "deny");
  }
});

test("anchored: nonexistent CLAUDE_PROJECT_DIR is denied, no cwd fallback", () => {
  const { cwd, shadow } = fixture();
  const env = { CLAUDE_PROJECT_DIR: "/nonexistent-imagine-root" };
  assert.equal(sb(cwd, "Write", { file_path: join(shadow, "compositions", "a.html") }, env).decision, "deny");
  assert.equal(bash(cwd, `npx hyperframes@0.8.223 lint ${shadow}`, env).decision, "deny");
});

test("anchored: missing hook cwd is still denied even with CLAUDE_PROJECT_DIR set", () => {
  const { shadow, env } = anchored();
  const r = decide({ tool_name: "Write", tool_input: { file_path: join(shadow, "a.html") }, agent_type: "imagine:scene-builder" }, env);
  assert.equal(r.decision, "deny");
  assert.equal(r.reason, "scene-builder call without cwd");
});

test("anchored: relative CLAUDE_PROJECT_DIR is denied, no cwd fallback", () => {
  const { cwd, shadow } = fixture();
  // A relative path that would resolve to the real root from the hook process cwd.
  const env = { CLAUDE_PROJECT_DIR: relative(process.cwd(), cwd) };
  assert.equal(sb(cwd, "Write", { file_path: join(shadow, "compositions", "a.html") }, env).decision, "deny");
});

test("anchored: symlinked CLAUDE_PROJECT_DIR pointing at the real root is allowed", () => {
  const { cwd, shadow } = fixture();
  const alias = join(mkdtempSync(join(tmpdir(), "imagine-alias-")), "root");
  symlinkSync(cwd, alias);
  assert.equal(sb(cwd, "Write", { file_path: join(shadow, "compositions", "a.html") }, { CLAUDE_PROJECT_DIR: alias }).decision, "allow");
});
