#!/usr/bin/env node
// Web-chat scenario helper.
//   node tests/behavioral/run.mjs prompt <name> [--green]                  print the prompt block (GREEN: with the fixed preamble)
//   node tests/behavioral/run.mjs save <red|green> <name> <slug> <label>   stdin answer -> <phase>/<name>.<slug>.md
//   node tests/behavioral/run.mjs pack [--for <name>] [out-dir]            GREEN upload: <base>.zip + <base>.md
//   node tests/behavioral/run.mjs compare <name> <slug>                    grading sheet: criteria, RED grade, GREEN answer
//   node tests/behavioral/run.mjs check <name> <slug>                      machine-readable check of a stored GREEN answer
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { findViolations, loadPatterns } from "../../tools/check-forbidden-names.mjs";

const here = join(fileURLToPath(import.meta.url), "..");
const repo = join(here, "..", "..");
const PHASES = new Set(["red", "green"]);
const SLUGS = new Set(["chatgpt", "gemini"]);
// Only tracked files ship, so gitignored placeholders never reach the upload.
// Scenarios stay out: their targets and pass criteria would leak the grading.
const MANIFEST = ".claude-plugin/plugin.json";
const PACK_ROOTS = ["skills", "agents", MANIFEST];
// Sent before the scenario prompt in GREEN only. It sits outside the hashed
// prompt, so it must never change between GREEN runs.
export const GREEN_PREAMBLE = "Before answering, read the attached file in full; it holds the plugin's skill and agent instructions you must follow.\n\n";

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

export function extractPrompt(text) {
  const m = text.match(/^## Prompt\s*\n+(`{4,})text\n([\s\S]*?)\n\1\s*$/m);
  if (!m) throw new Error("no ## Prompt block with a ````text fence");
  return m[2] + "\n";
}

export function promptSha(text) {
  return createHash("sha256").update(extractPrompt(text)).digest("hex").slice(0, 12);
}

// Body of a "## <heading>" section, up to the next "## " heading.
export function extractSection(text, heading) {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => l.trim() === `## ${heading}`);
  if (start < 0) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith("## "));
  return (end < 0 ? rest : rest.slice(0, end)).join("\n").trim();
}

// The answer runs from "## Answer" to the "## Grade" boundary. The answer may
// carry its own "## " subheadings, so the boundary is the grade section, not
// the next heading.
export function extractAnswer(text) {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => l.trim() === "## Answer");
  if (start < 0) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.trim() === "## Grade");
  return (end < 0 ? rest : rest.slice(0, end)).join("\n").trim();
}

// Fenced yaml blocks inside an answer.
export function yamlBlocks(text) {
  return [...text.matchAll(/```ya?ml\n([\s\S]*?)```/g)].map((m) => m[1]);
}

const KEY_RE = /^("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^:]+?):(?:\s+(.*))?$/;
const SEQ_KEY_RE = /^([^\s:][^:]*):(?:\s|$)/;

// Structural lint for the YAML subset these answers use: block mappings, block
// sequences and inline scalars. It is not a full YAML parser. It enforces the
// rule YAML itself rejects - a mapping key indented deeper than a sibling that
// already carries a value - plus duplicate top-level keys.
export function yamlBlockErrors(block) {
  const errors = [];
  const lines = block.split("\n");
  let prev = null;
  const top = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const indent = raw.length - raw.trimStart().length;
    if (trimmed === "-" || trimmed.startsWith("- ")) {
      const rest = trimmed === "-" ? "" : trimmed.slice(2);
      const flow = rest.startsWith("{") || rest.startsWith("[");
      const m = flow ? null : rest.match(SEQ_KEY_RE);
      const col = indent + 2;
      if (prev && col > prev.col && prev.hadValue) {
        errors.push(`line ${i + 1}: indented deeper than the value on line ${prev.line}`);
      }
      prev = m
        ? { col, hadValue: rest.slice(m[0].length).trim().length > 0, line: i + 1 }
        : { col, hadValue: false, line: i + 1 };
      continue;
    }
    const m = trimmed.match(KEY_RE);
    if (!m) {
      errors.push(`line ${i + 1}: not a "key: value" mapping entry`);
      prev = null;
      continue;
    }
    if (prev && indent > prev.col && prev.hadValue) {
      errors.push(`line ${i + 1}: indented deeper than the value on line ${prev.line}`);
    }
    const key = m[1].trim();
    if (indent === 0) top.push(key);
    prev = { col: indent, hadValue: m[2] !== undefined && m[2].trim() !== "", line: i + 1 };
  }
  const seen = new Set();
  for (const key of top) {
    if (seen.has(key)) errors.push(`duplicate top-level key "${key}"`);
    seen.add(key);
  }
  return errors;
}

