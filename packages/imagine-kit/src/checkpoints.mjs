import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { err } from "./envelope.mjs";
import { KitError } from "./errors.mjs";
import { deriveAll } from "./derive.mjs";
import { currentAsset, currentAssets, loadManifest } from "./docs.mjs";
import { writeEvidence } from "./evidence.mjs";
import { defaultEvaluators } from "./evaluators.mjs";
import { sha256File } from "./hash.mjs";
import { loadProject } from "./project.mjs";
import { measureLoudness, pngInfo, probeMedia } from "./media.mjs";
import { rasterQ, round2, tierOf } from "./raster.mjs";
import { createContext, enumerateSources } from "./sources.mjs";
import { THRESHOLDS } from "./thresholds.mjs";
import { specChecks } from "./commands/qc.mjs";
import { checkAssets } from "./edit/assets-check.mjs";
import { renderPreflight } from "./edit/preflight.mjs";
import { lintProject, staticSceneChecks } from "./edit/composition.mjs";
import { safePath } from "./img/commit.mjs";
import { readRgba } from "./img/cutout.mjs";
import { classifyAlpha, computeAlphaMetrics } from "./img/alpha.mjs";
import { nativeFlags } from "./img/integrity.mjs";
import { inputsFrom, validateStory } from "./story/validate.mjs";
import { parseValue } from "./story/keys.mjs";
import { voiceConfig } from "./tts/voices.mjs";

export { THRESHOLDS };
// Version tag on every ruleVersion (`<RULE>@<n>`); bump when a Check's semantics change.
export const RULE_VERSION = 1;
export const CHECKPOINT_ITEM_PREFIX = "checkpoint:";
const IMAGE_KINDS = ["img", "ref"];
const PURGE_EXTS = [".png", ".mp4", ".jpg", ".jpeg"];

// ---------------------------------------------------------------- helpers
const rv = (rule) => `${rule}@${RULE_VERSION}`;
const hardOnly = (errors) => errors.filter((e) => e.code !== "HARD_NOT_RUN");
const notRunOf = (errors) => errors.filter((e) => e.code === "HARD_NOT_RUN");
const byRules = (errors, rules) => errors.filter((e) => rules.includes(e.rule));
const inScope = (env, a) => !env.scope?.size || [a.id, `${a.id}.v${a.v}`, `asset:${a.id}.v${a.v}`].some((k) => env.scope.has(k));
const memo = (env, key, make) => {
  env.cache ??= new Map();
  if (!env.cache.has(key)) env.cache.set(key, make());
  return env.cache.get(key);
};
const derived = (env) => memo(env, "derived", () => deriveAll(env.sctx));
const isPurged = (env) => (env.sctx.project.purges ?? []).length > 0;
const extOf = (p) => p.slice(p.lastIndexOf(".")).toLowerCase();
const fileHashes = (env, rels) => Object.fromEntries(rels.filter((r) => existsSync(join(env.dir, r))).map((r) => [`file:${r}`, sha256File(join(env.dir, r))]));

// Hashes of the sources a Check reads (`g0:`, `story:`, `bible:` ...), taken from the same source model status uses.
function sourceHashes(env, prefixes) {
  let all;
  try { all = memo(env, "sources", () => enumerateSources(env.sctx)); } catch (e) { if (env.invalid && e instanceof KitError && e.code === "HARD_NOT_RUN") return {}; throw e; }
  return Object.fromEntries(Object.entries(all).filter(([ref]) => prefixes.some((p) => ref.startsWith(p))));
}

// One validateStory pass shared by every Q1 Check that reads its findings.
function storyReport(env) {
  return memo(env, "story", () => {
    const { shots } = env.sctx.story;
    const previz = shots.length > 0 && shots.every((s) => s.keys.duration !== undefined);
    return validateStory(inputsFrom(env.sctx, previz ? "previz" : "storyboard"));
  });
}
const DEDICATED_STORY_RULES = ["HARD-STORY-UNIT-ONCE", "HARD-DURATION", "HARD-VO-NO-OVERLAP", "HARD-ENTITIES-EXIST"];

// The shots of STORY.md with their parsed duration and voice-over lines.
function shotPlan(env) {
  return env.sctx.story.shots.map((s) => {
    const val = (k) => (s.keys[k] === undefined ? undefined : parseValue(k, s.keys[k]).value);
    return { id: s.id, duration: val("duration") ?? val("duration_est"), voiceover: val("voiceover") ?? [] };
  });
}

