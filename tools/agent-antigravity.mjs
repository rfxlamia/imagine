#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import {
  POLICY,
  buildManifest,
  parseFrontmatter,
} from "./agent-manifest.mjs";

export const VERIFIED_AGY_TOOLS = Object.freeze([
  "view_file",
  "find_by_name",
  "grep_search",
  "write_to_file",
  "replace_file_content",
  "run_command",
]);

export const AGY_TOOL_MAP = Object.freeze({
  Read: "view_file",
  Glob: "find_by_name",
  Grep: "grep_search",
  Write: "write_to_file",
  Edit: "replace_file_content",
  Bash: "run_command",
});

export function mapClaudeToolToAgy(tool) {
  if (!Object.prototype.hasOwnProperty.call(AGY_TOOL_MAP, tool)) {
    throw new Error(`No Antigravity tool mapping for Claude tool: ${tool}`);
  }
  return AGY_TOOL_MAP[tool];
}

export function buildAgyAgentFile(sourceText, filePath) {
  const match = sourceText.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    throw new Error(`Frontmatter is missing or unparsable in ${filePath}`);
  }
  const fm = parseFrontmatter(sourceText, filePath);
  let tools = [];
  if (typeof fm.tools === "string") {
    tools = fm.tools.split(",").map((t) => t.trim()).filter(Boolean);
  } else if (Array.isArray(fm.tools)) {
    tools = fm.tools.map((t) => String(t).trim()).filter(Boolean);
  } else {
    throw new Error(`Tools must be declared in ${filePath}`);
  }

  const agyTools = tools.map(mapClaudeToolToAgy);

  const frontmatterObj = {
    name: fm.name,
    description: fm.description ?? "",
    tools: agyTools,
    subagent: true,
    mainAgent: false,
    model: "inherit",
  };

  const body = sourceText.slice(match[0].length);
  return `---\n${YAML.stringify(frontmatterObj)}---\n${body}`;
}

export function serializeAgentsJson() {
  return JSON.stringify({ entries: [{ path: "agy-agents" }] }, null, 2) + "\n";
}

export function generateAgyAgents(repoRoot) {
  const rootCandidate = repoRoot ?? (process.env.IMAGINE_REPO_ROOT || join(fileURLToPath(import.meta.url), "../.."));
  let root;
  try {
    root = realpathSync(rootCandidate);
  } catch {
    root = rootCandidate;
  }

  // 1. Call buildManifest first (fail early on bad sources)
  const manifest = buildManifest(root);

  // 2. Emit all agents returned by buildManifest (all five agents, including scene-builder).
  // Gating is enforced by check-stage (host/check-stage.mjs), not by omitting the agent file.
  const targetAgents = manifest.agents;

  const generatedFiles = new Map();

  for (const agent of targetAgents) {
    const srcPath = join(root, agent.source);
    const srcText = readFileSync(srcPath, "utf8");
    const content = buildAgyAgentFile(srcText, srcPath);
    generatedFiles.set(`${agent.name}.md`, content);
  }

  const agentsJsonContent = serializeAgentsJson();

  return {
    root,
    generatedFiles,
    agentsJsonContent,
  };
}

export function writeAgyAgents(repoRoot) {
  const { root, generatedFiles, agentsJsonContent } = generateAgyAgents(repoRoot);
  const agyAgentsDir = join(root, "agy-agents");
  if (!existsSync(agyAgentsDir)) {
    mkdirSync(agyAgentsDir, { recursive: true });
  }

  for (const [fileName, content] of generatedFiles) {
    writeFileSync(join(agyAgentsDir, fileName), content, "utf8");
  }

  writeFileSync(join(root, "agents.json"), agentsJsonContent, "utf8");
}

export function checkAgyAgents(repoRoot) {
  const { root, generatedFiles, agentsJsonContent } = generateAgyAgents(repoRoot);

  const agentsJsonPath = join(root, "agents.json");
  if (!existsSync(agentsJsonPath)) {
    console.error("agents.json is missing; run node tools/agent-antigravity.mjs --write");
    return false;
  }

  const actualAgentsJson = readFileSync(agentsJsonPath, "utf8");
  if (actualAgentsJson !== agentsJsonContent) {
    console.error("agents.json is altered; run node tools/agent-antigravity.mjs --write");
    return false;
  }

  const agyAgentsDir = join(root, "agy-agents");
  if (!existsSync(agyAgentsDir)) {
    console.error("agy-agents directory is missing; run node tools/agent-antigravity.mjs --write");
    return false;
  }

  const actualFiles = readdirSync(agyAgentsDir).filter((name) => !name.startsWith("."));
  for (const file of actualFiles) {
    if (!generatedFiles.has(file)) {
      console.error(`Extra stale file in agy-agents/: ${file}; run node tools/agent-antigravity.mjs --write`);
      return false;
    }
  }

  for (const [fileName, expectedContent] of generatedFiles) {
    const filePath = join(agyAgentsDir, fileName);
    if (!existsSync(filePath)) {
      console.error(`Missing generated file: agy-agents/${fileName}; run node tools/agent-antigravity.mjs --write`);
      return false;
    }

    const actualContent = readFileSync(filePath, "utf8");
    if (actualContent !== expectedContent) {
      console.error(`agy-agents/${fileName} is stale; run node tools/agent-antigravity.mjs --write`);
      return false;
    }
  }

  return true;
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.length !== 1 || (argv[0] !== "--write" && argv[0] !== "--check")) {
    console.error("Usage: node tools/agent-antigravity.mjs <--write|--check>");
    process.exit(2);
  }

  const rootCandidate = process.env.IMAGINE_REPO_ROOT || join(fileURLToPath(import.meta.url), "../..");
  let root;
  try {
    root = realpathSync(rootCandidate);
  } catch {
    root = rootCandidate;
  }

  if (argv[0] === "--write") {
    try {
      writeAgyAgents(root);
      process.exit(0);
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  }

  if (argv[0] === "--check") {
    try {
      const ok = checkAgyAgents(root);
      if (!ok) {
        process.exit(1);
      }
      process.exit(0);
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  }
}

try {
  if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
    main();
  }
} catch {
  // Ignore error if process.argv[1] cannot be resolved
}
