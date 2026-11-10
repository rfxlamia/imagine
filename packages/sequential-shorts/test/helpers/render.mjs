import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { analyzeSignals } from "../../src/analyze/signals.mjs";
import { probe, timelineFromProbe } from "../../src/probe.mjs";
import { buildPlan } from "../../src/plan/build.mjs";
import { buildCandidates } from "../../src/plan/candidates.mjs";
import { partition } from "../../src/plan/partition.mjs";
import { composeArgs } from "../../src/render/compose.mjs";
import { writeJsonAtomic } from "../../src/run/fsx.mjs";
import { FFMPEG, TOOLS } from "./media.mjs";
import { DEFAULT_SETTINGS, transcriptOf } from "./plan.mjs";

export const OFF_MARKER = Object.freeze({ mode: "off", draw: false, style: null, warning: null });

// Runs probe + signals + planning on a real file, writing plan.json and work/ like `run --plan-only` does.
export async function planFromMedia(outDir, mediaPath, { settings = {}, words = null } = {}) {
  const ctx = { tools: TOOLS };
  const p = await probe(ctx, mediaPath);
  const signals = await analyzeSignals(ctx, p);
  const transcript = words ? transcriptOf([words]) : { status: "failed", reasons: ["no ASR in this test"], language: null, words: [] };
  const timeline = timelineFromProbe(p);
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const candidates = buildCandidates({ timeline, transcript, signals });
  const plan = buildPlan({ probe: p, transcript, settings: s, partitionResult: partition(candidates, { timeline, target_s: s.target_s, max_s: s.max_s }) });
  mkdirSync(join(outDir, "work"), { recursive: true });
  writeJsonAtomic(join(outDir, "work", "frames.json"), { frame_times: p.frame_times });
  writeJsonAtomic(join(outDir, "work", "signals.json"), signals);
  if (words) writeJsonAtomic(join(outDir, "transcript.json"), transcript);
  const planPath = join(outDir, "plan.json");
  writeJsonAtomic(planPath, plan);
  return { plan, planPath, timeline, signals, probe: p, candidates, transcript };
}

export function renderWith(plan, part, timeline, marker, out, preset = "ultrafast") {
  const { args } = composeArgs({ plan, part, timeline, marker, out, preset });
  const r = spawnSync(FFMPEG, args, { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`render failed: ${r.stderr}`);
  return out;
}