// Top-level mapping keys of a yaml block.
export function topLevelKeys(block) {
  const keys = [];
  for (const line of block.split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    if (/^\s/.test(line)) continue;
    const m = line.trim().match(KEY_RE);
    if (m) keys.push(m[1].trim());
  }
  return keys;
}

// Required top-level patch keys, declared by the scenario one per line.
export function requiredPatchKeys(scenario) {
  const section = extractSection(scenario, "Required patch keys");
  if (!section) return null;
  return section.split("\n").map((s) => s.trim()).filter((s) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(s));
}

// Machine-readable check of a stored answer: yaml shape plus the patch keys
// the scenario requires. Used before grading, so a patch that cannot be
// applied is never graded as a pass.
export function checkAnswerPatch(scenario, answer) {
  const errors = [];
  const blocks = yamlBlocks(answer);
  blocks.forEach((b, i) => {
    for (const e of yamlBlockErrors(b)) errors.push(`yaml block ${i + 1}: ${e}`);
  });
  const required = requiredPatchKeys(scenario);
  if (required && blocks.length) {
    const top = topLevelKeys(blocks[0]);
    for (const key of required) {
      if (!top.includes(key)) errors.push(`patch is missing the required top-level key "${key}"`);
    }
  }
  return errors;
}

export function parseHeader(text) {
  const field = (k) => text.match(new RegExp(`^- ${k}: (.+)$`, "m"))?.[1].trim() ?? null;
  return {
    model: field("model"),
    sha: field("prompt sha256"),
    round: field("round"),
    bundle: field("bundle sha256"),
    commit: field("tested commit"),
    chat: field("chat"),
  };
}

// GREEN must answer the exact prompt RED answered; the model label should match too.
export function checkGreenAgainstRed(redText, sha, label) {
  if (redText == null) return { error: "no RED run for this scenario and slug; run RED first" };
  const red = parseHeader(redText);
  if (red.sha !== sha) return { error: `prompt changed since RED (RED ${red.sha}, now ${sha}); re-run RED first` };
  return { warning: red.model !== label ? `model label differs from RED ("${red.model}")` : null };
}

// Without a name: the whole plugin. With one: that skill's folder or that
// agent's file plus the manifest, which is what Claude Code loads for it.
export function packFiles(name = null, root = repo) {
  const roots = name ? [`skills/${name}/`, `agents/${name}.md`, MANIFEST] : PACK_ROOTS;
  const files = execFileSync("git", ["ls-files", "--", ...roots], { cwd: root, encoding: "utf8" })
    .split("\n").filter(Boolean).sort();
  if (name && files.length < 2) throw new Error(`no tracked skill or agent named ${name}`);
  return files;
}

export function bundleMarkdown(files) {
  const head = [
    "# Imagine plugin files (skills, agents, manifest)",
    "",
    "Each file below sits between a `===== FILE: <path> =====` line and a `===== END FILE =====` line.",
    "",
  ];
  const body = files.flatMap((f) => [`===== FILE: ${f.path} =====`, f.text.replace(/\n$/, ""), "===== END FILE =====", ""]);
  return [...head, ...body].join("\n");
}

