#!/usr/bin/env node
// Verifies the rule registry and that every rule is enforced by an instruction
// marker (<!-- rule:ID -->) and/or referenced by a test, per its `cover` field.
// Rules with `status: deferred` are kept in the registry but skipped by coverage.
// `--classes HARD,GATE` limits the coverage check to rules whose id prefix is listed
// (the WP6 acceptance gate); orphan markers are still reported for every class.
import { readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const CLASSES = ["HARD", "ADV", "GATE", "DAG", "PROC", "CAP", "AC"];
const ID_RE = new RegExp(`^(${CLASSES.join("|")})-[A-Z0-9]+(-[A-Z0-9]+)*$`);
const COVERS = new Set(["instructions", "tests", "both"]);
const STATUSES = new Set(["active", "deferred"]);
const MARKER_RE = /<!--\s*rule:([A-Z0-9-]+)\s*-->/g;
const INSTRUCTION_ROOTS = ["skills/", "agents/", "hooks/"];
// Prose under tests/ (behavioural runs, slice evidence) intentionally counts as test coverage (WP1 decision D7).
const TEST_ROOTS = ["packages/imagine-kit/test/", "tests/"];

export function parseRules(text) {
  const rules = [];
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*-\s*\{(.*)\}\s*$/);
    if (!m) continue;
    const rule = {};
    for (const part of m[1].matchAll(/(\w+):\s*("(?:[^"\\]|\\.)*"|[^,]+)/g)) {
      const raw = part[2].trim();
      rule[part[1]] = raw.startsWith('"') ? JSON.parse(raw) : raw;
    }
    rules.push(rule);
  }
  return rules;
}

export function checkRegistry(rules) {
  const problems = [];
  const seen = new Set();
  for (const r of rules) {
    if (!ID_RE.test(r.id ?? "")) problems.push(`invalid id ${r.id}`);
    if (seen.has(r.id)) problems.push(`duplicate ${r.id}`);
    seen.add(r.id);
    if (!r.source) problems.push(`${r.id}: missing source`);
    if (!r.text) problems.push(`${r.id}: missing text`);
    if (r.cover !== undefined && !COVERS.has(r.cover)) problems.push(`${r.id}: invalid cover ${r.cover}`);
    if (r.status !== undefined && !STATUSES.has(r.status)) problems.push(`${r.id}: invalid status ${r.status}`);
  }
  return problems;
}

export function parseClasses(argv) {
  const i = argv.indexOf("--classes");
  if (i < 0) return null;
  const raw = argv[i + 1];
  if (!raw || raw.startsWith("--")) throw new Error("--classes needs a comma list, e.g. --classes HARD,GATE");
  const set = new Set(raw.split(",").map((c) => c.trim()).filter(Boolean));
  for (const c of set) if (!CLASSES.includes(c)) throw new Error(`unknown class ${c}`);
  return set;
}

export function checkCoverage(rules, files, { classes = null } = {}) {
  const known = new Set(rules.map((r) => r.id));
  const marked = new Set();
  const orphans = [];
  const testText = [];
  for (const f of files) {
    if (INSTRUCTION_ROOTS.some((p) => f.path.startsWith(p))) {
      for (const m of f.text.matchAll(MARKER_RE)) {
        if (known.has(m[1])) marked.add(m[1]);
        else orphans.push(`${m[1]} in ${f.path}`);
      }
    }
    if (TEST_ROOTS.some((p) => f.path.startsWith(p))) testText.push(f.text);
  }
  const tests = testText.join("\n");
  const missing = [];
  let covered = 0;
  let deferred = 0;
  let skipped = 0;
  for (const r of rules) {
    if (r.status === "deferred") { deferred += 1; continue; }
    if (classes && !classes.has(r.id.split("-")[0])) { skipped += 1; continue; }
    const cover = r.cover ?? "instructions";
    const needI = cover !== "tests";
    const needT = cover !== "instructions";
    const okI = !needI || marked.has(r.id);
    const okT = !needT || new RegExp(`\\b${r.id}\\b`).test(tests);
    if (!okI) missing.push(`${r.id} (instructions)`);
    if (!okT) missing.push(`${r.id} (tests)`);
    if (okI && okT) covered += 1;
  }
  return { missing, orphans, covered, deferred, skipped };
}

function walk(root, dir, out) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    if (name === "node_modules" || name.startsWith(".git")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(root, p, out);
    else if (/\.(md|mjs|js|json|yaml|yml|sh|py)$/.test(name)) out.push({ path: relative(root, p), text: readFileSync(p, "utf8") });
  }
  return out;
}

function main() {
  const root = join(fileURLToPath(import.meta.url), "..", "..");
  const rules = parseRules(readFileSync(join(root, "docs/contracts/rules.yaml"), "utf8"));
  const problems = checkRegistry(rules);
  if (problems.length) { console.error(problems.join("\n")); process.exit(1); }
  console.log(`registry ok: ${rules.length} rules`);
  if (process.argv.includes("--registry-only")) return;
  let classes;
  try { classes = parseClasses(process.argv); } catch (e) { console.error(e.message); process.exit(2); }
  const files = [...INSTRUCTION_ROOTS, ...TEST_ROOTS].flatMap((d) => walk(root, join(root, d), []));
  const { missing, orphans, covered, deferred, skipped } = checkCoverage(rules, files, { classes });
  const scope = classes ? ` (classes ${[...classes].join(",")}; ${skipped} skipped)` : "";
  const reportIdx = process.argv.indexOf("--report");
  if (reportIdx > 0) {
    const lines = ["# Traceability report", "", `Covered ${covered}/${rules.length - deferred} active (${deferred} deferred)`, "", "| Rule | Cover | Instruction markers | Test refs |", "|---|---|---|---|"];
    const markersByFile = files
      .filter((f) => INSTRUCTION_ROOTS.some((p) => f.path.startsWith(p)))
      .map((f) => ({ path: f.path, ids: new Set([...f.text.matchAll(MARKER_RE)].map((m) => m[1])) }));
    for (const r of rules) {
      const marks = markersByFile.filter((f) => f.ids.has(r.id)).map((f) => f.path);
      const tests = files.filter((f) => TEST_ROOTS.some((p) => f.path.startsWith(p)) && new RegExp(`\\b${r.id}\\b`).test(f.text)).map((f) => f.path);
      lines.push(`| ${r.id} | ${r.status === "deferred" ? "deferred" : r.cover ?? "instructions"} | ${marks.join("<br>")} | ${tests.join("<br>")} |`);
    }
    writeFileSync(join(root, process.argv[reportIdx + 1]), lines.join("\n") + "\n");
  }
  if (missing.length || orphans.length) {
    if (scope) console.error(`coverage failed${scope}`);
    console.error([...missing.map((m) => `missing ${m}`), ...orphans.map((o) => `orphan ${o}`)].join("\n"));
    process.exit(1);
  }
  console.log(`coverage ok: ${covered}/${rules.length - deferred - skipped} active (${deferred} deferred)${scope}`);
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) main();
