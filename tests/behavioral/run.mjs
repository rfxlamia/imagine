#!/usr/bin/env node
// Web-chat scenario helper.
//   node tests/behavioral/run.mjs prompt <name> [--green]                  print the prompt block (GREEN: with the fixed preamble)
//   node tests/behavioral/run.mjs save <red|green> <name> <slug> <label>   stdin answer -> <phase>/<name>.<slug>.md
//   node tests/behavioral/run.mjs pack [--for <name|group>] [out-dir]      GREEN upload: <base>.zip + <base>.md
//   node tests/behavioral/run.mjs compare <name> <slug>                    grading sheet: criteria, RED grade, GREEN answer
//   node tests/behavioral/run.mjs check <name> <slug>                      machine-readable check of a stored GREEN answer
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { findViolations, loadPatterns } from "../../tools/check-forbidden-names.mjs";

const here = join(fileURLToPath(import.meta.url), "..");
const repo = join(here, "..", "..");
const PHASES = new Set(["red", "green"]);
const SLUGS = new Set(["chatgpt", "gemini"]);
// Only tracked files ship, so gitignored placeholders never reach the upload.
// Scenarios stay out: their targets and pass criteria would leak the grading.
const MANIFEST = ".claude-plugin/plugin.json";
const PACK_ROOTS = ["skills", "agents", MANIFEST];
// Contract groups: skills that read each other's files. A focused pack proves
// one skill's own comprehension; a group pack puts the contracts that meet in
// one bundle, so a contradiction between them is visible in a single read.
export const CONTRACT_GROUPS = {
  router: ["imagine", "imagine-canon", "imagine-plan", "imagine-edit", "imagine-deliver"],
};
// Where a pack manifest of a scope is kept. Transient run artifact: the
// auditable record of what was uploaded is the sha256 and commit the GREEN
// result carries.
const PACK_DIR = join(here, "packs");
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

// Parse a fenced yaml block with a real yaml parser. The parser is the
// authority on whether the block is valid yaml: an indentation heuristic
// cannot see malformed flow syntax such as "inputs: [unclosed".
export function yamlBlockErrors(block) {
  const doc = YAML.parseDocument(block, { prettyErrors: true });
  return doc.errors.map((e) => e.message.split("\n")[0].replace(/:$/, ""));
}

// The parsed value of a block, or null when it does not parse.
export function parseYamlBlock(block) {
  try {
    return YAML.parse(block);
  } catch {
    return null;
  }
}

// Top-level mapping keys of a yaml block. Best effort on a block that does
// not parse, so a missing key is still reported next to the syntax error.
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

// The kit's own patch schema is the authority for a patch's shape. Its hash
// patterns are not applied here: a scenario's dispatch may hand out short
// hashes, so the check is on the shape and the type of each required key.
export function patchKeyTypes(root = repo) {
  const schema = JSON.parse(readFileSync(join(root, "packages/imagine-kit/schemas/patch.schema.json"), "utf8"));
  const types = {};
  for (const [key, spec] of Object.entries(schema.properties ?? {})) {
    if (spec.enum) { types[key] = { kind: "enum", values: spec.enum }; continue; }
    const t = Array.isArray(spec.type) ? spec.type[0] : spec.type;
    types[key] = { kind: t };
  }
  return types;
}

function typeError(value, spec) {
  if (spec.kind === "enum") return spec.values.includes(value) ? null : `must be one of ${spec.values.join(", ")}`;
  switch (spec.kind) {
    case "string": return typeof value === "string" ? null : "must be a string";
    case "integer": return Number.isInteger(value) ? null : "must be an integer";
    case "number": return typeof value === "number" ? null : "must be a number";
    case "object": return value && typeof value === "object" && !Array.isArray(value) ? null : "must be a mapping";
    case "array": return Array.isArray(value) ? null : "must be a sequence";
    case "boolean": return typeof value === "boolean" ? null : "must be a boolean";
    default: return null;
  }
}

