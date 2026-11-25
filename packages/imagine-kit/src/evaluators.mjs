import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { err } from "./envelope.mjs";
import { probeMedia } from "./media.mjs";
import { ensureTool, runTool } from "./tools.mjs";

// Evaluator wrappers for the two Checks that need a judge (Req 4.7, 5.4, 10.5-10.7).
// An evaluator is `async ({ dir, sctx, check, ctx, mp4 }) => out` and is plugged into runCheckpoint through `opts.evaluators[checkId]`.
// `out` is the shape checkpoints.mjs `judged()` already consumes: { result, errors, outputRefs, evaluator, capabilities, notRun, unevaluated }.
//
// The kit never invokes an agent itself. The Orchestrator supplies `dispatch({ agent, mode, request })`, which returns the agent's
// structured response:
//   { outcome: "needs_changes" | "no_findings_observed" | "blocked" | "partial_review",
//     findings: [{ severity, shots: [shotId], attribute, observed, change }],
//     inspected: [assetPathOrFrame],      // what was actually opened; empty means nothing was looked at
//     verified: [{ shots: [shotId], attribute }] }   // optional positive coverage: attributes explicitly confirmed consistent

export const CONTINUITY_AGENT = "continuity-reviewer";
export const VISUAL_REVIEW_EVALUATOR = "visual-review";
export const DEFAULT_FRAME_SAMPLES = 8;
const RULE = { "visual-continuity": "VISUAL-CONTINUITY", "visual-review": "VISUAL-REVIEW" };

const asArray = (v) => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]);
const str = (v) => (typeof v === "string" ? v.trim() : "");

function normalizeFinding(f) {
  const shots = [...new Set(asArray(f?.shots ?? f?.shot).map(str).filter(Boolean))].sort();
  return { severity: str(f?.severity) || "P1", shots, attribute: str(f?.attribute) || "unspecified", observed: str(f?.observed), change: str(f?.change) };
}

// Req 10.6: one failing error per finding, naming exactly the shot set and the inconsistent attribute.
export function findingToError(checkId, finding) {
  const f = normalizeFinding(finding);
  const where = f.shots.length ? `shots ${f.shots.join(", ")}` : "an unnamed shot set";
  const msg = `${where} are inconsistent in attribute "${f.attribute}"${f.observed ? `: ${f.observed}` : ""}${f.change ? ` (fix: ${f.change})` : ""}`;
  return err(RULE[checkId] ?? "VISUAL-REVIEW", "HARD", f.shots.join(",") || null, msg);
}

// The refs a finding contributes to the Evidence_Record: `shot:<id>` for each shot, `attribute:<name>` once.
export const findingRefs = (finding) => {
  const f = normalizeFinding(finding);
  return [...f.shots.map((s) => `shot:${s}`), `attribute:${f.attribute}`];
};

const inspectedPaths = (resp) => asArray(resp?.inspected).filter((x) => typeof x === "string" && x.trim() !== "");

// Converts a structured agent response into a Check outcome.
//  - any finding                          -> failed, carrying shot set and attribute
//  - bare "no findings"                   -> not_run (the agent's `no_findings_observed` is not PASS, Req 10.7)
//  - no findings plus explicit `verified` -> passed (positive coverage was reported, not just silence)
//  - blocked / partial_review / unusable  -> not_run
// `image-inspection` is claimed only when the response says something was actually inspected; otherwise the Evidence writer
// downgrades the record to not_run on capability grounds (Req 10.2).
export function mapReviewResponse(checkId, evaluator, resp) {
  const inspected = inspectedPaths(resp);
  const capabilities = inspected.length ? ["image-inspection"] : ["text"];
  const base = { evaluator, capabilities, outputRefs: [...inspected] };
  if (!resp || typeof resp !== "object") return { ...base, errors: [], result: "not_run", notRun: `${evaluator} returned no usable response`, unevaluated: [checkId] };

  const findings = asArray(resp.findings);
  if (findings.length) {
    const refs = new Set(base.outputRefs);
    for (const f of findings) for (const r of findingRefs(f)) refs.add(r);
    return { ...base, outputRefs: [...refs], errors: findings.map((f) => findingToError(checkId, f)), result: "failed" };
  }
  if (resp.outcome === "needs_changes") {
    return { ...base, errors: [], result: "not_run", notRun: `${evaluator} reported needs_changes without any finding`, unevaluated: [checkId] };
  }
  if (resp.outcome === "blocked" || resp.outcome === "partial_review") {
    return { ...base, errors: [], result: "not_run", notRun: `${evaluator} review is ${resp.outcome}`, unevaluated: [checkId] };
  }
  const verified = asArray(resp.verified).filter((v) => asArray(v?.shots ?? v?.shot).length && str(v?.attribute));
  if (resp.outcome === "no_findings_observed" && verified.length && inspected.length) {
    const refs = new Set(base.outputRefs);
    for (const v of verified) for (const r of findingRefs(v)) refs.add(r);
    return { ...base, outputRefs: [...refs], errors: [], result: "passed" };
  }
  return { ...base, errors: [], result: "not_run", notRun: `${evaluator} observed no findings but reported no verified coverage; absence of findings is not a pass`, unevaluated: [checkId] };
}

