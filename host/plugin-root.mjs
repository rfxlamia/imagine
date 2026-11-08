#!/usr/bin/env node
import { readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const RESOLUTION_PROTOCOL = "imagine-root/1";

export function isPluginRoot(dir) {
  if (typeof dir !== "string" || !isAbsolute(dir)) {
    return false;
  }
  let realDir;
  try {
    realDir = realpathSync(dir);
  } catch {
    return false;
  }

  try {
    const pkgPath = join(realDir, "packages", "imagine-kit", "package.json");
    if (!statSync(pkgPath).isFile()) return false;
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    if (!pkg || pkg.name !== "imagine-kit") return false;

    const binPath = join(realDir, "packages", "imagine-kit", "bin", "imagine-kit.mjs");
    if (!statSync(binPath).isFile()) return false;

    const skillPath = join(realDir, "skills", "imagine", "SKILL.md");
    if (!statSync(skillPath).isFile()) return false;

    return true;
  } catch {
    return false;
  }
}

export function resolvePluginRoot({ skillDir, env = process.env } = {}) {
  let candidate = null;

  if (typeof env?.IMAGINE_PLUGIN_ROOT === "string" && env.IMAGINE_PLUGIN_ROOT.length > 0) {
    candidate = { source: "IMAGINE_PLUGIN_ROOT", path: env.IMAGINE_PLUGIN_ROOT };
  } else if (typeof env?.CLAUDE_PLUGIN_ROOT === "string" && env.CLAUDE_PLUGIN_ROOT.length > 0) {
    candidate = { source: "CLAUDE_PLUGIN_ROOT", path: env.CLAUDE_PLUGIN_ROOT };
  } else if (typeof skillDir === "string" && skillDir.length > 0) {
    const candidatePath = isAbsolute(skillDir)
      ? resolve(skillDir, "..", "..")
      : skillDir;
    candidate = { source: "skill-dir", path: candidatePath };
  }

  if (!candidate) {
    return {
      ok: false,
      protocol: RESOLUTION_PROTOCOL,
      reason: "no plugin root candidate",
      tried: [],
    };
  }

  if (isPluginRoot(candidate.path)) {
    const root = realpathSync(candidate.path);
    return {
      ok: true,
      protocol: RESOLUTION_PROTOCOL,
      root,
      kit: join(root, "packages", "imagine-kit", "bin", "imagine-kit.mjs"),
      source: candidate.source,
    };
  }

  return {
    ok: false,
    protocol: RESOLUTION_PROTOCOL,
    reason: `candidate from ${candidate.source} is not a valid plugin root: ${candidate.path}`,
    tried: [{ source: candidate.source, path: candidate.path }],
  };
}

function main() {
  const args = process.argv.slice(2);
  let skillDir;

  if (args.length === 0) {
    skillDir = undefined;
  } else if (args.length === 2 && args[0] === "--skill-dir") {
    skillDir = args[1];
  } else if (args.length === 1 && args[0].startsWith("--skill-dir=")) {
    skillDir = args[0].slice("--skill-dir=".length);
  } else {
    console.error("Usage: node host/plugin-root.mjs [--skill-dir <DIR>]");
    process.exitCode = 2;
    return;
  }

  const result = resolvePluginRoot({ skillDir });
  console.log(JSON.stringify(result));
  process.exitCode = result.ok ? 0 : 1;
}

try {
  if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
    main();
  }
} catch {
  // Not executed directly as script
}
