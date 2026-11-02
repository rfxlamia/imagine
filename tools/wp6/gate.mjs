#!/usr/bin/env node
// WP6 gate for the skills and agents written in web chat.
//   node tools/wp6/gate.mjs brief <name>        print the brief to paste into the web chat
//   node tools/wp6/gate.mjs save <name>         stdin bundle -> validate -> write target (nothing written on failure)
//   node tools/wp6/gate.mjs check [name...]     re-run the per-file checks on saved targets (default: all present)
//   node tools/wp6/gate.mjs status              per-target state plus the HARD,GATE traceability run
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseRules } from "../check-traceability.mjs";
import { findViolations, loadPatterns } from "../check-forbidden-names.mjs";
import { CUT_COMMAND_RE, ORDER, REPLAN_NOTES, TARGETS, WAIVER_FORMAT, WAIVER_RULES } from "./allocation.mjs";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..", "..");
const BRANCH = "wp6/skills-gate";
const MAX_LINES = 500;
const MARKER_RE = /<!--\s*rule:([A-Z0-9-]+)\s*-->/g;
const FILE_OPEN_RE = /^=== FILE: (`*[^\s`]+`*) ===$/;
const FILE_CLOSE = "=== END FILE ===";
const SECTION_SIGN = "§";

export function loadRules(root = ROOT) {
  return parseRules(readFileSync(join(root, "docs/contracts/rules.yaml"), "utf8"));
}

// Bundle: one or more `=== FILE: <repo path> ===` ... `=== END FILE ===` blocks. Text outside blocks is ignored.
export function parseBundle(text) {
  const files = [];
  const problems = [];
  let cur = null;
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    // Chat UIs add stray spaces or backticks around the delimiters and the path.
    const bare = line.trim().replace(/^`+|`+$/g, "").trim();
    const open = bare.match(FILE_OPEN_RE);
    if (open) {
      if (cur) problems.push(`${cur.path}: missing ${FILE_CLOSE} before next FILE`);
      cur = { path: open[1].replace(/^`+|`+$/g, ""), lines: [] };
      continue;
    }
    if (bare === FILE_CLOSE) {
      if (!cur) { problems.push(`stray ${FILE_CLOSE}`); continue; }
      files.push({ path: cur.path, text: cur.lines.join("\n").replace(/\n*$/, "\n") });
      cur = null;
      continue;
    }
    if (cur) cur.lines.push(line);
  }
  if (cur) problems.push(`${cur.path}: missing ${FILE_CLOSE}`);
  if (!files.length && !problems.length) problems.push("no === FILE: <path> === blocks found");
  const seen = new Set();
  for (const f of files) {
    if (seen.has(f.path)) problems.push(`${f.path}: duplicate FILE block`);
    seen.add(f.path);
  }
  return { files, problems };
}

export function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return null;
  const fm = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([A-Za-z_-]+):\s*(.*)$/);
    if (kv) fm[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, "");
  }
  return fm;
}

function markerOnly(line) {
  return line.includes("<!--") && line.replace(MARKER_RE, "").trim() === "" && [...line.matchAll(MARKER_RE)].length > 0;
}

// Pure check of one target. files: [{ path, text }] with repo-relative paths.
export function checkTarget(name, files, rules, patterns, { exists = (rel) => existsSync(join(ROOT, rel)) } = {}) {
  const t = TARGETS[name];
  if (!t) return [`unknown target ${name}`];
  const problems = [];
  const byId = new Map(rules.map((r) => [r.id, r]));
  const main = t.kind === "skill" ? `${t.path}/SKILL.md` : t.path;

  for (const f of files) {
    const inside = t.kind === "skill" ? f.path.startsWith(`${t.path}/`) : f.path === t.path;
    if (!inside) problems.push(`${f.path}: outside target ${t.path}`);
    if (f.path.includes("..") || f.path.startsWith("/")) problems.push(`${f.path}: path must be repo-relative without ..`);
    if (!/\.(md|yaml)$/.test(f.path)) problems.push(`${f.path}: only .md and .yaml files`);
    const n = f.text.split("\n").length;
    if (n > MAX_LINES) problems.push(`${f.path}: ${n} lines (max ${MAX_LINES}; ${t.kind === "skill" ? "split into references/" : "agents are one file: tighten, no references/"})`);
  }
  const mainFile = files.find((f) => f.path === main);
  if (!mainFile) return [...problems, `missing ${main}`];

  // Frontmatter.
  const fm = parseFrontmatter(mainFile.text);
  const expectName = t.kind === "skill" ? basename(t.path) : basename(t.path, ".md");
  if (!fm) problems.push(`${main}: missing --- frontmatter ---`);
  else {
    if (fm.name !== expectName) problems.push(`${main}: frontmatter name must be ${expectName} (got ${fm.name ?? "none"})`);
    if (!fm.description) problems.push(`${main}: frontmatter description is empty`);
    else if (fm.description.length > 1024) problems.push(`${main}: description over 1024 chars`);
    if (t.kind === "agent") {
      if (fm.model !== "sonnet") problems.push(`${main}: frontmatter model must be sonnet`);
      const tools = (fm.tools ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      for (const x of tools) if (!t.tools.allowed.includes(x)) problems.push(`${main}: tool ${x} not allowed (allowed: ${t.tools.allowed.join(", ")})`);
      for (const x of t.tools.required) if (!tools.includes(x)) problems.push(`${main}: tools must include ${x}`);
    }
  }

  // Rule markers.
  const cited = new Set();
  for (const f of files) {
    const lines = f.text.split("\n");
    lines.forEach((line, i) => {
      for (const m of line.matchAll(MARKER_RE)) {
        const r = byId.get(m[1]);
        if (!r) problems.push(`${f.path}:${i + 1}: unknown rule ${m[1]}`);
        else if (r.status === "deferred") problems.push(`${f.path}:${i + 1}: ${m[1]} is deferred`);
        else if ((r.cover ?? "instructions") === "tests") problems.push(`${f.path}:${i + 1}: ${m[1]} is test-only (cover: tests)`);
        else cited.add(m[1]);
      }
      if (markerOnly(line)) {
        if ([...line.matchAll(MARKER_RE)].length > 1) problems.push(`${f.path}:${i + 1}: several markers on a line with no prose`);
        if (i > 0 && markerOnly(lines[i - 1])) problems.push(`${f.path}:${i + 1}: stacked marker-only lines; put each marker beside the prose that states its rule`);
      }
    });
  }
  for (const id of t.cite) if (!cited.has(id)) problems.push(`missing marker <!-- rule:${id} -->`);

  // Literals and forbidden content.
  const all = files.map((f) => f.text).join("\n");
  for (const lit of t.literals) if (!all.includes(lit)) problems.push(`missing literal: ${lit}`);
  for (const f of files) {
    f.text.split("\n").forEach((line, i) => {
      const at = `${f.path}:${i + 1}`;
      if (line.includes(SECTION_SIGN)) problems.push(`${at}: section-sign symbol (write "section 6.2")`);
      if (line.includes("\ufffd")) problems.push(`${at}: broken character U+FFFD (copy/encoding damage)`);
      const cut = line.match(CUT_COMMAND_RE);
      if (cut) problems.push(`${at}: cut or deferred command "${cut[0]}"`);
      if (/npx\s+hyperframes(?!@0\.8\.223\b)/.test(line)) problems.push(`${at}: unpinned hyperframes (use npx hyperframes@0.8.223)`);
      for (const fb of t.forbid ?? []) if (fb.re.test(line)) problems.push(`${at}: ${fb.why}`);
    });
  }
  for (const v of findViolations(files, patterns)) problems.push(`${v.path}:${v.line}: forbidden research-reference name`);

  // References named in SKILL.md: bare `references/x` must be in the bundle;
  // `skills/<other>/references/x` (another skill's file) must already exist on disk.
  if (t.kind === "skill") {
    const have = new Set(files.map((f) => f.path));
    for (const m of mainFile.text.matchAll(/(?:skills\/([\w-]+)\/)?references\/[\w./-]+\.(?:md|yaml)\b/g)) {
      const other = m[1];
      if (other && `skills/${other}` !== t.path) {
        if (!exists(m[0])) problems.push(`${main}: names ${m[0]} but that file does not exist`);
        continue;
      }
      const rel = m[0].replace(/^skills\/[\w-]+\//, "");
      const p = `${t.path}/${rel}`;
      if (!have.has(p)) problems.push(`${main}: names ${rel} but the bundle has no ${p}`);
    }
  }
  return [...new Set(problems)];
}

function walkFiles(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walkFiles(p, out);
    else out.push(p);
  }
  return out;
}

export function readTarget(name, root = ROOT) {
  const t = TARGETS[name];
  const abs = join(root, t.path);
  if (!existsSync(abs)) return null;
  const paths = t.kind === "skill" ? walkFiles(abs) : [abs];
  return paths.map((p) => ({ path: relative(root, p), text: readFileSync(p, "utf8") }));
}

// Proposal excerpts: heading "## N." or "### N.N" up to the next heading of the same or higher level.
export function excerpt(text, section) {
  const lines = text.split("\n");
  const depth = section.includes(".") ? 3 : 2;
  const head = new RegExp(`^#{${depth}} ${section.replace(".", "\\.")}[ .]`);
  const start = lines.findIndex((l) => head.test(l));
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const h = lines[i].match(/^(#{1,6}) /);
    if (h && h[1].length <= depth) { end = i; break; }
  }
  return lines.slice(start, end).join("\n").trim();
}

