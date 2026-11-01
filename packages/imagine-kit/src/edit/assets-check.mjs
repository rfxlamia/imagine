import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { err } from "../envelope.mjs";
import { currentAsset, currentAssets } from "../docs.mjs";
import { sha256File } from "../hash.mjs";
import { safePath } from "../img/commit.mjs";

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
    if (a.kind === "img" && a.tier === "replan") errors.push(err("HARD-RASTER-TIER", "HARD", item, `${item} has q ${a.q} (replan tier); regenerate it larger or re-plan the shot`));
  }
  if (sctx.project.g0.audio_mode === "narrated") {
    for (const id of Object.keys(sctx.units.units).sort()) {
      const vo = currentAsset(sctx.manifest, id);
      if (!vo || vo.kind !== "vo") errors.push(err("HARD-VO-PRESENT", "HARD", id, `no voice-over take exists for ${id}; run tts ${id}`));
    }
  }
  return { errors, used };
}