// Req 3.7: when the script is longer than the brief allows, propose which shots to cut. Read-only: no unit is removed here.
export function proposeCutList(plan, maxSeconds) {
  const total = plan.reduce((sum, s) => sum + (s.duration ?? 0), 0);
  const excess = total - maxSeconds;
  if (excess <= THRESHOLDS.SHOT_DURATION_EPS) return null;
  const candidates = [];
  let freed = 0;
  for (const s of [...plan].reverse()) {
    if (freed >= excess - THRESHOLDS.SHOT_DURATION_EPS) break;
    if (s.duration === undefined) continue;
    candidates.push({ shot: s.id, duration_s: s.duration, units: s.voiceover.map((v) => v.unit) });
    freed += s.duration;
  }
  return { excess_s: Math.round(excess * 1000) / 1000, total_s: Math.round(total * 1000) / 1000, candidates, applied: false };
}

const hasPlacedFile = (env, a) => {
  const file = safePath(env.dir, a.path);
  return file && existsSync(file) ? file : null;
};

// ---------------------------------------------------------------- Q1 Checks
function runBriefContract(env) {
  const g0 = env.sctx.project.g0;
  const errors = [];
  const bad = (m) => errors.push(err("HARD-DURATION", "HARD", "g0", m));
  for (const f of ["format", "width", "height", "fps", "audio_mode", "platform"]) if (g0[f] === undefined || g0[f] === null || g0[f] === "") bad(`Creative_Brief field ${f} is missing`);
  if (g0.audio_mode === "narrated" && !(typeof g0.language === "string" && g0.language.trim())) bad("a narrated Creative_Brief needs a language");
  const { min, max } = g0.duration_s ?? {};
  if (!(Number.isFinite(min) && Number.isFinite(max) && min > 0 && max >= min)) bad("Creative_Brief duration_s must satisfy 0 < min <= max");
  return { errors, outputRefs: ["project.yaml"] };
}

const storyCheck = (rules) => (env) => {
  const r = storyReport(env);
  return { errors: byRules(r.errors, rules), outputRefs: ["STORY.md"], report: r };
};

function runDurationSum(env) {
  const out = storyCheck(["HARD-DURATION"])(env);
  const plan = shotPlan(env);
  const max = env.sctx.project.g0.duration_s.max;
  const proposal = proposeCutList(plan, max);
  if (proposal) out.proposal = proposal;
  return out;
}

function runVoOverlap(env) {
  const out = storyCheck(["HARD-VO-NO-OVERLAP"])(env);
  if (env.sctx.project.g0.audio_mode !== "narrated") return out;
  // The overlap rule only runs once the timing plan exists; without it the Check has not been evaluated.
  if (!out.report.checked.includes("HARD-VO-NO-OVERLAP") && out.errors.length === 0) out.notRun = "no timing plan to check VO overlap against";
  return out;
}

function runStyleConsistency(env) {
  const anchors = env.sctx.style;
  const errors = [];
  const visit = (v, where) => {
    if (typeof v === "string") {
      for (const m of v.matchAll(/style\.md#([a-z][a-z0-9-]*)/g)) {
        if (!Object.hasOwn(anchors, m[1])) errors.push(err("HARD-ENTITIES-EXIST", "HARD", where, `${where} references style anchor ${m[1]} which style.md does not define`));
      }
    } else if (Array.isArray(v)) v.forEach((x, i) => visit(x, `${where}[${i}]`));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) visit(x, `${where}.${k}`);
  };
  visit(env.sctx.bible, "bible");
  return { errors, outputRefs: ["bible.yaml", "style.md"] };
}

function runVoicePermission(env) {
  const { audio_mode } = env.sctx.project.g0;
  const errors = [];
  if (audio_mode !== "narrated") return { errors, outputRefs: ["bible.yaml"] };
  const speakers = new Set(Object.values(env.sctx.units.units).map((u) => u.speaker ?? "narrator"));
  for (const who of [...speakers].sort()) {
    const cfg = voiceConfig(env.sctx.bible, who);
    if (!cfg) { errors.push(err("HARD-HAS-VOICE-CLONING", "HARD", who, `speaker ${who} has no voice in bible.yaml`)); continue; }
    // PROC-VOICE-CONSENT: a cloned voice (file source) needs the owner's consent recorded in the bible.
    if (typeof cfg.source === "string" && cfg.source.startsWith("file:") && !(typeof cfg.consent === "string" && cfg.consent.trim())) {
      errors.push(err("HARD-HAS-VOICE-CLONING", "HARD", who, `speaker ${who} uses a cloned voice (${cfg.source}) with no consent recorded in the bible`));
    }
  }
  return { errors, outputRefs: ["bible.yaml"] };
}