const unavailable = (checkId, evaluator, why) => ({ evaluator, capabilities: ["text"], errors: [], outputRefs: [], result: "not_run", notRun: why, unevaluated: [checkId] });

// Req 4.7, 10.5: continuity review of the project's images against bible, style and approved references.
export function createContinuityEvaluator({ dispatch } = {}) {
  return async ({ dir, sctx, check }) => {
    if (typeof dispatch !== "function") return unavailable("visual-continuity", CONTINUITY_AGENT, `no dispatch is available for ${CONTINUITY_AGENT}`);
    let resp;
    try {
      resp = await dispatch({ agent: CONTINUITY_AGENT, mode: "batch-asset-continuity", request: { dir, check: check?.id ?? "visual-continuity", shots: sctx?.story?.shots?.map((s) => s.id) ?? [] } });
    } catch (e) {
      return unavailable("visual-continuity", CONTINUITY_AGENT, `${CONTINUITY_AGENT} dispatch failed: ${e.message}`);
    }
    return mapReviewResponse("visual-continuity", CONTINUITY_AGENT, resp);
  };
}

// Evenly spaced sample times inside (0, duration), avoiding the very first and last frame.
export function sampleTimes(duration, count = DEFAULT_FRAME_SAMPLES) {
  if (!(Number.isFinite(duration) && duration > 0) || !(count > 0)) return [];
  return Array.from({ length: count }, (_, i) => Math.round(((i + 0.5) * duration / count) * 1000) / 1000);
}

// Default frame sampler: extracts PNG stills with ffmpeg into a temp dir and returns their paths.
export async function sampleFrames(ctx, mp4, count = DEFAULT_FRAME_SAMPLES) {
  const probe = await probeMedia(ctx, mp4);
  const out = mkdtempSync(join(tmpdir(), "imagine-frames-"));
  const frames = [];
  for (const [i, t] of sampleTimes(probe.duration_s, count).entries()) {
    const file = join(out, `frame-${String(i).padStart(3, "0")}.png`);
    const r = ensureTool(await runTool(ctx, "ffmpeg", ["-v", "error", "-ss", String(t), "-i", mp4, "-frames:v", "1", "-y", file]), "ffmpeg", "HARD-FPS-SIZE");
    if (r.status === 0) frames.push({ t, path: file });
  }
  return frames;
}

// Req 5.4, 10.5: reviews frames sampled from the rendered MP4. Without an MP4, a dispatch or frames, the Check is not_run.
export function createVisualReviewEvaluator({ dispatch, sampleFrames: sample = sampleFrames, samples = DEFAULT_FRAME_SAMPLES } = {}) {
  return async ({ dir, sctx, check, ctx, mp4 }) => {
    const id = "visual-review";
    if (!mp4) return unavailable(id, VISUAL_REVIEW_EVALUATOR, "no rendered MP4 was provided to sample frames from");
    if (typeof dispatch !== "function") return unavailable(id, VISUAL_REVIEW_EVALUATOR, `no dispatch is available for ${VISUAL_REVIEW_EVALUATOR}`);
    let resp;
    try {
      const frames = await sample(ctx ?? {}, mp4, samples);
      if (!frames.length) return unavailable(id, VISUAL_REVIEW_EVALUATOR, "no frames could be sampled from the MP4");
      resp = await dispatch({ agent: VISUAL_REVIEW_EVALUATOR, mode: "rendered-frames", request: { dir, mp4, frames, check: check?.id ?? id, shots: sctx?.story?.shots?.map((s) => s.id) ?? [] } });
    } catch (e) {
      return unavailable(id, VISUAL_REVIEW_EVALUATOR, `${VISUAL_REVIEW_EVALUATOR} could not run: ${e.message}`);
    }
    return mapReviewResponse(id, VISUAL_REVIEW_EVALUATOR, resp);
  };
}

// The evaluators runCheckpoint plugs in when the Orchestrator supplies a `dispatch` function.
export function defaultEvaluators({ dispatch, sampleFrames: sample, samples } = {}) {
  if (typeof dispatch !== "function") return {};
  return {
    "visual-continuity": createContinuityEvaluator({ dispatch }),
    "visual-review": createVisualReviewEvaluator({ dispatch, sampleFrames: sample, samples }),
  };
}
