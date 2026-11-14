import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, readdirSync, cpSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { manageCodexAgents } from "../../host/codex-agents.mjs";
import { writeCodexAgents } from "../../tools/agent-codex.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "imagine-native-install-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const home = join(dir, "home"), root = join(dir, "plugin"); mkdirSync(home); mkdirSync(root);
  cpSync(join(ROOT, "agents"), join(root, "agents"), { recursive: true }); writeCodexAgents(root);
  writeFileSync(join(home, "config.toml"), '# user configuration\nmodel="operator-model"\n');
  writeFileSync(join(home, "auth.json"), "synthetic authentication sentinel\n");
  return { dir, home, root, run: mode => manageCodexAgents({ mode, codexHome: home, rootDir: root }) };
}

test("preview is read-only; install/check are idempotent and preserve user config and unrelated agents", t => {
  const f = fixture(t); assert.equal(f.run("preview").ok, true); assert.equal(existsSync(join(f.home, "agents")), false);
  assert.equal(f.run("check").ok, false); assert.equal(existsSync(join(f.home, "agents")), false);
  assert.equal(f.run("install").ok, true);
  assert.equal(readdirSync(join(f.home, "agents")).length, 5);
  writeFileSync(join(f.home, "agents/other.toml"), "name='other'\n");
  assert.equal(f.run("install").ok, true); assert.equal(f.run("check").ok, true);
  assert.equal(readFileSync(join(f.home, "config.toml"), "utf8"), '# user configuration\nmodel="operator-model"\n');
  assert.equal(readFileSync(join(f.home, "auth.json"), "utf8"), "synthetic authentication sentinel\n");
  assert.equal(f.run("remove").ok, true); assert.deepEqual(readdirSync(join(f.home, "agents")), ["other.toml"]);
  assert.equal(f.run("remove").ok, true);
});

for (const kind of ["unowned", "edited", "file-symlink", "directory-symlink"]) test(`installer refuses ${kind} before writing any role`, t => {
  const f = fixture(t), agents = join(f.home, "agents"), target = join(agents, "imagine_storyboard_artist.toml");
  if (kind === "directory-symlink") { mkdirSync(join(f.dir, "outside")); symlinkSync(join(f.dir, "outside"), agents); }
  else {
    mkdirSync(agents);
    if (kind === "unowned") writeFileSync(target, "# user-owned\n");
    if (kind === "edited") { f.run("install"); writeFileSync(target, readFileSync(target, "utf8") + "# user edit\n"); }
    if (kind === "file-symlink") symlinkSync(join(f.home, "config.toml"), target);
  }
  const before = readdirSync(agents);
  for (const mode of ["preview", "install", "remove"]) assert.equal(f.run(mode).ok, false, mode);
  assert.deepEqual(readdirSync(agents), before);
});

test("install refreshes unedited owned files but detects edited files during update", t => {
  const f = fixture(t); assert.equal(f.run("install").ok, true);
  const path = join(f.root, "agents/storyboard-artist.md");
  writeFileSync(path, readFileSync(path, "utf8") + "\nNew canonical revision.\n"); writeCodexAgents(f.root);
  assert.equal(f.run("check").ok, false); assert.equal(f.run("install").ok, true); assert.equal(f.run("check").ok, true);
  assert.match(readFileSync(join(f.home, "agents/imagine_storyboard_artist.toml"), "utf8"), /New canonical revision/);
});

test("stale packaged TOML fails setup instead of installing stale role instructions", t => {
  const f = fixture(t), path = join(f.root, "agents/storyboard-artist.md");
  writeFileSync(path, readFileSync(path, "utf8") + "\nChanged without generation.\n");
  assert.equal(f.run("install").ok, false); assert.equal(existsSync(join(f.home, "agents")), false);
});

test("installer CLI works through a symlink and rejects conflicting modes", t => {
  const f = fixture(t), alias = join(f.dir, "setup-alias.mjs");
  symlinkSync(join(ROOT, "host/codex-agents.mjs"), alias);
  const run = args => spawnSync(process.execPath, [alias, ...args, "--codex-home", f.home], { encoding: "utf8" });
  const preview = run(["--dry-run"]);
  assert.equal(preview.status, 0); assert.equal(JSON.parse(preview.stdout).mode, "preview");
  assert.equal(run(["--check", "--install"]).status, 2);
  assert.equal(existsSync(join(f.home, "agents")), false);
});