// ---------------------------------------------------------------- Q2 Checks
function runImageIntegrity(env) {
  const errors = [];
  let notRun = null;
  const outputRefs = [];
  for (const a of currentAssets(env.sctx.manifest).filter((x) => IMAGE_KINDS.includes(x.kind) && inScope(env, x))) {
    const item = `${a.id}.v${a.v}`;
    const file = safePath(env.dir, a.path);
    if (!file) { errors.push(err("HARD-REAL-RASTER", "HARD", item, `${a.path} is outside the project`)); continue; }
    if (!existsSync(file)) {
      if (isPurged(env) && PURGE_EXTS.includes(extOf(a.path)) && !a.path.startsWith("post/")) notRun = `media purged (${a.path})`;
      else errors.push(err("HARD-REAL-RASTER", "HARD", item, `${a.path} does not exist`));
      continue;
    }
    outputRefs.push(a.path);
    let real = null;
    try { real = pngInfo(readFileSync(file)); } catch { real = null; }
    if (!real) errors.push(err("HARD-REAL-RASTER", "HARD", item, `${a.path} cannot be parsed as PNG`));
    else if (real.w !== a.w || real.h !== a.h) errors.push(err("HARD-REAL-RASTER", "HARD", item, `${a.path} is ${real.w}x${real.h} but the manifest records ${a.w}x${a.h}`));
    if (sha256File(file) !== a.sha256) errors.push(err("HARD-REAL-RASTER", "HARD", item, `${a.path} no longer matches its recorded SHA-256`));
  }
  return { errors, notRun, outputRefs };
}

const transparentIntent = (a) => a.cutout_method !== undefined || a.alpha_metrics !== undefined || /(^|\/)img\/figure\//.test(a.path);

// Pixel analysis of transparent-intent rasters (img/alpha.mjs, img/integrity.mjs). Pixels are decoded through ffmpeg (readRgba).
async function runAlphaCutout(env) {
  const errors = [];
  const outputRefs = [];
  const assets = currentAssets(env.sctx.manifest).filter((a) => a.kind === "img" && transparentIntent(a) && inScope(env, a));
  for (const a of assets) {
    const item = `${a.id}.v${a.v}`;
    const file = hasPlacedFile(env, a);
    if (!file) { errors.push(err("HARD-REAL-RASTER", "HARD", item, `${a.path} does not exist`)); continue; }
    outputRefs.push(a.path);
    const real = pngInfo(readFileSync(file));
    if (!real) { errors.push(err("HARD-REAL-RASTER", "HARD", item, `${a.path} cannot be parsed as PNG`)); continue; }
    const rgba = await (env.readRgba ?? ((p, w, h) => readRgba(env.ctx, p, w, h)))(file, real.w, real.h);
    const m = computeAlphaMetrics(rgba, real.w, real.h);
    const cls = classifyAlpha(m, rgba);
    if (cls.cls === "opaque") errors.push(err("HARD-REAL-RASTER", "HARD", item, `${item} declares transparent intent but has no transparency`));
    else if (cls.cls === "suspect") errors.push(err("HARD-REAL-RASTER", "HARD", item, `${item} alpha is suspect (${cls.reason})`));
    else for (const f of nativeFlags(m, rgba, real.w, real.h)) errors.push(err("HARD-REAL-RASTER", "HARD", item, `${item} cutout flagged: ${f}`));
  }
  return { errors, outputRefs };
}

// Messages that only restate "not approved at a Legacy_Gate"; Q2 replaces that approval with evidence, so they do not fail a Check.
const APPROVAL_ONLY = /has no approved version|is not approved at its gate|not accepted at G5b/;
function assetErrors(env) {
  return memo(env, "assets", () => {
    const { errors } = checkAssets(env.dir, env.sctx, derived(env));
    return errors.filter((e) => !APPROVAL_ONLY.test(e.message));
  });
}

