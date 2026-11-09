import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { err } from "../envelope.mjs";
import { KitError, UsageError } from "../errors.mjs";
import { deriveAll } from "../derive.mjs";
import { currentAssets } from "../docs.mjs";
import { writeAtomic } from "../fsx.mjs";
import { appendJournal } from "../journal.mjs";
import { measureLoudness, pngInfo, probeMedia } from "../media.mjs";
import { resolveProject } from "../project.mjs";
import { rasterQ, round2, tierOf } from "../raster.mjs";
import { createContext } from "../sources.mjs";
import { safePath } from "../img/commit.mjs";

const FPS_TOLERANCE = 0.01;
const DURATION_TOLERANCE = 0.05;
const TARGET_LUFS = -16;
const LUFS_TOLERANCE = 1.5;
const gainTo = (lufs) => { const d = Math.round((TARGET_LUFS - lufs) * 10) / 10; return `${d > 0 ? "+" : ""}${d}`; };
const MAX_TRUE_PEAK = -1;

// HARD-FPS-SIZE, HARD-DURATION, HARD-AUDIO-STREAM, HARD-LOUDNESS against G0.
function specChecks(g0, probe, loud, errors) {
  if (probe.w !== g0.width || probe.h !== g0.height) errors.push(err("HARD-FPS-SIZE", "HARD", null, `video is ${probe.w}x${probe.h} but G0 says ${g0.width}x${g0.height}`));
  if (probe.fps === null || !Number.isFinite(probe.fps) || Math.abs(probe.fps - g0.fps) > FPS_TOLERANCE) errors.push(err("HARD-FPS-SIZE", "HARD", null, `video is ${probe.fps} fps but G0 says ${g0.fps}`));
  const { min, max } = g0.duration_s;
  if (probe.duration_s === null || !Number.isFinite(probe.duration_s) || probe.duration_s < min - DURATION_TOLERANCE || probe.duration_s > max + DURATION_TOLERANCE) {
    errors.push(err("HARD-DURATION", "HARD", null, `duration ${probe.duration_s}s is outside the G0 range ${min}-${max}s`));
  }
  if (!probe.audio) errors.push(err("HARD-AUDIO-STREAM", "HARD", null, "the file has no audio stream (use digital silence when silence is intended)"));
  if (loud) {
    if (loud.lufs === null || Math.abs(loud.lufs - TARGET_LUFS) > LUFS_TOLERANCE) errors.push(err("HARD-LOUDNESS", "HARD", null, loud.lufs === null
      ? `integrated loudness could not be measured; expected ${TARGET_LUFS} +/- ${LUFS_TOLERANCE} LUFS`
      : `integrated loudness ${loud.lufs} LUFS is outside ${TARGET_LUFS} +/- ${LUFS_TOLERANCE}; change the mix gain by ${gainTo(loud.lufs)} dB (voice-over and music levels at composition time), render again and re-run qc`));
    if (loud.true_peak !== null && loud.true_peak > MAX_TRUE_PEAK) errors.push(err("HARD-LOUDNESS", "HARD", null, `true peak ${loud.true_peak} dBTP is above ${MAX_TRUE_PEAK}`));
  }
}

// HARD-RASTER-TIER and HARD-NO-NATIVE-CLAIM: q is recomputed from the recorded size and required_px, never read back from the entry.
function rasterReport(dir, sctx, derived, errors, advice, not_run, purged) {
  const status = new Map(derived.items.map((i) => [i.id, i.status]));
  const rows = [];
  for (const a of currentAssets(sctx.manifest).filter((x) => x.kind === "img")) {
    const item = `${a.id}.v${a.v}`;
    const file = safePath(dir, a.path);
    if (!file) {
      errors.push(err("HARD-ASSETS-APPROVED", "HARD", item, `${a.path} is outside the project`));
    } else if (!existsSync(file)) {
      const ext = a.path.slice(a.path.lastIndexOf(".")).toLowerCase();
      if (purged && [".png", ".mp4", ".jpg", ".jpeg"].includes(ext) && !a.path.startsWith("post/")) {
        not_run.push({ rule: "HARD-PURGED", item: a.path, cause: "media purged" });
      } else {
        errors.push(err("HARD-ASSETS-APPROVED", "HARD", item, `${a.path} does not exist`));
      }
    }
    let real = null;
    if (file && existsSync(file)) {
      try {
        real = pngInfo(readFileSync(file));
      } catch {
        real = null;
      }
      if (!real) {
        errors.push(err("HARD-REAL-RASTER", "HARD", item, `${a.path} cannot be parsed as PNG`));
      } else if (real.w !== a.w || real.h !== a.h) {
        errors.push(err("HARD-REAL-RASTER", "HARD", item, `${a.path} is ${real.w}x${real.h} but the manifest records ${a.w}x${a.h}`));
      }
    }
    const verified = real !== null;
    const purgedFile = purged && !verified && file && !existsSync(file) && !a.path.startsWith("post/") && [".png", ".mp4", ".jpg", ".jpeg"].includes(a.path.slice(a.path.lastIndexOf(".")).toLowerCase());
    const w = verified ? real.w : (purgedFile ? a.w : null);
    const h = verified ? real.h : (purgedFile ? a.h : null);

    const hasReq = a.required_px && typeof a.required_px === "object" &&
      Number.isFinite(a.required_px.w) && a.required_px.w > 0 &&
      Number.isFinite(a.required_px.h) && a.required_px.h > 0;
    if (!hasReq) {
      errors.push(err("HARD-RASTER-TIER", "HARD", item, `${item} has missing or non-positive required_px (raster budget)`));
    }

    let q = null;
    let tier = null;
    if (hasReq && (verified || purgedFile) && w && h) {
      const rawQ = rasterQ(w, h, a.required_px);
      if (Number.isFinite(rawQ) && rawQ > 0) {
        q = rawQ;
        tier = tierOf(q);
      } else {
        errors.push(err("HARD-RASTER-TIER", "HARD", item, `${item} has non-finite q`));
      }
    }

    const accepted = a.status === "approved" && status.get(`asset:${item}`) === "approved";
    rows.push({ id: a.id, v: a.v, w, h, required_px: a.required_px ?? null, q: q === null ? null : round2(q), tier, accepted });
    if (tier === "replan") errors.push(err("HARD-RASTER-TIER", "HARD", item, `${item} has q ${round2(q)} (replan tier, below 0.75)`));
    else if (tier === "soft" && !accepted) errors.push(err("HARD-RASTER-TIER", "HARD", item, `${item} has q ${round2(q)} (soft tier) and is not accepted at G5b`));
  }
  const byId = new Map(rows.map((r) => [r.id, r]));
  const shots = sctx.story.shots.map((s) => {
    const ids = (s.keys.assets ?? "").replace(/^\[|\]$/g, "").split(",").map((x) => x.trim().split(":")[0]).filter((id) => byId.get(id)?.q != null);
    const worst = ids.map((id) => byId.get(id)).reduce((b, r) => (b === null || r.q < b.q ? r : b), null);
    return { id: s.id, worst_q: worst?.q ?? null, tier: worst?.tier ?? null, asset: worst ? `${worst.id}.v${worst.v}` : null };
  });
  const below = rows.filter((r) => r.tier === "soft" || r.tier === "replan").map((r) => `${r.id}.v${r.v}`);
  const unmeasured = rows.filter((r) => r.q === null || r.tier === null).map((r) => `${r.id}.v${r.v}`);
  const native = below.length === 0 && unmeasured.length === 0;
  if (!native) advice.push({ rule: "HARD-NO-NATIVE-CLAIM", item: null, source: "assets/manifest.yaml", message: `${below.length + unmeasured.length} raster(s) are below native or unmeasured; do not call this film native` });
  return { assets: rows, shots, below_native: below, unmeasured, native };
}

