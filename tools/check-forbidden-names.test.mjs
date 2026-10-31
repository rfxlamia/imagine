import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { findViolations, loadPatterns } from "./check-forbidden-names.mjs";

const patterns = loadPatterns();
// Decoded at runtime so this file never contains the name itself.
const firstLine = readFileSync(new URL("./forbidden-names.b64", import.meta.url), "utf8").split("\n")[0];
const word = Buffer.from(firstLine, "base64").toString("utf8");

test("patterns decode", () => assert.equal(patterns.length, 2));
test("flags a file containing a pattern, case-insensitive", () => {
  const files = [{ path: "skills/x/SKILL.md", text: `line one\nuse ${word.toUpperCase()} here\n` }];
  assert.deepEqual(findViolations(files, patterns), [{ path: "skills/x/SKILL.md", line: 2 }]);
});
test("clean file passes", () => {
  assert.deepEqual(findViolations([{ path: "a.md", text: "codex image adapter" }], patterns), []);
});

test("entry guard runs main when invoked via symlink", () => {
  const toolsDir = fileURLToPath(new URL(".", import.meta.url));
  const docsDir = fileURLToPath(new URL("../docs", import.meta.url));
  const base = realpathSync(mkdtempSync(join(tmpdir(), "imagine-alias-")));
  try {
    const real = join(base, "real");
    mkdirSync(real, { recursive: true });
    cpSync(toolsDir, join(real, "tools"), { recursive: true });
    cpSync(docsDir, join(real, "docs"), { recursive: true });
    const alias = join(base, "alias");
    symlinkSync(real, alias);
    const r = spawnSync(process.execPath, [join(alias, "tools", "check-forbidden-names.mjs")], { encoding: "utf8" });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /forbidden names: clean/);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("checker scans tests/spikes but skips repo-root spikes", () => {
  const toolsDir = fileURLToPath(new URL(".", import.meta.url));
  const docsDir = fileURLToPath(new URL("../docs", import.meta.url));
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), "imagine-spikes-")));
  try {
    cpSync(toolsDir, join(tmp, "tools"), { recursive: true });
    cpSync(docsDir, join(tmp, "docs"), { recursive: true });

    mkdirSync(join(tmp, "tests", "spikes"), { recursive: true });
    writeFileSync(join(tmp, "tests", "spikes", "x.md"), `bad: ${word}\n`);
    const r1 = spawnSync(process.execPath, [join(tmp, "tools", "check-forbidden-names.mjs")], { encoding: "utf8" });
    assert.equal(r1.status, 1);
    assert.match(r1.stderr, /tests\/spikes\/x\.md:1/);

    rmSync(join(tmp, "tests", "spikes", "x.md"));
    mkdirSync(join(tmp, "spikes"), { recursive: true });
    writeFileSync(join(tmp, "spikes", "x.md"), `bad: ${word}\n`);
    const r2 = spawnSync(process.execPath, [join(tmp, "tools", "check-forbidden-names.mjs")], { encoding: "utf8" });
    assert.equal(r2.status, 0);
    assert.match(r2.stdout, /forbidden names: clean/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("checker skips repo-root .obsidian but scans nested .obsidian", () => {
  const toolsDir = fileURLToPath(new URL(".", import.meta.url));
  const docsDir = fileURLToPath(new URL("../docs", import.meta.url));
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), "imagine-obsidian-")));
  try {
    cpSync(toolsDir, join(tmp, "tools"), { recursive: true });
    cpSync(docsDir, join(tmp, "docs"), { recursive: true });

    mkdirSync(join(tmp, ".obsidian", "plugins", "x"), { recursive: true });
    writeFileSync(join(tmp, ".obsidian", "plugins", "x", "data.json"), `bad: ${word}\n`);
    const r1 = spawnSync(process.execPath, [join(tmp, "tools", "check-forbidden-names.mjs")], { encoding: "utf8" });
    assert.equal(r1.status, 0);
    assert.match(r1.stdout, /forbidden names: clean/);

    mkdirSync(join(tmp, "notes", ".obsidian"), { recursive: true });
    writeFileSync(join(tmp, "notes", ".obsidian", "x.json"), `bad: ${word}\n`);
    const r2 = spawnSync(process.execPath, [join(tmp, "tools", "check-forbidden-names.mjs")], { encoding: "utf8" });
    assert.equal(r2.status, 1);
    assert.match(r2.stderr, /notes\/\.obsidian\/x\.json:1/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