function runAssetRefExists(env) {
  const errors = [...byRules(assetErrors(env), ["HARD-ASSETS-APPROVED"])];
  const { manifest } = env.sctx;
  // Every asset a shot declares must have a live, non-rejected version of the declared kind whose file matches its hash.
  for (const shot of env.sctx.story?.shots ?? []) {
    if (!shot.keys?.assets) continue;
    const parsed = parseValue("assets", shot.keys.assets);
    for (const d of Array.isArray(parsed?.value) ? parsed.value : []) {
      if (env.scope?.size && ![d.id, shot.id].some((k) => env.scope.has(k))) continue;
      const cur = currentAsset(manifest, d.id);
      const fail = (m) => errors.push(err("HARD-ASSETS-APPROVED", "HARD", d.id, `shot ${shot.id} declares asset ${d.id} but ${m}`));
      const latest = manifest.assets.filter((a) => a.id === d.id).reduce((b, a) => (b === null || a.v > b.v ? a : b), null);
      if (!cur || !latest) { fail("it has no live version in the manifest"); continue; }
      if (latest.status === "rejected") { fail(`its latest version v${latest.v} is rejected`); continue; }
      if (cur.kind !== d.kind) { fail(`its current version is ${cur.kind}, not ${d.kind}`); continue; }
      const file = hasPlacedFile(env, cur);
      if (!file) { if (!isPurged(env)) fail(`${cur.path} does not exist`); continue; }
      if (sha256File(file) !== cur.sha256) fail(`${cur.path} no longer matches its recorded hash`);
    }
  }
  for (const a of currentAssets(manifest).filter((x) => inScope(env, x))) {
    for (const ref of a.refs ?? []) {
      const cur = currentAsset(manifest, ref);
      if (!cur) errors.push(err("HARD-ASSETS-APPROVED", "HARD", `${a.id}.v${a.v}`, `${a.id}.v${a.v} references ${ref}, which has no live version`));
      else if (!hasPlacedFile(env, cur)) errors.push(err("HARD-ASSETS-APPROVED", "HARD", `${a.id}.v${a.v}`, `${a.id}.v${a.v} references ${ref}.v${cur.v}, whose file does not exist`));
    }
  }
  return { errors, outputRefs: ["assets/manifest.yaml"] };
}

function runVoCoverage(env) {
  const g0 = env.sctx.project.g0;
  if (g0.audio_mode !== "narrated") return { errors: [], outputRefs: [] };
  const errors = [...byRules(assetErrors(env), ["HARD-VO-PRESENT"])];
  const durations = env.sctx.voDurations;
  for (const s of shotPlan(env)) {
    if (s.duration === undefined) continue;
    for (const { unit, offset } of s.voiceover) {
      const len = durations[unit];
      if (len === undefined) continue;
      const limit = s.duration * (1 + THRESHOLDS.VO_OVER_PLAN_MAX);
      if ((offset ?? 0) + len > limit + THRESHOLDS.SHOT_DURATION_EPS) {
        errors.push(err("PROC-PREVIZ-NO-STRETCH", "HARD", unit, `${unit} runs ${round2(len)}s from ${offset ?? 0}s in ${s.id}, more than 20% beyond the planned ${s.duration}s`));
      }
    }
  }
  return { errors, outputRefs: ["assets/manifest.yaml"] };
}

const runAudioLicence = (env) => ({ errors: byRules(assetErrors(env), ["HARD-AUDIO-LICENCE"]), outputRefs: ["assets/manifest.yaml"] });

function runRasterFloor(env) {
  const errors = [];
  for (const a of currentAssets(env.sctx.manifest).filter((x) => x.kind === "img" && inScope(env, x))) {
    const item = `${a.id}.v${a.v}`;
    const file = hasPlacedFile(env, a);
    let real = null;
    if (file) { try { real = pngInfo(readFileSync(file)); } catch { real = null; } }
    const w = real?.w ?? a.w;
    const h = real?.h ?? a.h;
    const req = a.required_px;
    const okReq = req && Number.isFinite(req.w) && req.w > 0 && Number.isFinite(req.h) && req.h > 0;
    if (!okReq) { errors.push(err("HARD-RASTER-TIER", "HARD", item, `${item} has missing or non-positive required_px (raster budget)`)); continue; }
    if (!(Number.isFinite(w) && w > 0 && Number.isFinite(h) && h > 0)) { errors.push(err("HARD-RASTER-TIER", "HARD", item, `${item} has missing or non-positive dimensions`)); continue; }
    const q = rasterQ(w, h, req);
    if (tierOf(q) === "replan" || a.tier === "replan") {
      errors.push(err("HARD-RASTER-TIER", "HARD", item, `${item} is ${w}x${h} (q ${round2(q)}, below ${THRESHOLDS.RASTER_FLOOR_Q}); regenerate it at ${req.w}x${req.h} or re-plan the shot`));
    }
  }
  return { errors, outputRefs: ["assets/manifest.yaml"] };
}