export function buildBrief(name, rules, { proposal = null, summary = "", done = [] } = {}) {
  const t = TARGETS[name];
  const byId = new Map(rules.map((r) => [r.id, r]));
  const out = [];
  const target = t.kind === "skill" ? `${t.path}/SKILL.md (plus optional ${t.path}/references/*.md)` : t.path;
  out.push(`You are writing \`${target}\` for Imagine, a Claude Code plugin (repo github.com/rfxlamia/imagine, branch \`${BRANCH}\`, open as pull request #4: https://github.com/rfxlamia/imagine/pull/4).`);
  out.push("This is a written exercise: you cannot run tools here and must not pretend you did. Produce the file contents only.");
  out.push("");
  out.push("## Read first (on that branch / in pull request #4, not on main)");
  out.push("- `docs/contracts/rules.yaml` (rule registry), `docs/contracts/cli-contract.md` (the 12 kit commands, envelope, exit codes), `docs/contracts/source-formats.md` (project files, STORY.md, gates, patch inputs), `docs/contracts/claude-code-platform.md` (plugin facts).");
  out.push("- `tests/behavioral/red/SUMMARY.md` (how models fail without these instructions) and `tools/wp6/allocation.mjs` (what every file must carry).");
  if (name === "scene-builder") out.push("- `hooks/scene-builder-scope-lib.mjs` (what the PreToolUse hook allows this agent to do).");
  if (done.length) out.push(`- Files already written, for consistent terms: ${done.map((d) => `\`${TARGETS[d].path}\``).join(", ")}.`);
  out.push("- Do not open `tests/behavioral/scenarios/`; those are held-out test prompts.");
  out.push("- This reading list is for you, the author. At runtime the file runs inside a user's film project where none of these repo files exist, so do not tell the runtime agent to read them or mention the branch, the pull request, the RED summary or the allocation map.");
  out.push("");
  out.push("## Role of this file");
  out.push(t.role);
  out.push("");
  out.push("## Contract completeness");
  out.push("Write the complete contract from this first version, never a thin or skeleton draft: responsibility, ownership, inputs and outputs, state transitions, gates, capability limits (including what does not exist), audit, validation, failure and recovery. If the file would pass the size budget only by dropping rules, move detail into references instead.");
  if (t.kind === "skill") out.push("Include a `Mandatory files` section: for every stage this skill runs, the exact project and plugin files the main agent reads in full before the stage, after resume and after compaction (this replaces the cut `brief` command). Audit and review stages always list `bible.yaml` and `style.md`.");
  out.push("");
  out.push("## Re-plan notes (these override the proposal excerpts below)");
  out.push(REPLAN_NOTES);
  out.push("");
  if (t.literals.includes("## Waivers")) {
    out.push("REVIEW.md waivers section format (copy the field keys verbatim; values shown are examples):");
    out.push("```markdown", WAIVER_FORMAT, "```", "", "Waiver rules:", WAIVER_RULES, "");
  }
  out.push("## Rules to embed");
  out.push("State each rule in your own words as an instruction, where it applies in the workflow, and put its marker `<!-- rule:ID -->` at the end of that sentence or bullet. One marker per rule is enough; a line must never hold only markers, and markers must not be stacked or dumped in a list.");
  for (const id of t.cite) {
    const r = byId.get(id);
    out.push(`- ${id} (${r.source}): ${r.text}`);
  }
  out.push("");
  out.push("## Required literal strings (must appear exactly)");
  for (const l of t.literals) out.push(`- \`${l}\``);
  out.push("");
  if (summary) {
    out.push("## Failures seen without instructions (WP5 RED) that this file must prevent");
    out.push(summary.trim());
    out.push("");
  }
  out.push("## Format");
  if (t.kind === "skill") {
    out.push(`- \`${t.path}/SKILL.md\` starts with YAML frontmatter: \`name: ${basename(t.path)}\` and a \`description\` (one paragraph, max 1024 characters) that says when Claude should load the skill.`);
    out.push(`- Every file at most ${MAX_LINES} lines. Every \`references/...\` path named in SKILL.md must be one of the files you output.`);
  } else {
    out.push(`- Frontmatter: \`name: ${basename(t.path, ".md")}\`, \`description\`, \`tools: ${t.tools.allowed.join(", ")}\` (no others), \`model: sonnet\`.`);
    out.push(`- At most ${MAX_LINES} lines.`);
  }
  out.push("- To say a cut command does not exist, name it without the kit prefix (\"there is no guard command; hash the protected files yourself\"). The gate rejects any `imagine-kit <cut command>` string, even in a negative sentence.");
  out.push("- English. Never use the section-sign symbol; write \"section 6.2\". Never name an image model or any research reference skill. Pin every HyperFrames call as `npx hyperframes@0.8.223`.");
  out.push("- Output every file as a block, nothing else between blocks:");
  out.push("```text", `=== FILE: ${t.kind === "skill" ? `${t.path}/SKILL.md` : t.path} ===`, "<full file contents>", "=== END FILE ===", "```");
  if (proposal) {
    out.push("");
    out.push("## Architecture proposal excerpts (written before the re-plan; the re-plan notes above win on any conflict)");
    for (const s of t.sections) {
      const e = excerpt(proposal, s);
      if (e) out.push("", e);
    }
  }
  return out.join("\n") + "\n";
}

