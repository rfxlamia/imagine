import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join, sep } from "node:path";
import { sha256File } from "../hash.mjs";
import { runTool, ensureTool } from "../tools.mjs";

const TRANSPARENT_RULE = "TRANSPARENCY: this image is a cutout. Call the image_generation tool with transparent_background set to true so the background is real alpha transparency. Draw every figure complete with crisp silhouette edges: no limb, hand or foot may fade, dissolve or be cut off.";
const IDENTITY_REFS = (refs) => `REFERENCE: the attached images are identity references only (${refs.join(", ")}); do not edit them, generate a new image and keep the same identity, palette and proportions.`;

export function compilePrompt({ prompt, framing, size, refs, background }) {
  const t = background === "transparent";
  return [
    `PROMPT: ${prompt.trim()}`,
    `FRAMING: ${framing.trim()}`,
    `SIZE: ${size}`,
    refs.length ? (t ? IDENTITY_REFS(refs) : `REFERENCE: the attached images are approved references; keep the same identity, palette and proportions (${refs.join(", ")}).`) : "REFERENCE: none.",
    ...(t ? [TRANSPARENT_RULE, "No shadow, ground, label or checkerboard pattern anywhere."] : []),
    "You MUST call the image_generation tool to produce this image.",
    "Do NOT write a script, draw with code or fabricate a PNG by any other means.",
    "Save the generated image as out.png in the current working directory.",
  ].join("\n");
}

export function compileSheetPrompt({ members, refs = [], size, cols, rows, background }) {
  const t = background === "transparent";
  const n = members.length;
  const countStr = n === 1 ? "1 pose" : `${n} separate poses`;
  const lines = [
    `PROMPT: Pose sheet of one character: ${countStr} of the same character in one image, laid out as a grid of ${cols} columns and ${rows} rows of equal cells, read left to right, top to bottom.`,
  ];
  for (let i = 0; i < n; i++) {
    lines.push(`CELL ${i + 1}: ${members[i].prompt.trim()} | FRAMING: ${members[i].framing.trim()}`);
  }
  if (n === 3) {
    lines.push(t ? "CELL 4: leave this cell empty and fully transparent." : "CELL 4: leave this cell empty background.");
  }
  lines.push(t
    ? "LAYOUT: each figure sits fully inside its own cell, centred, with a wide empty margin; no figure crosses or touches a cell edge; no grid lines, borders, labels, numbers or text; no ground, no shadows, no scenery, no checkerboard pattern."
    : "LAYOUT: each figure sits fully inside its own cell, centred, with a wide empty margin; no figure crosses or touches a cell edge; no grid lines, borders, labels, numbers or text; one plain flat solid light background across the whole image; no ground, no shadows, no scenery.");
  if (t) lines.push(TRANSPARENT_RULE);
  lines.push(`SIZE: ${size}`);
  lines.push(refs.length ? (t ? IDENTITY_REFS(refs) : `REFERENCE: the attached images are approved references; keep the same identity, palette and proportions (${refs.join(", ")}).`) : "REFERENCE: none.");
  lines.push("You MUST call the image_generation tool to produce this image.");
  lines.push("Do NOT write a script, draw with code or fabricate a PNG by any other means.");
  lines.push("Save the generated image as out.png in the current working directory.");
  return lines.join("\n");
}

const codexHome = (ctx) => ctx.env?.CODEX_HOME ?? process.env.CODEX_HOME ?? join(homedir(), ".codex");
const sessionRoot = (ctx) => join(codexHome(ctx), "sessions");
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

const NONE = { revisedPrompt: null, transparentBackground: null };

// Binds a session-log item to the image being processed: the item's saved file must live under
// <CODEX_HOME>/generated_images/ (realpath) and hash equal to outPath. No match means nulls, never "the last item".
export function generationInfo(ctx, stdout, outPath) {
  if (!outPath) return NONE;
  const id = stdout.match(SESSION_ID)?.[1];
  const file = id ? findRollout(sessionRoot(ctx), id) : null;
  if (!file) return NONE;
  let root;
  try { root = realpathSync(join(codexHome(ctx), "generated_images")); } catch { return NONE; }
  let want;
  try { want = sha256File(outPath); } catch { return NONE; }
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.includes("image_gen.generation")) continue;
    let item;
    try { item = JSON.parse(line)?.payload?.item; } catch { continue; }
    if (item?.kind !== "image_gen.generation" || typeof item.savedPath !== "string") continue;
    let real;
    try { real = realpathSync(item.savedPath); } catch { continue; }
    if (!real.startsWith(root + sep)) continue;
    let got;
    try { got = sha256File(real); } catch { continue; }
    if (got !== want) continue;
    return {
      revisedPrompt: typeof item.revisedPrompt === "string" ? item.revisedPrompt : null,
      transparentBackground: typeof item.transparentBackground === "boolean" ? item.transparentBackground : null,
    };
  }
  return NONE;
}

export function lastRevisedPrompt(ctx, stdout) {
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

export const revisedPrompt = (ctx, stdout, outPath) => generationInfo(ctx, stdout, outPath).revisedPrompt;
export const generationFlags = (ctx, stdout, outPath) => ({ transparentBackground: generationInfo(ctx, stdout, outPath).transparentBackground });

export async function codexVersion(ctx) {
  const r = await runTool(ctx, "codex", ["--version"], { timeoutMs: 30000 });
  return r.status === 0 ? r.stdout.trim().split("\n")[0] || null : null;
}

export async function generate(ctx, { workDir, text, refPaths }) {
  const args = ["exec", "--skip-git-repo-check", "-s", "workspace-write", "-C", workDir, ...refPaths.map((p) => `--image=${p}`), text];
  const r = ensureTool(await runTool(ctx, "codex", args, { cwd: workDir, timeoutMs: 600000 }), "codex", "HARD-REAL-RASTER");
  return { ok: r.status === 0 && !r.timedOut, stdout: r.stdout, stderr: r.stderr.slice(-400) };
}
