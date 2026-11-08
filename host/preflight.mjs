#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const TOOLS = [
  { name: "node", args: ["--version"] },
  { name: "npx", args: ["--version"] },
  { name: "uv", args: ["--version"] },
  { name: "ffmpeg", args: ["-version"] },
  { name: "ffprobe", args: ["-version"] },
  { name: "codex", args: ["--version"] },
];

export function probeTool(tool, { spawn = spawnSync, nodeVersion = process.version } = {}) {
  const toolObj = typeof tool === "string" ? TOOLS.find((t) => t.name === tool) ?? { name: tool, args: ["--version"] } : tool;

  if (toolObj.name === "node") {
    const ver = nodeVersion ?? process.version;
    const major = parseInt(String(ver).replace(/^v/, ""), 10);
    const ok_version = !isNaN(major) && major >= 22;
    return {
      name: "node",
      found: true,
      version: ver,
      ok_version,
    };
  }

  let res;
  try {
    res = spawn(toolObj.name, toolObj.args ?? ["--version"], {
      shell: false,
      encoding: "utf8",
      timeout: 10000,
    });
  } catch {
    return { name: toolObj.name, found: false, version: null };
  }

  if (!res || res.error) {
    return { name: toolObj.name, found: false, version: null };
  }

  const lines = (typeof res.stdout === "string" ? res.stdout : "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const version = lines.length > 0 ? lines[0] : null;
  const found = res.status === 0;

  return {
    name: toolObj.name,
    found,
    version: found ? version : null,
  };
}

export function preflight({ require = [], spawn = spawnSync, nodeVersion = process.version } = {}) {
  const reqList = Array.isArray(require) ? require : [require];
  const knownNames = new Set(TOOLS.map((t) => t.name));
  for (const name of reqList) {
    if (!knownNames.has(name)) {
      throw new Error(`unknown required tool: ${name}`);
    }
  }
  const reqSet = new Set(reqList);

  const tools = [];
  let ok = true;

  for (const tool of TOOLS) {
    const probed = probeTool(tool, { spawn, nodeVersion });
    const isRequired = reqSet.has(tool.name);
    tools.push({
      name: probed.name,
      found: probed.found,
      version: probed.version,
      required: isRequired,
    });

    if (isRequired && !probed.found) {
      ok = false;
    }
    if (tool.name === "node" && probed.ok_version === false) {
      ok = false;
    }
  }

  return { ok, tools };
}

function main() {
  const args = process.argv.slice(2);
  let reqList = [];

  if (args.length === 0) {
    reqList = [];
  } else if (args.length === 2 && args[0] === "--require") {
    reqList = args[1].split(",").map((s) => s.trim()).filter(Boolean);
  } else if (args.length === 1 && args[0].startsWith("--require=")) {
    reqList = args[0].slice("--require=".length).split(",").map((s) => s.trim()).filter(Boolean);
  } else {
    console.error("Usage: node host/preflight.mjs [--require <a,b,...>]");
    process.exitCode = 2;
    return;
  }

  let result;
  try {
    result = preflight({ require: reqList });
  } catch (err) {
    console.error(err.message);
    process.exitCode = 2;
    return;
  }

  console.log(JSON.stringify(result));
  process.exitCode = result.ok ? 0 : 1;
}

try {
  if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
    main();
  }
} catch {
  // Not main or path does not exist
}
