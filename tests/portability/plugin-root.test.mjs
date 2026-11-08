import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { isPluginRoot, resolvePluginRoot, RESOLUTION_PROTOCOL } from "../../host/plugin-root.mjs";

function makeFixtureTree() {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "imagine-root-fixture-")));
  mkdirSync(join(base, "packages", "imagine-kit", "bin"), { recursive: true });
  mkdirSync(join(base, "skills", "imagine"), { recursive: true });
  writeFileSync(
    join(base, "packages", "imagine-kit", "package.json"),
    JSON.stringify({ name: "imagine-kit", version: "0.1.0" })
  );
  writeFileSync(
    join(base, "packages", "imagine-kit", "bin", "imagine-kit.mjs"),
    "#!/usr/bin/env node\n"
  );
  writeFileSync(
    join(base, "skills", "imagine", "SKILL.md"),
    "# Imagine\n"
  );
  return base;
}

test("resolves valid skill-dir", () => {
  const base = makeFixtureTree();
  try {
    const res = resolvePluginRoot({ skillDir: join(base, "skills", "imagine"), env: {} });
    assert.equal(res.ok, true);
    assert.equal(res.protocol, RESOLUTION_PROTOCOL);
    assert.equal(res.root, base);
    assert.equal(res.kit, join(base, "packages", "imagine-kit", "bin", "imagine-kit.mjs"));
    assert.equal(res.source, "skill-dir");
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("IMAGINE_PLUGIN_ROOT wins over CLAUDE_PLUGIN_ROOT", () => {
  const base1 = makeFixtureTree();
  const base2 = makeFixtureTree();
  try {
    const res = resolvePluginRoot({
      env: { IMAGINE_PLUGIN_ROOT: base1, CLAUDE_PLUGIN_ROOT: base2 },
    });
    assert.equal(res.ok, true);
    assert.equal(res.root, base1);
    assert.equal(res.source, "IMAGINE_PLUGIN_ROOT");
  } finally {
    rmSync(base1, { recursive: true, force: true });
    rmSync(base2, { recursive: true, force: true });
  }
});

test("a set but invalid IMAGINE_PLUGIN_ROOT fails and does not fall through", () => {
  const base = makeFixtureTree();
  try {
    const res = resolvePluginRoot({
      env: { IMAGINE_PLUGIN_ROOT: "/nonexistent/invalid/dir", CLAUDE_PLUGIN_ROOT: base },
    });
    assert.equal(res.ok, false);
    assert.equal(res.protocol, RESOLUTION_PROTOCOL);
    assert.deepEqual(res.tried, [{ source: "IMAGINE_PLUGIN_ROOT", path: "/nonexistent/invalid/dir" }]);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("no candidates returns failure", () => {
  const res = resolvePluginRoot({ env: {} });
  assert.equal(res.ok, false);
  assert.equal(res.protocol, RESOLUTION_PROTOCOL);
  assert.equal(res.reason, "no plugin root candidate");
  assert.deepEqual(res.tried, []);
});

test("a relative path is rejected", () => {
  assert.equal(isPluginRoot("packages/imagine-kit"), false);
  assert.equal(isPluginRoot("./skills/imagine"), false);

  const res1 = resolvePluginRoot({ env: { IMAGINE_PLUGIN_ROOT: "relative/path" } });
  assert.equal(res1.ok, false);

  const res2 = resolvePluginRoot({ skillDir: "skills/imagine", env: {} });
  assert.equal(res2.ok, false);
});

test("a wrong kit package name is rejected", () => {
  const base = makeFixtureTree();
  try {
    writeFileSync(
      join(base, "packages", "imagine-kit", "package.json"),
      JSON.stringify({ name: "other-package" })
    );
    assert.equal(isPluginRoot(base), false);

    const res = resolvePluginRoot({ env: { IMAGINE_PLUGIN_ROOT: base } });
    assert.equal(res.ok, false);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("a symlinked root resolves to its realpath", () => {
  const base = makeFixtureTree();
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), "imagine-symlink-")));
  try {
    const link = join(tmp, "symlink-root");
    symlinkSync(base, link);
    assert.equal(isPluginRoot(link), true);

    const res = resolvePluginRoot({ env: { IMAGINE_PLUGIN_ROOT: link } });
    assert.equal(res.ok, true);
    assert.equal(res.root, base);
    assert.equal(res.kit, join(base, "packages", "imagine-kit", "bin", "imagine-kit.mjs"));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
    rmSync(base, { recursive: true, force: true });
  }
});

test("a different process.cwd() has no effect", () => {
  const base = makeFixtureTree();
  const origCwd = process.cwd();
  const otherDir = mkdtempSync(join(tmpdir(), "imagine-other-cwd-"));
  try {
    process.chdir(otherDir);
    const res = resolvePluginRoot({ env: { IMAGINE_PLUGIN_ROOT: base } });
    assert.equal(res.ok, true);
    assert.equal(res.root, base);
  } finally {
    process.chdir(origCwd);
    rmSync(otherDir, { recursive: true, force: true });
    rmSync(base, { recursive: true, force: true });
  }
});

test("the real repo root resolves when skillDir = <repo>/skills/imagine", () => {
  const repoRoot = realpathSync(join(fileURLToPath(import.meta.url), "..", "..", ".."));
  const res = resolvePluginRoot({ skillDir: join(repoRoot, "skills", "imagine"), env: {} });
  assert.equal(res.ok, true);
  assert.equal(res.root, repoRoot);
  assert.equal(res.source, "skill-dir");
});

test("CLI exits 0 with JSON on success, exits 1 on failure", () => {
  const cliPath = join(fileURLToPath(import.meta.url), "..", "..", "..", "host", "plugin-root.mjs");
  const base = makeFixtureTree();
  try {
    const r0 = spawnSync(process.execPath, [cliPath, "--skill-dir", join(base, "skills", "imagine")], {
      encoding: "utf8",
      env: { PATH: process.env.PATH },
    });
    assert.equal(r0.status, 0);
    const parsed0 = JSON.parse(r0.stdout.trim());
    assert.equal(parsed0.ok, true);
    assert.equal(parsed0.root, base);
    assert.equal(parsed0.source, "skill-dir");

    const r1 = spawnSync(process.execPath, [cliPath, "--skill-dir", "/nonexistent"], {
      encoding: "utf8",
      env: { PATH: process.env.PATH },
    });
    assert.equal(r1.status, 1);
    const parsed1 = JSON.parse(r1.stdout.trim());
    assert.equal(parsed1.ok, false);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