function summaryFor(name, text) {
  const row = text.split("\n").find((l) => l.startsWith(`| ${name} |`));
  const cross = text.slice(text.indexOf("## Cross-cutting"));
  return [row ? `This file's RED row (Fails | Partial | Pass):\n${row}` : "", cross.replace(/^## /, "### ")].filter(Boolean).join("\n\n");
}

function fail(msg, code = 1) {
  console.error(msg);
  process.exit(code);
}

function present(root = ROOT) {
  return ORDER.filter((n) => existsSync(join(root, TARGETS[n].path)));
}

function main([cmd, ...args]) {
  const rules = loadRules();
  const patterns = loadPatterns();
  if (cmd === "brief") {
    const name = args[0];
    if (!TARGETS[name]) fail(`usage: brief <${ORDER.join("|")}>`, 2);
    const pPath = join(ROOT, "docs/architecture-proposal.md");
    const proposal = existsSync(pPath) ? readFileSync(pPath, "utf8") : null;
    if (!proposal) console.error("warning: docs/architecture-proposal.md not found; brief has no proposal excerpts");
    const summary = summaryFor(name, readFileSync(join(ROOT, "tests/behavioral/red/SUMMARY.md"), "utf8"));
    const text = buildBrief(name, rules, { proposal, summary, done: present().filter((n) => n !== name) });
    const bad = findViolations([{ path: "brief", text }], patterns);
    if (bad.length) fail(`brief contains a forbidden name on line(s) ${bad.map((v) => v.line).join(", ")}`);
    process.stdout.write(text);
    return;
  }
  if (cmd === "save") {
    const name = args[0];
    if (!TARGETS[name]) fail(`usage: save <${ORDER.join("|")}> < bundle`, 2);
    const { files, problems } = parseBundle(readFileSync(0, "utf8"));
    const all = [...problems, ...(files.length ? checkTarget(name, files, rules, patterns) : [])];
    if (all.length) fail(`NOT SAVED (${all.length} problem(s)):\n${all.map((p) => `  - ${p}`).join("\n")}`);
    const t = TARGETS[name];
    const abs = join(ROOT, t.path);
    if (t.kind === "skill" && existsSync(abs)) {
      const keep = new Set(files.map((f) => join(ROOT, f.path)));
      for (const p of walkFiles(abs)) if (!keep.has(p)) { rmSync(p); console.log(`removed stale ${relative(ROOT, p)}`); }
    }
    for (const f of files) {
      mkdirSync(dirname(join(ROOT, f.path)), { recursive: true });
      writeFileSync(join(ROOT, f.path), f.text);
      console.log(`saved ${f.path}`);
    }
    return;
  }
  if (cmd === "check") {
    const names = args.length ? args : present();
    let bad = 0;
    for (const n of names) {
      if (!TARGETS[n]) fail(`unknown target ${n}`, 2);
      const files = readTarget(n);
      const probs = files ? checkTarget(n, files, rules, patterns) : [`${TARGETS[n].path} not found`];
      console.log(`${probs.length ? "FAIL" : "ok  "} ${n}`);
      for (const p of probs) console.log(`  - ${p}`);
      if (probs.length) bad += 1;
    }
    if (bad) process.exit(1);
    return;
  }
  if (cmd === "status") {
    let ok = 0;
    for (const n of ORDER) {
      const files = readTarget(n);
      const state = !files ? "todo" : checkTarget(n, files, rules, patterns).length ? "FAIL" : "ok";
      if (state === "ok") ok += 1;
      console.log(`${state.padEnd(4)} ${n}`);
    }
    const tr = spawnSync(process.execPath, [join(ROOT, "tools/check-traceability.mjs"), "--classes", "HARD,GATE"], { encoding: "utf8" });
    const missing = (tr.stderr.match(/^missing /gm) ?? []).length;
    console.log(`\n${ok}/${ORDER.length} targets ok; traceability HARD,GATE: ${tr.status === 0 ? "ok" : `${missing} missing`}`);
    if (ok !== ORDER.length || tr.status !== 0) process.exit(1);
    return;
  }
  fail("usage: gate.mjs brief <name> | save <name> < bundle | check [name...] | status", 2);
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) main(process.argv.slice(2));
