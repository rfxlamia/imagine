#!/usr/bin/env node
// Web-chat scenario helper.
//   node tests/behavioral/run.mjs prompt <name>                       print the prompt block
//   node tests/behavioral/run.mjs save <red|green> <name> <slug> <label>   stdin answer -> <phase>/<name>.<slug>.md
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { findViolations, loadPatterns } from "../../tools/check-forbidden-names.mjs";

const here = join(fileURLToPath(import.meta.url), "..");
const PHASES = new Set(["red", "green"]);
const SLUGS = new Set(["chatgpt", "gemini"]);

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

function extractPrompt(text) {
  const m = text.match(/^## Prompt\s*\n+(`{4,})text\n([\s\S]*?)\n\1\s*$/m);
  if (!m) throw new Error("no ## Prompt block with a ````text fence");
  return m[2] + "\n";
}

function scenarioText(name) {
  const p = join(here, "scenarios", `${name}.md`);
  if (!existsSync(p)) fail(`unknown scenario: ${name}`);
  return readFileSync(p, "utf8");
}

function main([cmd, ...args]) {
  if (cmd === "prompt") {
    if (args.length !== 1) fail("usage: prompt <name>");
    process.stdout.write(extractPrompt(scenarioText(args[0])));
    return;
  }
  if (cmd === "save") {
    const [phase, name, slug, label] = args;
    if (!PHASES.has(phase) || !name || !SLUGS.has(slug) || !label) fail("usage: save <red|green> <name> <chatgpt|gemini> <model label>");
    const promptSha = createHash("sha256").update(extractPrompt(scenarioText(name))).digest("hex").slice(0, 12);
    const answer = readFileSync(0, "utf8").trim();
    if (!answer) fail("empty answer on stdin");
    const bad = findViolations([{ path: "stdin", text: answer }], loadPatterns());
    if (bad.length) fail(`forbidden name on answer line(s): ${bad.map((v) => v.line).join(", ")}; not saved`);
    const date = new Date().toISOString().slice(0, 10);
    const header = `# ${phase.toUpperCase()}: ${name} (${slug})\n\n- model: ${label}\n- date: ${date}\n- prompt sha256: ${promptSha}\n- chat: temporary, memory off, prompt sent verbatim, no follow-up\n\n## Answer\n\n`;
    mkdirSync(join(here, phase), { recursive: true });
    const out = join(here, phase, `${name}.${slug}.md`);
    writeFileSync(out, header + answer + "\n");
    console.log(`saved ${out}`);
    return;
  }
  fail("usage: run.mjs prompt <name> | save <red|green> <name> <chatgpt|gemini> <model label>");
}

main(process.argv.slice(2));
