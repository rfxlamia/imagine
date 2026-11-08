#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

export const TOOL_ACTIONS = Object.freeze({
  Read: "read",
  Glob: "search",
  Grep: "search",
  Write: "write",
  Edit: "write",
  MultiEdit: "write",
  NotebookEdit: "write",
  Bash: "run-process",
});

export const MODEL_TIERS = Object.freeze({
  haiku: "small",
  sonnet: "standard",
  opus: "large",
});

export const POLICY = Object.freeze({
  "storyboard-artist": Object.freeze({
    writes: "none",
    requires_enforced_isolation: false,
    inline_fallback: "allowed-patch-only",
    output: "patch",
  }),
  "previz-designer": Object.freeze({
    writes: "none",
    requires_enforced_isolation: false,
    inline_fallback: "allowed-patch-only",
    output: "patch",
  }),
  "fx-designer": Object.freeze({
    writes: "none",
    requires_enforced_isolation: false,
    inline_fallback: "allowed-patch-only",
    output: "patch",
  }),
  "continuity-reviewer": Object.freeze({
    writes: "none",
    requires_enforced_isolation: false,
    inline_fallback: "blocked",
    output: "findings",
  }),
  "scene-builder": Object.freeze({
    writes: "shadow-only",
    requires_enforced_isolation: true,
    inline_fallback: "blocked",
    output: "proposal",
  }),
});

function parseFrontmatter(text, filePath) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    throw new Error(`Frontmatter is missing or unparsable in ${filePath}`);
  }
  let parsed;
  try {
    parsed = YAML.parse(match[1]);
  } catch (err) {
    throw new Error(`Frontmatter is missing or unparsable in ${filePath}: ${err.message}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Frontmatter is missing or unparsable in ${filePath}`);
  }
  return parsed;
}

export function buildManifest(repoRoot) {
  const rootCandidate = repoRoot ?? (process.env.IMAGINE_REPO_ROOT || join(fileURLToPath(import.meta.url), "../.."));
  let root;
  try {
    root = realpathSync(rootCandidate);
  } catch {
    root = rootCandidate;
  }

  const agentsDir = join(root, "agents");
  if (!existsSync(agentsDir)) {
    throw new Error(`Agents directory not found: ${agentsDir}`);
  }

  const entries = readdirSync(agentsDir, { withFileTypes: true });
  const mdFiles = entries
    .filter((e) => e.isFile() && e.name.endsWith(".md"))
    .map((e) => e.name)
    .filter((name) => name !== "placeholder.md" && name !== "placeholder");

  const agents = [];

  for (const fileName of mdFiles) {
    const filePath = join(agentsDir, fileName);
    const fileBytes = readFileSync(filePath);
    const fileText = fileBytes.toString("utf8");
    const baseName = basename(fileName, ".md");

    const fm = parseFrontmatter(fileText, filePath);

    if (!fm.name || fm.name !== baseName) {
      throw new Error(`Agent name is missing or differs from file basename in ${filePath}`);
    }

    let tools = [];
    if (typeof fm.tools === "string") {
      tools = fm.tools.split(",").map((t) => t.trim()).filter(Boolean);
    } else if (Array.isArray(fm.tools)) {
      tools = fm.tools.map((t) => String(t).trim()).filter(Boolean);
    } else {
      throw new Error(`Tools must be declared in ${filePath}`);
    }

    for (const tool of tools) {
      if (!Object.prototype.hasOwnProperty.call(TOOL_ACTIONS, tool)) {
        throw new Error(`Tool "${tool}" in ${filePath} is not in TOOL_ACTIONS`);
      }
    }

    const actions = [];
    const seenActions = new Set();
    for (const tool of tools) {
      const action = TOOL_ACTIONS[tool];
      if (!seenActions.has(action)) {
        seenActions.add(action);
        actions.push(action);
      }
    }

    if (!fm.model || !Object.prototype.hasOwnProperty.call(MODEL_TIERS, fm.model)) {
      throw new Error(`Model "${fm.model}" in ${filePath} is empty or not in MODEL_TIERS`);
    }

    const policy = POLICY[fm.name];
    if (!policy) {
      throw new Error(`Agent "${fm.name}" in ${filePath} has no POLICY entry`);
    }

    if ((actions.includes("write") || actions.includes("run-process")) && policy.writes === "none") {
      throw new Error(`Agent "${fm.name}" in ${filePath} has action write or run-process but policy writes is "none"`);
    }

    if (policy.writes === "shadow-only" && !policy.requires_enforced_isolation) {
      throw new Error(`Agent "${fm.name}" in ${filePath} has writes "shadow-only" but requires_enforced_isolation is not true`);
    }

    const sha256 = createHash("sha256").update(fileBytes).digest("hex");

    agents.push({
      name: fm.name,
      source: `agents/${fileName}`,
      source_sha256: sha256,
      description: fm.description ?? "",
      claude: {
        tools,
        model: fm.model,
      },
      portable: {
        actions,
        model_tier: MODEL_TIERS[fm.model],
        writes: policy.writes,
        output: policy.output,
        requires_enforced_isolation: policy.requires_enforced_isolation,
        inline_fallback: policy.inline_fallback,
      },
    });
  }

  agents.sort((a, b) => a.name.localeCompare(b.name));

  return {
    manifest_version: 1,
    generated_by: "tools/agent-manifest.mjs",
    source_dir: "agents",
    agents,
  };
}

export function serialize(manifest) {
  return JSON.stringify(manifest, null, 2) + "\n";
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.length !== 1 || (argv[0] !== "--write" && argv[0] !== "--check")) {
    console.error("Usage: node tools/agent-manifest.mjs <--write|--check>");
    process.exit(2);
  }

  const rootCandidate = process.env.IMAGINE_REPO_ROOT || join(fileURLToPath(import.meta.url), "../..");
  let root;
  try {
    root = realpathSync(rootCandidate);
  } catch {
    root = rootCandidate;
  }
  const manifestPath = join(root, "docs", "contracts", "agents.manifest.json");

  if (argv[0] === "--write") {
    try {
      const manifest = buildManifest(root);
      writeFileSync(manifestPath, serialize(manifest), "utf8");
      process.exit(0);
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  }

  if (argv[0] === "--check") {
    let existing;
    try {
      existing = readFileSync(manifestPath, "utf8");
    } catch {
      console.error("agents.manifest.json is stale; run node tools/agent-manifest.mjs --write");
      process.exit(1);
    }

    let current;
    try {
      current = serialize(buildManifest(root));
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }

    if (existing !== current) {
      console.error("agents.manifest.json is stale; run node tools/agent-manifest.mjs --write");
      process.exit(1);
    }

    process.exit(0);
  }
}

try {
  if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
    main();
  }
} catch {
  // Ignore error if process.argv[1] cannot be resolved with realpathSync
}
