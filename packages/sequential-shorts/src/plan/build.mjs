import { round6 } from "../run/fsx.mjs";
import { PARTITION } from "./partition.mjs";
import { parseRational } from "./timeline.mjs";

export const PLAN_SCHEMA_ID = "sequential-shorts/plan@1";

export function sourceBlock(probe) {
  const { num, den } = parseRational(probe.video.fps_rational);
  return { path: probe.path, sha256: probe.sha256, duration_s: probe.duration_s, fps_mode: probe.video.fps_mode, fps: probe.video.fps,
    fps_rational: probe.video.fps_rational, time_base: `${den}/${num}`, frame_count: probe.video.frame_count, has_audio: Boolean(probe.audio),
    sample_rate: probe.audio?.sample_rate ?? null, sample_count: probe.audio?.sample_count ?? null, audio_offset_s: probe.audio?.offset_s ?? null,
    display_width: probe.video.display_width, display_height: probe.video.display_height, rotation: probe.video.rotation };
}

export function voRange(words, start, end) {
  const inside = words.filter((w) => { const mid = (w.start + w.end) / 2; return mid >= start && mid < end; });
  if (!inside.length) return null;
  return { first_word: inside[0].i, last_word: inside.at(-1).i, text: inside.map((w) => w.word).join(" ") };
}

function boundaryOut(b) {
  if (b.kind === "end") return { kind: "end", candidate_id: null, evidence: [], cost: 0, forced: false, forced_reason: null, uncertain: false };
  return { kind: b.kind, candidate_id: b.id, evidence: b.evidence, cost: b.cost, forced: b.forced_only, forced_reason: b.forced_only ? b.forced_reason : null,
    uncertain: b.forced_only || b.cost >= PARTITION.uncertain_cost };
}

export function buildPlan({ probe, transcript, settings, partitionResult }) {
  const source = sourceBlock(probe);
  const sr = source.sample_rate;
  const words = transcript?.status === "ok" ? transcript.words : [];
  const N = partitionResult.parts.length;
  return {
    schema: PLAN_SCHEMA_ID, source, settings,
    vo: { status: transcript?.status ?? "failed", reasons: transcript?.reasons ?? [], language: transcript?.language ?? null },
    parts: partitionResult.parts.map((p, i) => ({
      index: i + 1, of: N, start_s: p.start_s, end_s: p.end_s, start_frame: p.start_frame, end_frame: p.end_frame,
      start_sample: sr ? Math.round(p.start_s * sr) : null, end_sample: sr ? Math.round(p.end_s * sr) : null,
      duration_s: round6(p.end_s - p.start_s), vo_range: voRange(words, p.start_s, p.end_s), title: "", description: "",
      boundary_out: boundaryOut(p.boundary),
    })),
  };
}
