import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { err } from "../envelope.mjs";
import { currentAsset, currentAssets } from "../docs.mjs";
import { sha256File } from "../hash.mjs";
import { safePath } from "../img/commit.mjs";
import { parseValue } from "../story/keys.mjs";
import { rasterQ, round2, tierOf } from "../raster.mjs";

// Kinds that the edit project uses; refs only steer image generation.
export const EXPORT_KINDS = ["img", "vo", "music", "sfx"];
export const exportName = (a) => `${a.id}.v${a.v}${a.path.slice(a.path.lastIndexOf("."))}`;
const blank = (s) => typeof s !== "string" || s.trim() === "";

// HARD-ASSETS-APPROVED, HARD-AUDIO-LICENCE, HARD-RASTER-TIER, HARD-VO-PRESENT. `edit/assets/` copies are compared too when `checkCopies` is set
// (render --final), so a file swapped after export is caught by its hash.
export function checkAssets(dir, sctx, derived, { checkCopies = false } = {}) {
  const errors = [];
  const status = new Map(derived.items.map((i) => [i.id, i.status]));
  const used = currentAssets(sctx.manifest).filter((a) => EXPORT_KINDS.includes(a.kind));

  // Check every STORY.md shot-declared asset for a current matching-kind, usable, approved version.
  for (const shot of sctx.story?.shots ?? []) {
    const rawAssets = shot.keys?.assets;
    if (!rawAssets) continue;
    const parsed = parseValue("assets", rawAssets);
    const declared = Array.isArray(parsed?.value) ? parsed.value : [];
    for (const d of declared) {
      const cur = currentAsset(sctx.manifest, d.id);
      const latest = sctx.manifest?.assets?.filter((a) => a.id === d.id).reduce((b, a) => (b === null || a.v > b.v ? a : b), null);
      if (!cur || !latest || latest.status === "rejected" || cur.status !== "approved" || status.get(`asset:${cur.id}.v${cur.v}`) !== "approved") {
        errors.push(err("HARD-ASSETS-APPROVED", "HARD", d.id, `shot ${shot.id} declares asset ${d.id} but it has no approved version`));
        continue;
      }
      if (cur.kind !== d.kind) {
        errors.push(err("HARD-ASSETS-APPROVED", "HARD", d.id, `shot ${shot.id} declares asset ${d.id} as ${d.kind} but current version is ${cur.kind}`));
        continue;
      }
      const item = `${cur.id}.v${cur.v}`;
      const curFile = safePath(dir, cur.path);
      if (!curFile) {
        if (!errors.some((e) => e.item === item)) errors.push(err("HARD-ASSETS-APPROVED", "HARD", item, `${cur.path} is outside the project`));
        continue;
      }
      if (!existsSync(curFile)) {
        if (!errors.some((e) => e.item === item)) errors.push(err("HARD-ASSETS-APPROVED", "HARD", item, `${cur.path} does not exist`));
        continue;
      }
      if (sha256File(curFile) !== cur.sha256) {
        if (!errors.some((e) => e.item === item)) errors.push(err("HARD-ASSETS-APPROVED", "HARD", item, `${cur.path} no longer matches its recorded hash`));
        continue;
      }
    }
  }

  for (const a of used) {
    const item = `${a.id}.v${a.v}`;
    const file = safePath(dir, a.path);
    if (!file) { errors.push(err("HARD-ASSETS-APPROVED", "HARD", item, `${a.path} is outside the project`)); continue; }
    if (a.status !== "approved" || status.get(`asset:${item}`) !== "approved") errors.push(err("HARD-ASSETS-APPROVED", "HARD", item, `${item} is not approved at its gate (${status.get(`asset:${item}`) ?? a.status})`));
    if (!existsSync(file)) errors.push(err("HARD-ASSETS-APPROVED", "HARD", item, `${a.path} does not exist`));
    else if (sha256File(file) !== a.sha256) errors.push(err("HARD-ASSETS-APPROVED", "HARD", item, `${a.path} no longer matches its recorded hash`));
    if (checkCopies) {
      const copy = safePath(dir, `edit/assets/${exportName(a)}`);
      if (!copy) errors.push(err("HARD-ASSETS-APPROVED", "HARD", item, `edit/assets/${exportName(a)} resolves outside the project`));
      else if (!existsSync(copy)) errors.push(err("HARD-ASSETS-APPROVED", "HARD", item, `edit/assets/${exportName(a)} is missing; run export-hf`));
      else if (sha256File(copy) !== a.sha256) errors.push(err("HARD-ASSETS-APPROVED", "HARD", item, `edit/assets/${exportName(a)} differs from the approved file; run export-hf`));
    }
    if (["music", "sfx"].includes(a.kind) && [a.license, a.source, a.credit].some(blank)) errors.push(err("HARD-AUDIO-LICENCE", "HARD", item, `${item} needs non-empty license, source and credit`));
    if (a.kind === "img") {
      const validDims = Number.isFinite(a.w) && a.w > 0 && Number.isFinite(a.h) && a.h > 0;
      if (!validDims) {
        errors.push(err("HARD-RASTER-TIER", "HARD", item, `${item} has missing or non-positive dimensions`));
      }
      const req = a.required_px;
      const validReq = req && typeof req === "object" && Number.isFinite(req.w) && req.w > 0 && Number.isFinite(req.h) && req.h > 0;
      if (!validReq) {
        errors.push(err("HARD-RASTER-TIER", "HARD", item, `${item} has missing or non-positive required_px (raster budget)`));
      }
      let q = null;
      let tier = null;
      if (validDims && validReq) {
        const rawQ = rasterQ(a.w, a.h, req);
        if (Number.isFinite(rawQ) && rawQ > 0) {
          q = round2(rawQ);
          tier = tierOf(rawQ);
        } else {
          errors.push(err("HARD-RASTER-TIER", "HARD", item, `${item} has non-finite q`));
        }
      }
      const accepted = a.status === "approved" && status.get(`asset:${item}`) === "approved";
      if (tier === "replan" || a.tier === "replan") {
        errors.push(err("HARD-RASTER-TIER", "HARD", item, `${item} has q ${round2(q ?? a.q)} (replan tier); regenerate it larger or re-plan the shot`));
      } else if (tier === "soft" && !accepted) {
        errors.push(err("HARD-RASTER-TIER", "HARD", item, `${item} has q ${round2(q)} (soft tier) and is not accepted at G5b`));
      }
    }
  }
  if (sctx.project.g0.audio_mode === "narrated") {
    for (const id of Object.keys(sctx.units.units).sort()) {
      const vo = currentAsset(sctx.manifest, id);
      if (!vo || vo.kind !== "vo") errors.push(err("HARD-VO-PRESENT", "HARD", id, `no voice-over take exists for ${id}; run tts ${id}`));
    }
  }
  const safeUsed = used.map((a) => {
    if (a.kind !== "img") return a;
    const req = a.required_px;
    const validDims = Number.isFinite(a.w) && a.w > 0 && Number.isFinite(a.h) && a.h > 0;
    const validReq = req && typeof req === "object" && Number.isFinite(req.w) && req.w > 0 && Number.isFinite(req.h) && req.h > 0;
    if (validDims && validReq) {
      const rawQ = rasterQ(a.w, a.h, req);
      if (Number.isFinite(rawQ) && rawQ > 0) {
        return { ...a, q: round2(rawQ), tier: tierOf(rawQ) };
      }
    }
    return { ...a, q: undefined, tier: undefined };
  });
  return { errors, used: safeUsed };
}
