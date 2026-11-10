import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { makeTimeline } from "../../src/plan/timeline.mjs";
import { buildCandidates } from "../../src/plan/candidates.mjs";
import { partition } from "../../src/plan/partition.mjs";
import { buildPlan } from "../../src/plan/build.mjs";
import { writeJsonAtomic } from "../../src/run/fsx.mjs";

export const EMPTY_SIGNALS = Object.freeze({ silences: [], scene_cuts: [], motion: [], freezes: [], blacks: [] });
const r3 = (x) => Math.round(x * 1000) / 1000;

export function cfrTimeline(duration_s, { fps = 30, sr = 48000 } = {}) {
  const frame_count = Math.round(duration_s * fps);
  return makeTimeline({ fps_mode: "cfr", fps_rational: `${fps}/1`, frame_count, duration_s: frame_count / fps, sample_rate: sr });
}

// Words of `wordS` seconds separated by `gap`, filling [start, end]; the last word ends exactly at `end` with a period.
export function sentenceWords(start, end, { wordS = 0.4, gap = 0.1 } = {}) {
  const n = Math.max(1, Math.floor((end - start + gap) / (wordS + gap)));
  return Array.from({ length: n }, (_, k) => {
    const s = r3(start + k * (wordS + gap));
    const last = k === n - 1;
    return { start: s, end: last ? end : r3(s + wordS), word: last ? "akhir." : "kata", probability: 0.9 };
  });
}

export function transcriptOf(wordLists, status = "ok") {
  const words = wordLists.flat().map((w, i) => ({ i, ...w }));
  return { status, reasons: [], language: "id", words };
}

export const DEFAULT_SETTINGS = Object.freeze({ target_s: 60, max_s: 90, language: "auto", asr_model: "large-v3-turbo", marker: "auto", background: "blur" });

// A probe-shaped object over a placeholder file, for pure planning and validation tests.
export function fakeProbe(dir, { duration = 130, fps = 30, sr = 48000 } = {}) {
  const path = join(dir, "src.mp4");
  const bytes = `placeholder source ${duration}`;
  writeFileSync(path, bytes);
  const frame_count = Math.round(duration * fps);
  return { path, sha256: createHash("sha256").update(bytes).digest("hex"), duration_s: frame_count / fps, format_start_s: 0,
    video: { fps_mode: "cfr", fps, fps_rational: `${fps}/1`, frame_count, display_width: 1920, display_height: 1080, rotation: 0 },
    audio: sr ? { sample_rate: sr, sample_count: Math.round((frame_count / fps) * sr), offset_s: 0 } : null, frame_times: [] };
}

export function writeFixturePlan(dir, { duration = 130, settings = DEFAULT_SETTINGS } = {}) {
  const probe = fakeProbe(dir, { duration });
  const timeline = cfrTimeline(duration);
  const sentences = Array.from({ length: Math.floor(duration / 10) }, (_, k) => sentenceWords(10 * k + 0.5, 10 * k + 9.4));
  const transcript = transcriptOf(sentences);
  const candidates = buildCandidates({ timeline, transcript, signals: EMPTY_SIGNALS });
  const plan = buildPlan({ probe, transcript, settings, partitionResult: partition(candidates, { timeline, target_s: settings.target_s, max_s: settings.max_s }) });
  const path = join(dir, "plan.json");
  writeJsonAtomic(path, plan);
  return { plan, path, candidates, timeline, probe };
}