// The status a subagent answer declares: done, blocked or done with issues.
// A blocked report is an allowed diagnostic, so it is not a missing patch.
export function declaresBlocked(answer) {
  const m = answer.match(/^\s*(?:status\s*:\s*)?(done with issues|blocked|done)\b/im);
  return Boolean(m) && /^blocked$/i.test(m[1].trim());
}

// Required top-level patch keys, declared by the scenario one per line.
export function requiredPatchKeys(scenario) {
  const section = extractSection(scenario, "Required patch keys");
  if (!section) return null;
  return section.split("\n").map((s) => s.trim()).filter((s) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(s));
}

// Machine-readable check of a stored answer: yaml shape plus the patch keys
// the scenario requires. Used before grading, so a patch that cannot be
// applied is never graded as a pass. A scenario that requires an applicable
// patch and gets none fails closed, unless the answer declares itself
// blocked.
export function checkAnswerPatch(scenario, answer) {
  const errors = [];
  const blocks = yamlBlocks(answer);
  blocks.forEach((b, i) => {
    for (const e of yamlBlockErrors(b)) errors.push(`yaml block ${i + 1}: ${e}`);
  });
  const required = requiredPatchKeys(scenario);
  if (required) {
    if (!blocks.length) {
      const answerText = extractAnswer(answer) ?? answer;
      if (!declaresBlocked(answerText)) errors.push("the answer returns no applicable patch");
    } else {
      const top = topLevelKeys(blocks[0]);
      const types = patchKeyTypes();
      const parsed = parseYamlBlock(blocks[0]);
      for (const key of required) {
        if (!top.includes(key)) { errors.push(`patch is missing the required top-level key "${key}"`); continue; }
        const spec = types[key];
        if (!spec || !parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;
        const problem = typeError(parsed[key], spec);
        if (problem) errors.push(`patch key "${key}" ${problem}`);
      }
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
// With a contract group: every skill in the group, so the contracts that read
// each other are read together.
export function scopeRoots(name = null) {
  if (!name) return PACK_ROOTS;
  const group = CONTRACT_GROUPS[name];
  if (group) return [...group.map((g) => `skills/${g}/`), MANIFEST];
  return [`skills/${name}/`, `agents/${name}.md`, MANIFEST];
}

// The rules the kit itself decides. The kit is the enforcement point, so a
// rule it decides cannot be waived: a REVIEW.md entry cannot change a tool
// result.
export function kitEnforcedRules(root = repo) {
  const sources = [
    "packages/imagine-kit/src/story/validate.mjs",
    "packages/imagine-kit/src/commands/gate.mjs",
    "packages/imagine-kit/src/commands/patch-apply.mjs",
  ];
  const ids = new Set();
  for (const f of sources) {
    const text = readFileSync(join(root, f), "utf8");
    for (const m of text.matchAll(/"(HARD-[A-Z0-9-]+)"/g)) ids.add(m[1]);
  }
  return [...ids].sort();
}

// Sentences of an instruction file: line breaks and sentence ends separate
// them, so a rule named in one sentence is not judged by the next.
export function sentences(text) {
  return text.split(/\n+|(?<=\.)\s+/).map((s) => s.trim()).filter(Boolean);
}

const NOT_WAIVABLE = /\b(?:non[- ]?waivable|not\s+waivable|never\s+waivable|cannot\s+be\s+waived|unwaivable)\b/gi;

// Rules a file offers to waive. A rule a file lists as non-waivable is not an
// offer, so the two are told apart before the rules are named.
export function waiverOffers(text, rules = null) {
  const enforced = rules ? new Set(rules) : null;
  const offers = [];
  for (const s of sentences(text)) {
    if (!/\bwaivable\b/i.test(s.replace(NOT_WAIVABLE, "blocked"))) continue;
    for (const m of s.matchAll(/\bHARD-[A-Z0-9-]+\b/g)) {
      if (enforced && !enforced.has(m[0])) continue;
      offers.push({ rule: m[0], sentence: s });
    }
  }
  return offers;
}

// Every instruction file: the skills and the agents an agent may read.
export function instructionFiles(root = repo) {
  const files = [];
  for (const dir of ["skills", "agents"]) {
    const stack = [join(root, dir)];
    while (stack.length) {
      const cur = stack.pop();
      for (const entry of readdirSync(cur, { withFileTypes: true })) {
        const p = join(cur, entry.name);
        if (entry.isDirectory()) { stack.push(p); continue; }
        if (!entry.name.endsWith(".md")) continue;
        files.push({ path: p.slice(root.length + 1), text: readFileSync(p, "utf8") });
      }
    }
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

// The files that carry the non-waivable invariant. The rule marker is what
// makes the set reliable: a file that enumerates the list declares the rule.
export function nonWaivableFiles(root = repo) {
  return instructionFiles(root).filter((f) => f.text.includes("rule:HARD-NON-WAIVABLE"));
}

export function packFiles(name = null, root = repo) {
  const roots = scopeRoots(name);
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
  const roots = scopeRoots(name);
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

function gitCommit(root = repo) {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

// The identity of an uploaded bundle: the exact bytes that went to the model
// and the commit that carries them. Written at pack time, so a result can be
// tied to the instructions it was really tested against and not to whatever
// the checkout holds when the answer is pasted back.
export function packIdentity(name = null, root = repo) {
  const files = bundleFiles(name, root);
  return {
    scope: name ?? "plugin",
    bundleSha256: createHash("sha256").update(bundleMarkdown(files)).digest("hex"),
    commit: gitCommit(root),
    files: files.map((f) => ({ path: f.path, sha256: createHash("sha256").update(f.text).digest("hex") })),
    packedAt: new Date().toISOString(),
  };
}

export function packManifestPath(name = null, dir = PACK_DIR) {
  return join(dir, `${name ?? "plugin"}.json`);
}

export function writePackManifest(identity, dir = PACK_DIR) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(packManifestPath(identity.scope === "plugin" ? null : identity.scope, dir),
    JSON.stringify(identity, null, 2) + "\n");
}

export function readPackManifest(name = null, dir = PACK_DIR) {
  const p = packManifestPath(name, dir);
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
}

// The packed bytes must still be the bytes on disk, or the result would
// claim to have tested instructions nobody sent. The commit must also carry
// them, or the record could not be checked against the instructions it names.
export function checkPacked(identity, currentSha, name = null, root = repo) {
  if (!identity) return "no packed bundle recorded; run `pack` before saving the answer";
  if (currentSha !== identity.bundleSha256) {
    return `the bundle changed since it was packed (packed ${identity.bundleSha256.slice(0, 12)}, now ${currentSha.slice(0, 12)}); re-pack before saving`;
  }
  if (identity.commit === "unknown") return null;
  let carried = null;
  try {
    carried = bundleShaAt(identity.commit, name, root);
  } catch {
    carried = null;
  }
  if (carried !== identity.bundleSha256) {
    return `the packed bundle is not what commit ${identity.commit.slice(0, 7)} carries; commit the changes and pack again`;
  }
  return null;
}

export function packMismatch(identity, name = null, root = repo) {
  if (!identity) return "no packed bundle recorded; run `pack` before saving the answer";
  return checkPacked(identity, bundleSha(name, root), name, root);
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
  const identity = packIdentity(name);
  writePackManifest(identity);
  const dirty = identity.commit !== "unknown" && bundleShaAt(identity.commit, name) !== identity.bundleSha256;
  console.log([
    `packed ${files.length} files`,
    `bundle sha256: ${identity.bundleSha256}`,
    `tested commit: ${identity.commit}`,
    ...(dirty ? [`warning: the working tree differs from ${identity.commit.slice(0, 7)}; commit it before the result is saved`] : []),
    zip,
    md,
  ].join("\n"));
}

function scenarioText(name) {
  const p = join(here, "scenarios", `${name}.md`);
  if (!existsSync(p)) fail(`unknown scenario: ${name}`);
  return readFileSync(p, "utf8");
}

function readIfExists(p) {
  return existsSync(p) ? readFileSync(p, "utf8") : null;
}

// The header of a stored result. A GREEN result carries the bundle and the
// commit of the pack that was uploaded, never a value recomputed later.
export function resultHeader({ phase, name, slug, label, sha, round, identity, date = new Date().toISOString().slice(0, 10) }) {
  const head = [
    `- model: ${label}`,
    `- date: ${date}`,
    `- round: ${round}`,
    `- prompt sha256: ${sha}`,
    ...(identity ? [`- bundle sha256: ${identity.bundleSha256}`, `- tested commit: ${identity.commit}`] : []),
    `- chat: ${chatText(phase, name, identity)}`,
  ].join("\n");
  return `# ${phase.toUpperCase()}: ${name} (${slug})\n\n${head}\n\n## Answer\n\n`;
}

// How the run was carried out. The attachment names the scope that was
// packed, so the bundle a result claims can be recomputed from it.
export function chatText(phase, name, identity = null) {
  if (phase !== "green") return "temporary, memory off, prompt sent verbatim, no follow-up";
  const scope = identity?.scope ?? name;
  const attachment = scope === "plugin" ? "imagine-green upload" : `imagine-green-${scope}.md`;
  return `temporary, memory off, ${attachment} attached, fixed GREEN preamble + prompt sent verbatim, no follow-up`;
}

function save(args) {
  const si = args.indexOf("--scope");
  const scope = si >= 0 ? args[si + 1] : null;
  const positional = si >= 0 ? args.filter((_, j) => j !== si && j !== si + 1) : args;
  const [phase, name, slug, label] = positional;
  if (!PHASES.has(phase) || !name || !SLUGS.has(slug) || !label) fail("usage: save <red|green> <name> <chatgpt|gemini> <model label> [--scope <scope>]");
  if (si >= 0 && !scope) fail("--scope needs a scope name, or plugin for the whole plugin");
  const sha = promptSha(scenarioText(name));
  // The scope a pack covers: a skill or agent name, a contract group, or the
  // whole plugin.
  const bundleScope = scope === "plugin" ? null : (scope ?? name);
  let identity = null;
  if (phase === "green") {
    const check = checkGreenAgainstRed(readIfExists(join(here, "red", `${name}.${slug}.md`)), sha, label);
    if (check.error) fail(check.error);
    if (check.warning) console.error(`warning: ${check.warning}`);
    // GREEN is tested against the bundle that was uploaded, so the pack that
    // produced it is required: the answer must not claim to have tested
    // instructions that changed after the upload.
    identity = readPackManifest(bundleScope);
    const mismatch = packMismatch(identity, bundleScope);
    if (mismatch) fail(mismatch);
  }
  const answer = readFileSync(0, "utf8").trim();
  if (!answer) fail("empty answer on stdin");
  const bad = findViolations([{ path: "stdin", text: answer }], loadPatterns());
  if (bad.length) fail(`forbidden name on answer line(s): ${bad.map((v) => v.line).join(", ")}; not saved`);
  const date = new Date().toISOString().slice(0, 10);
  mkdirSync(join(here, phase), { recursive: true });
  const out = join(here, phase, `${name}.${slug}.md`);
  // A re-run must never destroy the previous round: archive it first.
  const { round, archive } = nextRound(join(here, phase), name, slug);
  if (existsSync(out)) {
    copyFileSync(out, join(here, phase, `${name}.${slug}.r${archive}.md`));
  }
  const header = resultHeader({ phase, name, slug, label, sha, round, identity, date });
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

// The runs of a phase, with archived rounds excluded: an archive is an
// earlier round of the same run, not a run of its own.
export function committedRuns(dir) {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md") && f !== "SUMMARY.md" && !/\.r\d+\.md$/.test(f))
    .map((f) => f.replace(/\.md$/, ""));
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
  fail("usage: run.mjs prompt <name> [--green] | save <red|green> <name> <chatgpt|gemini> <model label> [--scope <scope>] | pack [--for <name|group>] [out-dir] | compare <name> <chatgpt|gemini> | check <name> <chatgpt|gemini>");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2));
