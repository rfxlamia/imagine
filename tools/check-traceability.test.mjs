import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { checkRegistry, checkCoverage } from "./check-traceability.mjs";

const rules = [
  { id: "HARD-X-ONE", source: "§8.1", text: "t", cover: "both" },
  { id: "PROC-Y", source: "§2.6", text: "t" },
  { id: "AC-01", source: "§11", text: "t", cover: "tests" },
];

test("registry: valid", () => assert.deepEqual(checkRegistry(rules), []));
test("registry: duplicate id", () => assert.match(checkRegistry([...rules, rules[0]]).join(), /duplicate HARD-X-ONE/));
test("registry: bad id", () => assert.match(checkRegistry([{ id: "hard-x", source: "s", text: "t" }]).join(), /invalid id/));
test("registry: missing text", () => assert.match(checkRegistry([{ id: "PROC-Z", source: "s" }]).join(), /missing text/));
test("registry: bad cover", () => assert.match(checkRegistry([{ id: "PROC-Z", source: "s", text: "t", cover: "x" }]).join(), /invalid cover/));

test("coverage: all covered", () => {
  const files = [
    { path: "skills/a/SKILL.md", text: "<!-- rule:HARD-X-ONE --> <!-- rule:PROC-Y -->" },
    { path: "packages/imagine-kit/test/a.test.mjs", text: "// HARD-X-ONE AC-01" },
  ];
  const r = checkCoverage(rules, files);
  assert.deepEqual(r.missing, []);
  assert.deepEqual(r.orphans, []);
});

test("coverage: missing instruction marker and orphan", () => {
  const files = [
    { path: "skills/a/SKILL.md", text: "<!-- rule:PROC-Y --> <!-- rule:PROC-GHOST -->" },
    { path: "tests/x.test.mjs", text: "HARD-X-ONE AC-01" },
  ];
  const r = checkCoverage(rules, files);
  assert.deepEqual(r.missing, ["HARD-X-ONE (instructions)"]);
  assert.deepEqual(r.orphans, ["PROC-GHOST in skills/a/SKILL.md"]);
});

test("coverage: test-only id not satisfied by instruction marker", () => {
  const files = [{ path: "agents/b.md", text: "<!-- rule:AC-01 --> <!-- rule:HARD-X-ONE --> <!-- rule:PROC-Y -->" }];
  const r = checkCoverage(rules, files);
  assert.deepEqual(r.missing.sort(), ["AC-01 (tests)", "HARD-X-ONE (tests)"]);
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
    const r = spawnSync(process.execPath, [join(alias, "tools", "check-traceability.mjs"), "--registry-only"], { encoding: "utf8" });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /registry ok:/);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
