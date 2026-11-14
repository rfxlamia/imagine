#!/usr/bin/env node
import { lstatSync, mkdirSync, readFileSync, realpathSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateCodexAgents, checkCodexAgents, isManagedAgent } from "../tools/agent-codex.mjs";
import { writeAtomic } from "../packages/imagine-kit/src/fsx.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

export function manageCodexAgents({ mode = "preview", codexHome = process.env.CODEX_HOME ?? join(homedir(), ".codex"), rootDir = ROOT } = {}) {
  try {
    if (!["preview", "install", "check", "remove"].includes(mode)) throw new Error("Unknown mode.");
    if (!isAbsolute(codexHome)) throw new Error("codex-home must be absolute.");
    if (!checkCodexAgents(rootDir)) throw new Error("Packaged codex-agents are missing or stale; regenerate them before setup.");
    const { generatedFiles } = generateCodexAgents(rootDir), dir = join(codexHome, "agents");
    const dirStat = lstatSync(dir, { throwIfNoEntry: false });
    if (dirStat && (!dirStat.isDirectory() || dirStat.isSymbolicLink())) throw new Error("agents must be a regular directory, not a symlink.");
    const plan = [];
    // Preflight every role before mutating anything; unrelated filenames are never inspected or changed.
    for (const [file, expected] of generatedFiles) {
      const path = join(dir, file), stat = lstatSync(path, { throwIfNoEntry: false });
      if (stat && (!stat.isFile() || stat.isSymbolicLink())) throw new Error(`Unsafe agent destination: ${path}`);
      const previous = stat ? readFileSync(path, "utf8") : null;
      if (previous !== null && !isManagedAgent(previous, file.slice(0, -5))) throw new Error(`Unowned or edited agent preserved: ${path}`);
      const action = mode === "remove" ? (stat ? "remove" : "absent") : previous === expected ? "current" : stat ? "update" : "install";
      plan.push({ path, action, expected, previous });
    }
    if (mode === "check") return { ok: plan.every(p => p.action === "current"), mode, agents: plan.map(({ path, action }) => ({ path, action })), restart_required: false };
    if (mode === "install" || mode === "remove") {
      if (mode === "install") mkdirSync(dir, { recursive: true });
      for (const item of plan.filter(p => ["install", "update", "remove"].includes(p.action))) {
        // Recheck immediately before each mutation; an intervening operator edit stops the operation.
        if (!lstatSync(dir).isDirectory() || lstatSync(dir).isSymbolicLink()) throw new Error("Agent directory changed during setup.");
        const current = lstatSync(item.path, { throwIfNoEntry: false });
        if (current?.isSymbolicLink() || (current && !current.isFile()) || (current ? readFileSync(item.path, "utf8") : null) !== item.previous) throw new Error(`Agent changed during setup: ${item.path}`);
        if (item.action === "remove") unlinkSync(item.path);
        else writeAtomic(item.path, item.expected);
      }
    }
    return { ok: true, mode, agents: plan.map(({ path, action }) => ({ path, action })), restart_required: ["install", "remove"].includes(mode) && plan.some(p => ["install", "update", "remove"].includes(p.action)) };
  } catch (error) { return { ok: false, mode, reason: error.message }; }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), modes = { "--dry-run": "preview", "--install": "install", "--check": "check", "--remove": "remove" };
  let mode, codexHome, invalid = false;
  for (let i = 0; i < args.length; i++) {
    if (modes[args[i]] && !mode) mode = modes[args[i]];
    else if (args[i] === "--codex-home" && !codexHome && args[i + 1]) codexHome = args[++i];
    else invalid = true;
  }
  if (invalid) {
    console.log(JSON.stringify({ ok: false, reason: "Usage: node host/codex-agents.mjs [--dry-run|--install|--check|--remove] [--codex-home ABSOLUTE_DIR]" })); process.exitCode = 2;
  } else {
    const result = manageCodexAgents({ mode, ...(codexHome ? { codexHome } : {}) });
    console.log(JSON.stringify(result)); process.exitCode = result.ok ? 0 : 3;
  }
}