// Loudness and true peak of a rendered mix, using qc.mjs's own rule (specChecks). Skipped for intentional silence (Req 4.6).
async function loudnessOf(env, file) {
  const g0 = env.sctx.project.g0;
  if (g0.silence === "intentional") return { errors: [], outputRefs: [], skipped: "intentional silence" };
  if (!file) return { errors: [], notRun: "no mix or MP4 was provided to measure", outputRefs: [] };
  const probe = await probeMedia(env.ctx, file);
  const loud = probe.audio ? await measureLoudness(env.ctx, file) : null;
  const all = [];
  if (loud) specChecks(g0, probe, loud, all);
  else all.push(err("HARD-AUDIO-STREAM", "HARD", null, "the file has no audio stream to measure"));
  return { errors: all.filter((e) => ["HARD-LOUDNESS", "HARD-AUDIO-STREAM"].includes(e.rule)), outputRefs: [file] };
}

// Checks that need a judge (an agent or a person), not a validator. Without an evaluator the Check is `not_run`, never `passed`.
const judged = (id) => async (env, check) => {
  const ev = env.evaluators?.[id];
  // Subjective judgement with no evaluator is reported as unevaluated (Req 10.7), never passed.
  if (!ev) return { errors: [], notRun: `no evaluator is available for ${id}`, outputRefs: [], unevaluated: [id] };
  const r = await ev({ dir: env.dir, sctx: env.sctx, check, ctx: env.ctx, mp4: env.mp4, mix: env.mix });
  return { errors: r.errors ?? [], outputRefs: r.outputRefs ?? [], result: r.result, notRun: r.notRun, unevaluated: r.unevaluated, evaluator: r.evaluator, evaluatorCapabilities: r.evaluatorCapabilities ?? r.capabilities };
};

// ---------------------------------------------------------------- Q3 Checks
async function runSceneLint(env) {
  const edit = join(env.dir, "edit");
  const compDir = join(edit, "compositions");
  if (!existsSync(join(edit, "index.html")) || !existsSync(compDir)) return { errors: [], notRun: "no scenes have been built", outputRefs: [] };
  const errors = [];
  const outputRefs = [];
  for (const name of readdirSync(compDir).filter((n) => n.endsWith(".html")).sort()) {
    outputRefs.push(`edit/compositions/${name}`);
    errors.push(...staticSceneChecks(readFileSync(join(compDir, name), "utf8"), name.slice(0, -5)));
  }
  const lint = await lintProject(env.ctx, edit);
  errors.push(...lint.errors);
  return { errors, outputRefs };
}

function runMotionAssertions(env) {
  if (!existsSync(join(env.dir, "edit", "index.html"))) return { errors: [], notRun: "no root composition (edit/index.html) to check", outputRefs: [] };
  return { errors: renderPreflight(env.dir, env.sctx.story.shots.map((s) => s.id)), outputRefs: ["edit/index.html", "edit/index.motion.json"] };
}

async function runMp4Technical(env) {
  if (!env.mp4) return { errors: [], notRun: "no rendered MP4 was provided", outputRefs: [] };
  const g0 = env.sctx.project.g0;
  const probe = await probeMedia(env.ctx, env.mp4);
  const all = [];
  specChecks(g0, probe, null, all);
  // Text safe-area has no validator in the kit; it is reported as unevaluated rather than passed silently.
  return { errors: all, outputRefs: [env.mp4], unevaluated: ["text-safe-area"] };
}

// ---------------------------------------------------------------- definitions
const builtin = (id, requires, evaluator, evaluatorCapabilities, rule, inputs, run) =>
  Object.freeze({ id, requires: Object.freeze([...requires]), evaluator, evaluatorCapabilities: Object.freeze([...evaluatorCapabilities]), rule, ruleVersion: rv(rule), inputs: Object.freeze(inputs), run });

const TEXT = ["text"];
const STORY_INPUTS = ["g0:", "unit:", "story:", "bible:", "shot:"];
const ASSET_INPUTS = ["asset:", "clock:"];

