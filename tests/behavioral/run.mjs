#!/usr/bin/env node
// Web-chat scenario helper.
//   node tests/behavioral/run.mjs prompt <name> [--green]                  print the prompt block (GREEN: with the fixed preamble)
//   node tests/behavioral/run.mjs save <red|green> <name> <slug> <label>   stdin answer -> <phase>/<name>.<slug>.md
//   node tests/behavioral/run.mjs pack [--for <name>] [out-dir]            GREEN upload: <base>.zip + <base>.md
//   node tests/behavioral/run.mjs compare <name> <slug>                    grading sheet: criteria, RED grade, GREEN answer
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

export function parseHeader(text) {
  const field = (k) => text.match(new RegExp(`^- ${k}: (.+)$`, "m"))?.[1].trim() ?? null;
  return { model: field("model"), sha: field("prompt sha256") };
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

function pack(args) {
  const i = args.indexOf("--for");
  const name = i >= 0 ? args[i + 1] : null;
  if (i >= 0 && !name) fail("usage: pack [--for <name>] [out-dir]");
  const outDir = args.filter((_, j) => i < 0 || (j !== i && j !== i + 1))[0] ?? join(tmpdir(), "imagine-green");
  let paths;
  try {
    paths = packFiles(name);
  } catch (e) {
    fail(e.message);
  }
  const files = paths.map((p) => ({ path: p, text: readFileSync(join(repo, p), "utf8") }));
  const bad = findViolations(files, loadPatterns());
  if (bad.length) fail(`forbidden name in ${bad.map((v) => `${v.path}:${v.line}`).join(", ")}; nothing packed`);
  mkdirSync(outDir, { recursive: true });
  const base = name ? `imagine-green-${name}` : "imagine-green";
  const zip = join(outDir, `${base}.zip`);
  const md = join(outDir, `${base}.md`);
  rmSync(zip, { force: true });
  execFileSync("zip", ["-X", "-q", zip, ...paths], { cwd: repo });
  writeFileSync(md, bundleMarkdown(files));
  console.log(`packed ${paths.length} files\n${zip}\n${md}`);
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
  const header = `# ${phase.toUpperCase()}: ${name} (${slug})\n\n- model: ${label}\n- date: ${date}\n- prompt sha256: ${sha}\n- chat: ${chat}\n\n## Answer\n\n`;
  mkdirSync(join(here, phase), { recursive: true });
  const out = join(here, phase, `${name}.${slug}.md`);
  writeFileSync(out, header + answer + "\n");
  console.log(`saved ${out}`);
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
    part("GREEN answer", green && extractSection(green, "Answer")),
  ].join("\n"));
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
  fail("usage: run.mjs prompt <name> [--green] | save <red|green> <name> <chatgpt|gemini> <model label> | pack [--for <name>] [out-dir] | compare <name> <chatgpt|gemini>");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2));
