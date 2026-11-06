import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { runTool, ensureTool } from "../tools.mjs";

// The prompt states the framing and forbids scripting a PNG (PROC-FRAMING-IN-PROMPT, HARD-REAL-RASTER).
export function compilePrompt({ prompt, framing, size, refs }) {
  return [
    `PROMPT: ${prompt.trim()}`,
    `FRAMING: ${framing.trim()}`,
    `SIZE: ${size}`,
    refs.length ? `REFERENCE: the attached images are approved references; keep the same identity, palette and proportions (${refs.join(", ")}).` : "REFERENCE: none.",
    "You MUST call the image_generation tool to produce this image.",
    "Do NOT write a script, draw with code or fabricate a PNG by any other means.",
    "Save the generated image as out.png in the current working directory.",
  ].join("\n");
}

export function compileSheetPrompt({ members, refs = [], size, cols, rows }) {
  const n = members.length;
  const countStr = n === 1 ? "1 pose" : `${n} separate poses`;
  const lines = [
    `PROMPT: Pose sheet of one character: ${countStr} of the same character in one image, laid out as a grid of ${cols} columns and ${rows} rows of equal cells, read left to right, top to bottom.`,
  ];
  for (let i = 0; i < n; i++) {
    lines.push(`CELL ${i + 1}: ${members[i].prompt.trim()} | FRAMING: ${members[i].framing.trim()}`);
  }
  if (n === 3) {
    lines.push("CELL 4: leave this cell empty background.");
  }
  lines.push("LAYOUT: each figure sits fully inside its own cell, centred, with a wide empty margin; no figure crosses or touches a cell edge; no grid lines, borders, labels, numbers or text; one plain flat solid light background across the whole image; no ground, no shadows, no scenery.");
  lines.push(`SIZE: ${size}`);
  lines.push(refs.length ? `REFERENCE: the attached images are approved references; keep the same identity, palette and proportions (${refs.join(", ")}).` : "REFERENCE: none.");
  lines.push("You MUST call the image_generation tool to produce this image.");
  lines.push("Do NOT write a script, draw with code or fabricate a PNG by any other means.");
  lines.push("Save the generated image as out.png in the current working directory.");
  return lines.join("\n");
}

const sessionRoot = (ctx) => join(ctx.env?.CODEX_HOME ?? process.env.CODEX_HOME ?? join(homedir(), ".codex"), "sessions");
const SESSION_ID = /session id:\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

function findRollout(root, id, depth = 0) {
  if (!existsSync(root) || depth > 4) return null;
  for (const e of readdirSync(root, { withFileTypes: true })) {
    if (e.isFile() && e.name.endsWith(`-${id}.jsonl`)) return join(root, e.name);
    if (e.isDirectory()) {
      const hit = findRollout(join(root, e.name), id, depth + 1);
      if (hit) return hit;
    }
  }
  return null;
}

// The tool's revised prompt lives in the session log, not in stdout. Absent log or line means null (the caller adds advice).
export function revisedPrompt(ctx, stdout) {
  const id = stdout.match(SESSION_ID)?.[1];
  const file = id ? findRollout(sessionRoot(ctx), id) : null;
  if (!file) return null;
  let found = null;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.includes("image_gen.generation")) continue;
    try {
      const item = JSON.parse(line)?.payload?.item;
      if (item?.kind === "image_gen.generation" && typeof item.revisedPrompt === "string") found = item.revisedPrompt;
    } catch { /* not a JSON line */ }
  }
  return found;
}

export async function generate(ctx, { workDir, text, refPaths }) {
  const args = ["exec", "--skip-git-repo-check", "-s", "workspace-write", "-C", workDir, ...refPaths.map((p) => `--image=${p}`), text];
  const r = ensureTool(await runTool(ctx, "codex", args, { cwd: workDir, timeoutMs: 600000 }), "codex", "HARD-REAL-RASTER");
  return { ok: r.status === 0 && !r.timedOut, stdout: r.stdout, stderr: r.stderr.slice(-400) };
}