export const CHECKPOINTS = Object.freeze({
  Q1: Object.freeze({ id: "Q1", name: "Q1_Pre_production_Quality", checks: Object.freeze([
    builtin("creative-brief-contract", ["text"], "project/g0", TEXT, "HARD-DURATION", ["g0:"], runBriefContract),
    builtin("script-unit-coverage", ["text"], "story/validate", TEXT, "HARD-STORY-UNIT-ONCE", STORY_INPUTS, storyCheck(["HARD-STORY-UNIT-ONCE"])),
    builtin("duration-sum", ["text"], "story/validate", TEXT, "HARD-DURATION", STORY_INPUTS, runDurationSum),
    builtin("vo-no-overlap", ["text"], "story/validate", TEXT, "HARD-VO-NO-OVERLAP", STORY_INPUTS, runVoOverlap),
    builtin("entities-exist", ["text"], "story/validate", TEXT, "HARD-ENTITIES-EXIST", STORY_INPUTS, storyCheck(["HARD-ENTITIES-EXIST"])),
    builtin("style-consistency", ["text"], "checkpoints/style", TEXT, "HARD-ENTITIES-EXIST", ["bible:", "style:"], runStyleConsistency),
    builtin("voice-usage-permission", ["text"], "checkpoints/voice", TEXT, "HARD-HAS-VOICE-CLONING", ["unit:", "bible:"], runVoicePermission),
    builtin("plan-validation", ["text"], "story/validate", TEXT, "HARD-STORYBOARD-ASSET-DECL", STORY_INPUTS,
      (env) => ({ errors: storyReport(env).errors.filter((e) => !DEDICATED_STORY_RULES.includes(e.rule)), outputRefs: ["STORY.md"] })),
  ]) }),
  Q2: Object.freeze({ id: "Q2", name: "Q2_Asset_Quality", checks: Object.freeze([
    builtin("image-integrity", ["file-hash"], "checkpoints/image-integrity", ["file-hash"], "HARD-REAL-RASTER", ASSET_INPUTS, runImageIntegrity),
    builtin("alpha-cutout-integrity", ["image-inspection"], "img/integrity", ["image-inspection", "file-hash"], "HARD-REAL-RASTER", ASSET_INPUTS, runAlphaCutout),
    builtin("asset-ref-exists", ["text"], "edit/assets-check", TEXT, "HARD-ASSETS-APPROVED", ASSET_INPUTS, runAssetRefExists),
    builtin("vo-coverage-and-duration", ["audio-analysis"], "edit/assets-check", ["audio-analysis", "text"], "HARD-VO-PRESENT", [...ASSET_INPUTS, "shot:", "unit:"], runVoCoverage),
    builtin("audio-licence", ["text"], "edit/assets-check", TEXT, "HARD-AUDIO-LICENCE", ASSET_INPUTS, runAudioLicence),
    Object.freeze({ id: "visual-continuity", requires: Object.freeze(["image-inspection"]), evaluator: "continuity-reviewer", evaluatorCapabilities: Object.freeze(["image-inspection"]),
      rule: "DAG-STYLE-ANCHOR", ruleVersion: rv("DAG-STYLE-ANCHOR"), inputs: Object.freeze([...ASSET_INPUTS, "style:", "bible:"]), run: judged("visual-continuity") }),
    builtin("raster-quality-floor", ["file-hash"], "raster", ["file-hash"], "HARD-RASTER-TIER", ASSET_INPUTS, runRasterFloor),
  ]) }),
  Q3: Object.freeze({ id: "Q3", name: "Q3_Film_Quality", checks: Object.freeze([
    builtin("scene-lint", ["text"], "hyperframes:lint", TEXT, "HARD-SCENE-LINT", ["file:"], runSceneLint),
    builtin("motion-assertions", ["text"], "edit/preflight", TEXT, "HARD-ROOT-MOTION", ["file:"], runMotionAssertions),
    builtin("mp4-technical", ["file-hash"], "qc:mp4", ["file-hash", "video-probe"], "HARD-FPS-SIZE", ["g0:"], runMp4Technical),
    Object.freeze({ id: "visual-review", requires: Object.freeze(["image-inspection"]), evaluator: "visual-review", evaluatorCapabilities: Object.freeze(["image-inspection"]),
      rule: "HARD-FPS-SIZE", ruleVersion: rv("VISUAL-REVIEW"), inputs: Object.freeze(["g0:"]), run: judged("visual-review") }),
    builtin("loudness-mix", ["audio-analysis"], "qc:loudness", ["audio-analysis", "file-hash"], "HARD-LOUDNESS", ["g0:"], (env) => loudnessOf(env, env.mix ?? env.mp4)),
    builtin("audio-mix-review", ["audio-analysis"], "qc:loudness", ["audio-analysis", "file-hash"], "HARD-LOUDNESS", ["g0:"], (env) => loudnessOf(env, env.mp4)),
  ]) }),
});

