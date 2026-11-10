import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import Ajv from "ajv";
import { ShortsError } from "../errors.mjs";
import { readJson, readJsonIfExists } from "../run/fsx.mjs";
import { sha256File } from "../run/hash.mjs";
import { makeTimeline } from "./timeline.mjs";

const ajv = new Ajv({ allErrors: true, strict: true });
const validateSchema = ajv.compile(JSON.parse(readFileSync(new URL("../../schemas/plan.schema.json", import.meta.url), "utf8")));
const TOL = 1e-3;
const e = (check, item, message) => ({ code: "HARD", check, item, message });
const pid = (p) => `part-${String(p?.index ?? "?").padStart(2, "0")}`;

export function checkContinuity(plan, timeline = null) {
  const errors = [];
  const parts = plan.parts;
  const N = parts.length;
  const last = parts.at(-1);
  parts.forEach((p, i) => {
    if (p.index !== i + 1) errors.push(e("index", pid(p), `part at position ${i + 1} has index ${p.index}`));
    if (p.of !== N) errors.push(e("index", pid(p), `part ${p.index} says of ${p.of}; the plan has ${N} parts`));
    if (!(p.end_frame > p.start_frame)) errors.push(e("order", pid(p), `part ${p.index} end_frame ${p.end_frame} is not after start_frame ${p.start_frame}`));
    if (Math.abs(p.duration_s - (p.end_s - p.start_s)) > TOL) errors.push(e("duration", pid(p), `part ${p.index} duration_s is not end_s - start_s`));
    const next = parts[i + 1];
    if (next) {
      if (next.start_frame > p.end_frame) errors.push(e("gap", pid(p), `gap between part ${p.index} (end_frame ${p.end_frame}) and part ${next.index} (start_frame ${next.start_frame})`));
      if (next.start_frame < p.end_frame) errors.push(e("overlap", pid(p), `part ${p.index} (end_frame ${p.end_frame}) overlaps part ${next.index} (start_frame ${next.start_frame})`));
      if (next.start_s !== p.end_s) errors.push(e("gap", pid(p), `part ${next.index} start_s ${next.start_s} is not part ${p.index} end_s ${p.end_s}`));
      if (next.start_sample !== p.end_sample) errors.push(e("gap", pid(p), `part ${next.index} start_sample is not part ${p.index} end_sample`));
    }
    const forced = p.boundary_out.forced || Boolean(parts[i - 1]?.boundary_out.forced);
    if (p.duration_s > plan.settings.max_s + 1e-6 && !forced) errors.push(e("max", pid(p), `part ${p.index} is ${p.duration_s} s, over max ${plan.settings.max_s} s, with no forced boundary`));
  });
  if (parts[0].start_frame !== 0 || parts[0].start_s !== 0) errors.push(e("coverage", pid(parts[0]), "part 1 must start at frame 0 and 0 s"));
  if (last.end_frame !== plan.source.frame_count) errors.push(e("coverage", pid(last), `last part ends at frame ${last.end_frame}; the source has ${plan.source.frame_count} frames`));
  if (Math.abs(last.end_s - plan.source.duration_s) > 1 / plan.source.fps + 1e-6) errors.push(e("coverage", pid(last), `last part ends at ${last.end_s} s; the source lasts ${plan.source.duration_s} s`));
  if (timeline) {
    for (const p of parts) {
      if (Math.abs(timeline.frameTime(p.start_frame) - p.start_s) > TOL) errors.push(e("timing", pid(p), `start_s ${p.start_s} does not match start_frame ${p.start_frame} (${timeline.frameTime(p.start_frame)} s)`));
      if (p !== last && Math.abs(timeline.frameTime(p.end_frame) - p.end_s) > TOL) errors.push(e("timing", pid(p), `end_s ${p.end_s} does not match end_frame ${p.end_frame} (${timeline.frameTime(p.end_frame)} s)`));
      if (plan.source.has_audio) {
        if (p.start_sample !== timeline.sampleAt(p.start_s)) errors.push(e("timing", pid(p), `start_sample must be round(start_s * sample_rate) = ${timeline.sampleAt(p.start_s)}`));
        if (p.end_sample !== timeline.sampleAt(p.end_s)) errors.push(e("timing", pid(p), `end_sample must be round(end_s * sample_rate) = ${timeline.sampleAt(p.end_s)}`));
      } else if (p.start_sample !== null || p.end_sample !== null) errors.push(e("timing", pid(p), "the source has no audio; samples must be null"));
    }
  }
  return errors;
}

export function checkPlan(plan, { timeline = null } = {}) {
  if (!validateSchema(plan)) return validateSchema.errors.map((x) => e("schema", x.instancePath || "/", `${x.instancePath || "/"} ${x.message}`));
  const errors = [];
  if (plan.settings.max_s < plan.settings.target_s) errors.push(e("settings", null, "max_s must be at least target_s"));
  return [...errors, ...checkContinuity(plan, timeline)];
}

export function timelineForPlan(plan, planDir) {
  const s = plan.source;
  let frame_times = [];
  if (s.fps_mode === "vfr") {
    const f = readJsonIfExists(join(planDir, "work", "frames.json"));
    if (!f || !Array.isArray(f.frame_times) || f.frame_times.length !== s.frame_count) {
      throw new ShortsError("HARD", "a VFR plan needs work/frames.json from the same run; rerun `run --plan-only`", { check: "timing", item: "work/frames.json" });
    }
    frame_times = f.frame_times;
  }
  return makeTimeline({ fps_mode: s.fps_mode, fps_rational: s.fps_rational, frame_times, frame_count: s.frame_count, duration_s: s.duration_s, sample_rate: s.sample_rate });
}

export async function validatePlanFile(ctx, planPath) {
  const abs = resolve(ctx.cwd ?? process.cwd(), planPath);
  if (!existsSync(abs)) throw new ShortsError("HARD", `plan not found: ${planPath}`, { check: "plan", item: planPath });
  let plan;
  try { plan = readJson(abs); } catch (x) { throw new ShortsError("HARD", `plan is not valid JSON: ${x.message}`, { check: "plan", item: planPath }); }
  const planDir = dirname(abs);
  const first = checkPlan(plan);
  if (first.some((x) => x.check === "schema")) return { plan, planDir, planPath: abs, timeline: null, errors: first, warnings: [] };
  const timeline = timelineForPlan(plan, planDir);
  const errors = checkPlan(plan, { timeline });
  const warnings = plan.settings.max_s > 90 ? [{ check: "settings", message: `max ${plan.settings.max_s} s is above 90 s; platform limits for Shorts differ` }] : [];
  if (!existsSync(plan.source.path)) errors.push(e("source-hash", plan.source.path, "source file not found"));
  else if ((await sha256File(plan.source.path)) !== plan.source.sha256) errors.push(e("source-hash", plan.source.path, "the source file changed since the plan was made (sha256 differs)"));
  return { plan, planDir, planPath: abs, timeline, errors, warnings };
}