// The exact bytes of the upload bundle, so a result can be tied to the
// instructions it was tested against.
export function bundleSha(name = null, root = repo) {
  return createHash("sha256").update(bundleMarkdown(bundleFiles(name, root))).digest("hex");
}

// The same bundle as it stood at a commit, so a stored result can be checked
// against the instructions it claims to have been tested with.
export function bundleShaAt(commit, name = null, root = repo) {
  const roots = name ? [`skills/${name}/`, `agents/${name}.md`, MANIFEST] : PACK_ROOTS;
  const paths = execFileSync("git", ["ls-tree", "-r", "--name-only", commit, "--", ...roots], { cwd: root, encoding: "utf8" })
    .split("\n").filter(Boolean).sort();
  const files = paths.map((p) => ({
    path: p,
    text: execFileSync("git", ["show", `${commit}:${p}`], { cwd: root, encoding: "utf8" }),
  }));
  return createHash("sha256").update(bundleMarkdown(files)).digest("hex");
}

function bundleFiles(name = null, root = repo) {
  const paths = packFiles(name, root);
  return paths.map((p) => ({ path: p, text: readFileSync(join(root, p), "utf8") }));
}

function gitCommit() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function pack(args) {
  const i = args.indexOf("--for");
  const name = i >= 0 ? args[i + 1] : null;
  if (i >= 0 && !name) fail("usage: pack [--for <name>] [out-dir]");
  const outDir = args.filter((_, j) => i < 0 || (j !== i && j !== i + 1))[0] ?? join(tmpdir(), "imagine-green");
  let files;
  try {
    files = bundleFiles(name);
  } catch (e) {
    fail(e.message);
  }
  const bad = findViolations(files, loadPatterns());
  if (bad.length) fail(`forbidden name in ${bad.map((v) => `${v.path}:${v.line}`).join(", ")}; nothing packed`);
  mkdirSync(outDir, { recursive: true });
  const base = name ? `imagine-green-${name}` : "imagine-green";
  const zip = join(outDir, `${base}.zip`);
  const md = join(outDir, `${base}.md`);
  rmSync(zip, { force: true });
  execFileSync("zip", ["-X", "-q", zip, ...files.map((f) => f.path)], { cwd: repo });
  writeFileSync(md, bundleMarkdown(files));
  console.log(`packed ${files.length} files\nbundle sha256: ${bundleSha(name)}\n${zip}\n${md}`);
}

function scenarioText(name) {
  const p = join(here, "scenarios", `${name}.md`);
  if (!existsSync(p)) fail(`unknown scenario: ${name}`);
  return readFileSync(p, "utf8");
}

function readIfExists(p) {
  return existsSync(p) ? readFileSync(p, "utf8") : null;
}

function save([phase, name, slug, label]) {
  if (!PHASES.has(phase) || !name || !SLUGS.has(slug) || !label) fail("usage: save <red|green> <name> <chatgpt|gemini> <model label>");
  const sha = promptSha(scenarioText(name));
  if (phase === "green") {
    const check = checkGreenAgainstRed(readIfExists(join(here, "red", `${name}.${slug}.md`)), sha, label);
    if (check.error) fail(check.error);
    if (check.warning) console.error(`warning: ${check.warning}`);
  }
  const answer = readFileSync(0, "utf8").trim();
  if (!answer) fail("empty answer on stdin");
  const bad = findViolations([{ path: "stdin", text: answer }], loadPatterns());
  if (bad.length) fail(`forbidden name on answer line(s): ${bad.map((v) => v.line).join(", ")}; not saved`);
  const date = new Date().toISOString().slice(0, 10);
  const chat = phase === "green"
    ? `temporary, memory off, imagine-green-${name}.md attached, fixed GREEN preamble + prompt sent verbatim, no follow-up`
    : "temporary, memory off, prompt sent verbatim, no follow-up";
  mkdirSync(join(here, phase), { recursive: true });
  const out = join(here, phase, `${name}.${slug}.md`);
  // A re-run must never destroy the previous round: archive it first.
  const { round, archive } = nextRound(join(here, phase), name, slug);
  if (existsSync(out)) {
    copyFileSync(out, join(here, phase, `${name}.${slug}.r${archive}.md`));
  }
  // GREEN is tested against the uploaded instruction bundle, so record it.
  const bundle = phase === "green" ? bundleSha(name) : null;
  const head = [
    `- model: ${label}`,
    `- date: ${date}`,
    `- round: ${round}`,
    `- prompt sha256: ${sha}`,
    ...(bundle ? [`- bundle sha256: ${bundle}`, `- tested commit: ${gitCommit()}`] : []),
    `- chat: ${chat}`,
  ].join("\n");
  const header = `# ${phase.toUpperCase()}: ${name} (${slug})\n\n${head}\n\n## Answer\n\n`;
  writeFileSync(out, header + answer + "\n");
  console.log(`saved ${out}`);
}

