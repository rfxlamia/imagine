#!/usr/bin/env node
// Web-chat scenario helper.
//   node tests/behavioral/run.mjs prompt <name>                            print the prompt block
//   node tests/behavioral/run.mjs save <red|green> <name> <slug> <label>   stdin answer -> <phase>/<name>.<slug>.md
//   node tests/behavioral/run.mjs pack [out-dir]                           GREEN upload: imagine-green.zip + imagine-green.md
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
const PACK_ROOTS = ["skills", "agents", ".claude-plugin/plugin.json"];

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

export function packFiles(root = repo) {
  return execFileSync("git", ["ls-files", "--", ...PACK_ROOTS], { cwd: root, encoding: "utf8" })
    .split("\n").filter(Boolean).sort();
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

function pack(outDir) {
  const paths = packFiles();
  const files = paths.map((p) => ({ path: p, text: readFileSync(join(repo, p), "utf8") }));
  const bad = findViolations(files, loadPatterns());
  if (bad.length) fail(`forbidden name in ${bad.map((v) => `${v.path}:${v.line}`).join(", ")}; nothing packed`);
  mkdirSync(outDir, { recursive: true });
  const zip = join(outDir, "imagine-green.zip");
  const md = join(outDir, "imagine-green.md");
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
  const uploads = phase === "green" ? "imagine-green upload attached, " : "";
  const header = `# ${phase.toUpperCase()}: ${name} (${slug})\n\n- model: ${label}\n- date: ${date}\n- prompt sha256: ${sha}\n- chat: temporary, memory off, ${uploads}prompt sent verbatim, no follow-up\n\n## Answer\n\n`;
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
    if (args.length !== 1) fail("usage: prompt <name>");
    process.stdout.write(extractPrompt(scenarioText(args[0])));
    return;
  }
  if (cmd === "save") return save(args);
  if (cmd === "pack") return pack(args[0] ?? join(tmpdir(), "imagine-green"));
  if (cmd === "compare") return compare(args);
  fail("usage: run.mjs prompt <name> | save <red|green> <name> <chatgpt|gemini> <model label> | pack [out-dir] | compare <name> <chatgpt|gemini>");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2));