// HARD-AUDIO-LICENCE: the manifest schema already refuses music or sfx without license, source and credit (the load fails with that rule),
// so qc only lists what ships in the credits.
export const creditsReport = (sctx) => currentAssets(sctx.manifest)
  .filter((a) => ["music", "sfx"].includes(a.kind) || (a.kind === "vo" && a.license))
  .map((a) => ({ id: a.id, v: a.v, kind: a.kind, license: a.license, source: a.source, credit: a.credit }));

export default {
  locks: true,
  options: {},
  async run({ values, positionals }, ctx) {
    if (positionals.length !== 1) throw new UsageError("usage: qc <mp4>");
    const { dir, rel } = resolveProject(ctx.cwd, values.project);
    const file = [resolve(ctx.cwd, positionals[0]), resolve(dir, positionals[0])].find((c) => existsSync(c) && statSync(c).isFile());
    if (!file) throw new UsageError(`mp4 not found: ${positionals[0]}`);

    const reportDir = safePath(dir, "review");
    const reportFile = safePath(dir, "review/qc.json");
    if (!reportDir || !reportFile) {
      const item = !reportDir ? "review" : "review/qc.json";
      throw new KitError("HARD", `${item} resolves outside the project`, { rule: "HARD-ASSETS-APPROVED", item });
    }

    const sctx = createContext(dir);
    const g0 = sctx.project.g0;
    const derived = deriveAll(sctx);
    const errors = [];
    const advice = [];
    const not_run = [];

    let probe = null;
    try {
      probe = await probeMedia(ctx, file);
    } catch (e) {
      if (e instanceof KitError && e.code === "BLOCKED") throw e;
      errors.push(err(e.rule ?? "HARD-FPS-SIZE", e.code ?? "HARD", e.item ?? null, e.message, e.detail));
    }

    let loud = null;
    const silent = g0.silence === "intentional";
    if (probe?.audio && !silent) {
      try {
        loud = await measureLoudness(ctx, file);
      } catch (e) {
        if (e instanceof KitError && e.code === "BLOCKED") throw e;
        errors.push(err(e.rule ?? "HARD-LOUDNESS", e.code ?? "HARD", e.item ?? null, e.message, e.detail));
      }
    }

    if (probe) {
      specChecks(g0, probe, loud, errors);
      if (silent) advice.push({ rule: "HARD-LOUDNESS", item: null, source: "project.yaml", message: "loudness is skipped because G0 chose intentional silence" });
    }

    const raster = rasterReport(dir, sctx, derived, errors, advice, not_run, (sctx.project.purges ?? []).length > 0);
    const credits = { ok: true, items: creditsReport(sctx) };

    const path = relative(dir, file);
    const data = {
      w: probe?.w ?? null,
      h: probe?.h ?? null,
      fps: probe?.fps ?? null,
      duration_s: probe?.duration_s ?? null,
      audio: probe?.audio ?? null,
      lufs: loud?.lufs ?? null,
      true_peak: loud?.true_peak ?? null,
      raster,
      credits,
    };

    mkdirSync(reportDir, { recursive: true });
    writeAtomic(reportFile, `${JSON.stringify({ file: isAbsolute(path) || path.startsWith("..") ? file : path, generated_at: ctx.now().toISOString(), ...data, errors: errors.map((e) => ({ rule: e.rule, item: e.item, message: e.message })), not_run }, null, 2)}\n`);
    const journal_id = appendJournal(dir, { command: "qc", summary: `${path} ${errors.length} error(s)`, now: ctx.now() });
    return { project: rel, journal_id, advice, errors, not_run, data };
  },
};
