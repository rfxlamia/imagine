import { existsSync } from "node:fs";
import { join } from "node:path";
import { err } from "../envelope.mjs";
import { KitError, UsageError } from "../errors.mjs";
import { currentAsset } from "../docs.mjs";
import { readText } from "../fsx.mjs";
import { gateSatisfied } from "../gates.mjs";
import { parseValue } from "../story/keys.mjs";
import { safePath } from "../img/commit.mjs";

export function shotOrThrow(sctx, id) {
  if (!/^s\d{2}$/.test(id)) throw new UsageError(`"${id}" is not a shot id (expected sNN)`);
  const shot = sctx.story.shots.find((s) => s.id === id);
  if (!shot) throw new UsageError(`STORY.md has no shot ${id}`);
  return shot;
}

export const parsedKeys = (shot) => Object.fromEntries(Object.entries(shot.keys).map(([k, raw]) => [k, parseValue(k, raw).value]));

// Preconditions of stage-shot and promote-shot (cli-contract "Decisions frozen", WP2): G4 approved, G5a and G5b satisfied,
// export-hf ran, the edit project is initialised, and the shot's previz (and fx, when it has fx) items are present and not stale.
export function editPreconditions(dir, derived, shot) {
  const errors = [];
  if (derived.gates.G4.state !== "approved") errors.push(err("HARD-GATES-RECORDED", "HARD", "G4", `gate G4 must be approved (state: ${derived.gates.G4.state})`));
  for (const g of ["G5a", "G5b"]) if (!gateSatisfied(derived.gates, g)) errors.push(err("HARD-GATES-RECORDED", "HARD", g, `gate ${g} must be satisfied (state: ${derived.gates[g].state})`));
  const stages = ["previz", ...(shot.keys.fx ? ["fx"] : [])];
  for (const st of stages) {
    const item = derived.items.find((i) => i.id === `shot:${shot.id}.${st}`);
    if (!item) errors.push(err("HARD-GATES-RECORDED", "HARD", `shot:${shot.id}.${st}`, `shot ${shot.id} has no ${st} item; run the ${st} stage first`));
    else if (!["approved", "proposed"].includes(item.status)) errors.push(err("HARD-GATES-RECORDED", "HARD", item.id, `${item.id} is ${item.status}; redo the ${st} stage for ${shot.id}`));
  }
  const sbPath = safePath(dir, "edit/STORYBOARD.md");
  if (!sbPath || !existsSync(sbPath)) errors.push(err("HARD-GATES-RECORDED", "HARD", "edit/STORYBOARD.md", "run export-hf first: edit/STORYBOARD.md is missing"));
  if (errors.length) return { errors };
  const hfPath = safePath(dir, "edit/hyperframes.json");
  if (!hfPath || !existsSync(hfPath)) {
    throw new KitError("BLOCKED", "edit/ is not an initialised HyperFrames project (edit/hyperframes.json is missing); run `npx hyperframes@0.8.223 init edit`", { rule: "HARD-ROOT-MOTION" });
  }
  return { errors: [] };
}

// Assets a shot declares (`assets:`), each resolved to its current version. Unapproved or missing ones are errors.
export function shotAssets(sctx, shot, dir = null) {
  const declared = parsedKeys(shot).assets ?? [];
  const found = [];
  const errors = [];
  for (const d of declared) {
    const cur = currentAsset(sctx.manifest, d.id);
    if (!cur || cur.status !== "approved") errors.push(err("HARD-ASSETS-APPROVED", "HARD", d.id, `shot ${shot.id} declares asset ${d.id} but it has no approved version`));
    else if (dir && !safePath(dir, cur.path)) errors.push(err("HARD-ASSETS-APPROVED", "HARD", d.id, `asset ${d.id} path leaves project`));
    else found.push({ decl: d, entry: cur });
  }
  return { found, errors };
}

// Start of a shot in the film: the scene host's data-start in edit/index.html, else the sum of the earlier previz durations.
export function shotOffset(sctx, dir, id) {
  const indexPath = safePath(dir, "edit/index.html");
  const html = indexPath && existsSync(indexPath) ? readText(indexPath) : "";
  for (const tag of html.match(/<[^>]*data-composition-src\s*=\s*["']compositions\/[^"']+["'][^>]*>/g) ?? []) {
    if (!new RegExp(`data-composition-src\\s*=\\s*["']compositions/${id}\\.html["']`).test(tag)) continue;
    const m = tag.match(/data-start\s*=\s*["'](\d+(?:\.\d+)?)["']/);
    if (m) return { seconds: Number(m[1]), from: "edit/index.html" };
  }
  let t = 0;
  for (const s of sctx.story.shots) {
    if (s.id === id) break;
    const v = parsedKeys(s);
    t += v.duration ?? v.duration_est ?? 0;
  }
  return { seconds: Math.round(t * 1000) / 1000, from: "previz durations" };
}