export const CHECKPOINT_IDS = Object.freeze(Object.keys(CHECKPOINTS));
// "Q1" and the design's long names ("Q1_pre_production", "Q1_Pre_production_Quality") both resolve.
export function resolveCheckpoint(id) {
  const key = String(id ?? "").match(/^(Q[123])(?:_|$)/i)?.[1]?.toUpperCase();
  return key ? CHECKPOINTS[key] : undefined;
}
export const checkpointItemId = (id, scope) => `${CHECKPOINT_ITEM_PREFIX}${id}${scope?.length ? `[${[...scope].sort().join(",")}]` : ""}`;

// ---------------------------------------------------------------- state
// Most recent record per checkId. Records are append-only, so a later `at` wins and ties go to the later position.
function latestByCheck(records) {
  const latest = new Map();
  for (const r of records ?? []) {
    if (!r || typeof r.checkId !== "string") continue;
    const prev = latest.get(r.checkId);
    if (!prev || String(r.at ?? "") >= String(prev.at ?? "")) latest.set(r.checkId, r);
  }
  return latest;
}

// Derived only from Evidence_Records (Req 6.3): `passed` iff every Check's most recent record is `passed`;
// `failed` if any most recent record is `failed`; otherwise `open` (a Check is missing or `not_run`).
export function checkpointView(checkpointId, evidenceRecords) {
  const cp = resolveCheckpoint(checkpointId);
  if (!cp) throw new RangeError(`unknown checkpoint ${checkpointId}`);
  const latest = latestByCheck(evidenceRecords);
  const checks = cp.checks.map((c) => ({ id: c.id, result: latest.get(c.id)?.result ?? "missing", at: latest.get(c.id)?.at ?? null }));
  const state = checks.every((c) => c.result === "passed") ? "passed" : checks.some((c) => c.result === "failed") ? "failed" : "open";
  return { id: cp.id, state, checks };
}
export const checkpointState = (checkpointId, evidenceRecords) => checkpointView(checkpointId, evidenceRecords).state;

// The records of a Checkpoint item as stored in project.yaml.
export function checkpointEvidence(project, checkpointId, scope) {
  const cp = resolveCheckpoint(checkpointId);
  return cp ? project.items?.[checkpointItemId(cp.id, scope)]?.evidence ?? [] : [];
}
// Additive output fields (Req 13.7): Q1/Q2/Q3 state with per-Check results, and the Item_State of every item.
export function checkpointsSummary(project) {
  return Object.fromEntries(CHECKPOINT_IDS.map((id) => [id, checkpointView(id, checkpointEvidence(project, id))]));
}
export const itemStates = (items) => Object.fromEntries((items ?? []).map((i) => [i.id, { state: i.state, stale: i.stale }]));
export const loadCheckpointView = (dir, checkpointId, scope) => checkpointView(checkpointId, checkpointEvidence(loadProject(dir), checkpointId, scope));

// ---------------------------------------------------------------- runner
function resultOf(out) {
  if (out.result !== undefined && !["passed", "failed", "not_run"].includes(out.result)) return "not_run";
  const hard = hardOnly(out.errors ?? []);
  if (hard.length) return "failed";
  if (out.result === "failed") return "failed";
  if (out.notRun || notRunOf(out.errors ?? []).length || out.result === "not_run") return "not_run";
  return "passed";
}

async function runOne(env, check) {
  let out;
  try {
    out = await check.run(env, check);
  } catch (e) {
    // A missing tool or an unreadable source means the Check could not run. It is never a pass.
    if (e instanceof KitError && (e.code === "BLOCKED" || e.code === "HARD_NOT_RUN")) out = { errors: [], notRun: e.message, outputRefs: [] };
    else throw e;
  }
  return out;
}