// Round numbering: <name>.<slug>.md always holds the latest round, and every
// earlier round is kept next to it as <name>.<slug>.r<N>.md.
export function nextRound(dir, name, slug) {
  const prefix = `${name}.${slug}.r`;
  const rounds = existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.startsWith(prefix) && f.endsWith(".md"))
        .map((f) => Number(f.slice(prefix.length, -3)))
        .filter((n) => Number.isInteger(n))
    : [];
  const canonical = existsSync(join(dir, `${name}.${slug}.md`));
  return { round: rounds.length + (canonical ? 2 : 1), archive: rounds.length + 1 };
}

function compare([name, slug]) {
  if (!name || !SLUGS.has(slug)) fail("usage: compare <name> <chatgpt|gemini>");
  const scenario = scenarioText(name);
  const red = readIfExists(join(here, "red", `${name}.${slug}.md`));
  const green = readIfExists(join(here, "green", `${name}.${slug}.md`));
  const part = (title, text) => `## ${title}\n\n${text ?? "(missing)"}\n`;
  process.stdout.write([
    `# Grading sheet: ${name} (${slug})\n`,
    part("Targets", extractSection(scenario, "Targets")),
    part("Pass criteria", extractSection(scenario, "Pass criteria")),
    part("RED grade", red && extractSection(red, "Grade")),
    part("GREEN answer", green && extractAnswer(green)),
  ].join("\n"));
}

// Machine-readable pre-grading check of a stored answer.
function check([name, slug]) {
  if (!name || !SLUGS.has(slug)) fail("usage: check <name> <chatgpt|gemini>");
  const green = readIfExists(join(here, "green", `${name}.${slug}.md`));
  if (!green) fail(`no GREEN run for ${name} (${slug})`);
  const errors = checkAnswerPatch(scenarioText(name), green);
  if (!errors.length) {
    console.log(`ok: ${name} (${slug})`);
    return;
  }
  console.error(errors.map((e) => `${name}.${slug}.md: ${e}`).join("\n"));
  process.exit(1);
}

function main([cmd, ...args]) {
  if (cmd === "prompt") {
    const green = args.includes("--green");
    const rest = args.filter((a) => a !== "--green");
    if (rest.length !== 1) fail("usage: prompt <name> [--green]");
    process.stdout.write((green ? GREEN_PREAMBLE : "") + extractPrompt(scenarioText(rest[0])));
    return;
  }
  if (cmd === "save") return save(args);
  if (cmd === "pack") return pack(args);
  if (cmd === "compare") return compare(args);
  if (cmd === "check") return check(args);
  fail("usage: run.mjs prompt <name> [--green] | save <red|green> <name> <chatgpt|gemini> <model label> | pack [--for <name>] [out-dir] | compare <name> <chatgpt|gemini> | check <name> <chatgpt|gemini>");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2));
