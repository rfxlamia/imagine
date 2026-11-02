import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { checkRegistry, checkCoverage, parseClasses } from "./check-traceability.mjs";

const rules = [
  { id: "HARD-X-ONE", source: "section 8.1", text: "t", cover: "both" },
  { id: "PROC-Y", source: "section 2.6", text: "t" },
  { id: "AC-01", source: "section 11", text: "t", cover: "tests" },
];

test("registry: valid", () => assert.deepEqual(checkRegistry(rules), []));
test("registry: duplicate id", () => assert.match(checkRegistry([...rules, rules[0]]).join(), /duplicate HARD-X-ONE/));
test("registry: bad id", () => assert.match(checkRegistry([{ id: "hard-x", source: "s", text: "t" }]).join(), /invalid id/));
test("registry: missing text", () => assert.match(checkRegistry([{ id: "PROC-Z", source: "s" }]).join(), /missing text/));
test("registry: bad status", () => assert.match(checkRegistry([{ id: "PROC-Z", source: "s", text: "t", status: "gone" }]).join(), /invalid status/));
test("registry: deferred status valid", () => assert.deepEqual(checkRegistry([{ id: "PROC-Z", source: "s", text: "t", status: "deferred" }]), []));
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

test("coverage: deferred rule skipped and counted", () => {
  const withDeferred = [...rules, { id: "CAP-OLD", source: "s", text: "t", cover: "both", status: "deferred" }];
  const files = [
    { path: "skills/a/SKILL.md", text: "<!-- rule:HARD-X-ONE --> <!-- rule:PROC-Y -->" },
    { path: "tests/x.test.mjs", text: "HARD-X-ONE AC-01" },
  ];
  const r = checkCoverage(withDeferred, files);
  assert.deepEqual(r.missing, []);
  assert.equal(r.deferred, 1);
  assert.equal(r.covered, 3);
});

test("coverage: class filter checks only the listed classes", () => {
  const files = [{ path: "tests/x.test.mjs", text: "HARD-X-ONE AC-01" }];
  const all = checkCoverage(rules, files);
  assert.deepEqual(all.missing.sort(), ["HARD-X-ONE (instructions)", "PROC-Y (instructions)"]);
  const r = checkCoverage(rules, files, { classes: new Set(["HARD", "GATE"]) });
  assert.deepEqual(r.missing, ["HARD-X-ONE (instructions)"]);
  assert.equal(r.covered, 0);
  assert.equal(r.skipped, 2);
});

test("coverage: class filter still reports orphans in every class", () => {
  const files = [{ path: "agents/b.md", text: "<!-- rule:PROC-GHOST --> <!-- rule:HARD-X-ONE -->" }, { path: "tests/x.test.mjs", text: "HARD-X-ONE" }];
  const r = checkCoverage(rules, files, { classes: new Set(["HARD"]) });
  assert.deepEqual(r.missing, []);
  assert.deepEqual(r.orphans, ["PROC-GHOST in agents/b.md"]);
});

test("parseClasses: comma list, validated", () => {
  assert.deepEqual([...parseClasses(["--classes", "HARD,GATE"])].sort(), ["GATE", "HARD"]);
  assert.equal(parseClasses(["--report", "x"]), null);
  assert.throws(() => parseClasses(["--classes", "HARD,NOPE"]), /unknown class NOPE/);
  assert.throws(() => parseClasses(["--classes"]), /--classes needs/);
});

test("cli: --classes HARD,GATE runs filtered coverage", () => {
  const tool = fileURLToPath(new URL("./check-traceability.mjs", import.meta.url));
  const r = spawnSync(process.execPath, [tool, "--classes", "HARD,GATE"], { encoding: "utf8" });
  assert.match(r.stdout + r.stderr, /classes HARD,GATE/);
  assert.doesNotMatch(r.stderr, /^missing (PROC|ADV|DAG|CAP|AC)-/m);
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
