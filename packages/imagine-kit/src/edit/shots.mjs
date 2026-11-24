import { existsSync } from "node:fs";
import { join } from "node:path";
import { err } from "../envelope.mjs";
import { KitError, UsageError } from "../errors.mjs";
import { currentAsset, currentAssets } from "../docs.mjs";
import { createContext } from "../sources.mjs";
import { dependencyState, shotReadiness } from "../readiness.mjs";
import { readText } from "../fsx.mjs";
import { parseValue } from "../story/keys.mjs";
import { safePath } from "../img/commit.mjs";

export function shotOrThrow(sctx, id) {
  if (!/^s\d{2}$/.test(id)) throw new UsageError(`"${id}" is not a shot id (expected sNN)`);
  const shot = sctx.story.shots.find((s) => s.id === id);
  if (!shot) throw new UsageError(`STORY.md has no shot ${id}`);
  return shot;
}

export const parsedKeys = (shot) => Object.fromEntries(Object.entries(shot.keys).map(([k, raw]) => [k, parseValue(k, raw).value]));

const AUDIO_KINDS = ["vo", "music", "sfx"];
// Item ids of the assets a shot declares (`assets:`), each at its current version. Declarations with no current version are left
// to shotAssets / checkAssets, which report them by asset id.
export function shotAssetItemIds(sctx, shot) {
  const ids = [];
  for (const d of parsedKeys(shot).assets ?? []) {
    const cur = currentAsset(sctx.manifest, d.id);
    if (cur) ids.push(`asset:${cur.id}.v${cur.v}`);
  }
  return ids;
}
// Options for shotReadiness taken from the project: G0 silence and the number of audio assets (Requirement 8.9).
export const readinessOpts = (sctx) => ({
  silence: sctx.project.g0?.silence ?? null,
  audioAssetCount: currentAssets(sctx.manifest).filter((a) => AUDIO_KINDS.includes(a.kind)).length,
  records: sctx.project.items,
});
// Errors for the dependencies of one shot that are not satisfied (Requirements 8.6, 8.7). Each names the shot, the dependency and its state;
// a stale dependency is named as stale. Empty when shotReadiness is "ready".
export function dependencyErrors(derived, sctx, shot, dependencyIds) {
  const opts = readinessOpts(sctx);
  if (shotReadiness(derived, shot, dependencyIds, opts) === "ready") return [];
  const errors = [];
  for (const dep of dependencyIds) {
    if (shotReadiness(derived, shot, [dep], opts) === "ready") continue;
    const state = dependencyState(derived, dep, opts.records);
    const text = state === "stale"
      ? `shot ${shot.id} is blocked: ${dep} is stale; its inputs changed after approval`
      : `shot ${shot.id} is blocked: ${dep} is ${state}`;
    errors.push(err("HARD-GATES-RECORDED", "HARD", dep, text));
  }
  return errors;
}
// Preconditions of stage-shot and promote-shot (Requirements 8.2, 8.3, 8.5, 8.6): per-shot readiness of this shot's own dependencies only
// (its previz and, when it has fx, fx items, plus the assets it declares; assets go through shotReadiness), G4 approved, export-hf ran, and the edit project initialised.
// G5a/G5b are not evaluated project-wide, so other shots' unfinished work does not block this shot.
export function editPreconditions(dir, derived, shot, sctx = null) {
  const errors = [];
  if (derived.gates.G4.state !== "approved") errors.push(err("HARD-GATES-RECORDED", "HARD", "G4", `gate G4 must be approved (state: ${derived.gates.G4.state})`));
  const context = sctx ?? createContext(dir);
  const stages = ["previz", ...(shot.keys.fx ? ["fx"] : [])];
  // The shot's own previz/fx stage items are working drafts, so a proposed one is accepted; missing, stale or rejected ones block.
  for (const st of stages) {
    const id = `shot:${shot.id}.${st}`;
    const item = derived.items.find((i) => i.id === id);
    if (!item) errors.push(err("HARD-GATES-RECORDED", "HARD", id, `shot ${shot.id} has no ${st} item (${id} state: missing); run the ${st} stage first`));
    else if (!["approved", "proposed"].includes(item.status)) errors.push(err("HARD-GATES-RECORDED", "HARD", id, `shot ${shot.id} is blocked: ${id} is ${item.status}; redo the ${st} stage for ${shot.id}`));
  }
  errors.push(...dependencyErrors(derived, context, shot, shotAssetItemIds(context, shot)));
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