// A schema-invalid project.yaml or manifest is a defect of the input, not a reason to refuse to run: it is recorded as a failed
// Check. Anything that is not a schema validation failure (unreadable or unparsable file) still throws.
const isSchemaFailure = (e) => e instanceof KitError && e.code === "HARD_NOT_RUN" && typeof e.detail === "string" && e.detail.length > 0;
const schemaErrors = (e, rule, item) => String(e.detail).split("; ").filter(Boolean).map((m) => err(e.rule ?? rule, "HARD", item, `${e.message}: ${m}`));
function probeInvalid(dir) {
  try { loadProject(dir); } catch (e) { if (isSchemaFailure(e)) return { area: "project", errors: schemaErrors(e, "HARD-STATUS-DERIVED", "project.yaml") }; throw e; }
  try { loadManifest(dir); } catch (e) {
    if (!isSchemaFailure(e)) throw e;
    const detail = String(e.detail);
    const area = /licen[sc]e/i.test(detail) ? "audio-licence" : /\bpath\b/i.test(detail) ? "image-integrity" : "asset-ref-exists";
    return { area, errors: schemaErrors(e, "HARD-AUDIO-LICENCE", "assets/manifest.yaml") };
  }
  return null;
}

// Runs every Check of a Checkpoint, writes one Evidence_Record per Check through writeEvidence (so capability gating applies),
// and returns the aggregate state (Req 3.6, 4.8, 5.5, 10.1-10.4).
export async function runCheckpoint(dir, checkpointId, opts = {}) {
  const cp = resolveCheckpoint(checkpointId);
  if (!cp) throw new RangeError(`unknown checkpoint ${checkpointId}`);
  const now = opts.now ?? opts.ctx?.now?.() ?? new Date();
  const scope = opts.scope?.length ? [...opts.scope] : [];
  const env = { dir, ctx: opts.ctx ?? {}, sctx: createContext(dir), scope: new Set(scope), mp4: opts.mp4 ?? null, mix: opts.mix ?? null,
    evaluators: { ...defaultEvaluators({ dispatch: opts.dispatch, sampleFrames: opts.sampleFrames }), ...(opts.evaluators ?? {}) }, readRgba: opts.readRgba };
  const itemId = checkpointItemId(cp.id, scope);
  const results = [];
  const invalid = probeInvalid(dir);
  env.invalid = invalid;
  const target = invalid && (invalid.area === "project" ? (cp.checks.find((c) => c.id === "creative-brief-contract") ?? cp.checks[0])
    : (cp.checks.find((c) => c.id === invalid.area) ?? cp.checks[0]));
  if (invalid?.area === "project") {
    // project.yaml is the store of Evidence_Records and cannot be saved while invalid, so the failure is returned, not persisted.
    const checks = cp.checks.map((c) => ({ checkId: c.id, result: c === target ? "failed" : "not_run", errors: c === target ? invalid.errors : [],
      not_run: c === target ? null : "project.yaml is invalid", proposal: null, unevaluated: [], evidenceErrors: [], record: null, journal_id: null }));
    const view = { id: cp.id, state: "failed", checks: checks.map((c) => ({ id: c.checkId, result: c.result, at: null })) };
    return { checkpoint: cp.id, itemId, state: "failed", checks, view };
  }
  const only = opts.only?.length ? new Set(opts.only) : null;
  for (const check of cp.checks) {
    if (only && !only.has(check.id)) continue;
    const out = invalid && check === target ? { errors: invalid.errors, outputRefs: ["assets/manifest.yaml"] } : await runOne(env, check);
    const result = resultOf(out);
    const evaluator = out.evaluator ?? check.evaluator;
    const capabilities = out.evaluatorCapabilities ?? check.evaluatorCapabilities;
    const inputHashes = { ...sourceHashes(env, check.inputs), ...fileHashes(env, (out.outputRefs ?? []).filter((r) => !r.startsWith("/") && !r.startsWith("..")).filter((r) => /^(edit|assets)\//.test(r))) };
    const w = writeEvidence(dir, { itemId, checkId: check.id, evaluator, evaluatorCapabilities: capabilities, requires: check.requires,
      ruleVersion: check.ruleVersion, inputHashes, outputRefs: out.outputRefs ?? [], result, now });
    results.push({ checkId: check.id, result: w.record?.result ?? "not_run", errors: out.errors ?? [], not_run: out.notRun ?? null,
      proposal: out.proposal ?? null, unevaluated: out.unevaluated ?? [], evidenceErrors: w.errors, record: w.record, journal_id: w.journal_id });
  }
  const view = loadCheckpointView(dir, cp.id, scope);
  return { checkpoint: cp.id, itemId, state: view.state, checks: results, view };
}
