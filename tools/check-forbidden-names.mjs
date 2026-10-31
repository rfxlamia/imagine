#!/usr/bin/env node
// Fails if any repo file names the research reference that must stay unnamed.
// Patterns are base64 in forbidden-names.b64 so this tool never contains them.
import { readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = join(fileURLToPath(import.meta.url), "..");
const root = join(here, "..");
const SKIP_DIRS = new Set(["node_modules", ".git"]);
const SKIP_PATHS = new Set(["packages/hyperframes", "packages/pocket-tts", "tools/forbidden-names.b64", "spikes", ".obsidian"]);

export function loadPatterns() {
  return readFileSync(join(here, "forbidden-names.b64"), "utf8")
    .split("\n").map((l) => l.trim()).filter(Boolean)
    .map((b) => Buffer.from(b, "base64").toString("utf8"))
    .map((s) => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
}

export function findViolations(files, patterns) {
  const out = [];
  for (const f of files) {
    f.text.split("\n").forEach((line, i) => {
      if (patterns.some((p) => p.test(line))) out.push({ path: f.path, line: i + 1 });
    });
  }
  return out;
}

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const rel = relative(root, p);
    if (SKIP_DIRS.has(name) || SKIP_PATHS.has(rel)) continue;
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (st.size < 2_000_000) {
      const buf = readFileSync(p);
      if (!buf.subarray(0, 8000).includes(0)) out.push({ path: rel, text: buf.toString("utf8") });
    }
  }
  return out;
}

function main() {
  const violations = findViolations(walk(root, []), loadPatterns());
  if (violations.length) {
    console.error(violations.map((v) => `${v.path}:${v.line}`).join("\n"));
    process.exit(1);
  }
  console.log("forbidden names: clean");
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) main();
