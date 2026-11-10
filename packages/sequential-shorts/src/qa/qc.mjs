import { join } from "node:path";
import { SIGNAL_SETTINGS, parseSignalLog } from "../analyze/signals.mjs";
import { checkContinuity } from "../plan/validate.mjs";
import { OUT } from "../render/compose.mjs";
import { round6, writeJsonAtomic } from "../run/fsx.mjs";
import { ensureTool, runTool, tail } from "../run/tools.mjs";

export const QC_CHECKS = ["decode", "geometry", "duration", "audio", "av_sync", "black_frozen"];
const AAC_PRIMING_S = 2048 / OUT.sample_rate;
const st = (status, detail = null) => ({ status, detail });

async function ffprobeJson(ctx, file, args) {
  const r = ensureTool(await runTool(ctx, "ffprobe", ["-v", "error", ...args, "-of", "json", file], { timeoutMs: 1800000 }), "ffprobe", "qc");
  if (r.status !== 0) return null;
  try { return JSON.parse(r.stdout); } catch { return null; }
}

const overlaps = (a, list, slack = 0.25) => list.some((b) => a.start < b.end + slack && a.end > b.start - slack);

async function blackFrozen(ctx, file, part, signals, vdur) {
  if (!signals) return st("NOT_RUN", "work/signals.json missing; no source black/freeze reference");
  const s = SIGNAL_SETTINGS;
  const vf = `blackdetect=d=${s.black_min_s}:pix_th=${s.black_pix_th},freezedetect=n=${s.freeze_noise_db}dB:d=${s.freeze_min_s}`;
  const r = ensureTool(await runTool(ctx, "ffmpeg", ["-hide_banner", "-nostats", "-nostdin", "-i", file, "-vf", vf, "-an", "-f", "null", "-"], { timeoutMs: 3600000 }), "ffmpeg", "qc");
  if (r.status !== 0) return st("FAIL", tail(r.stderr, 300));
  const found = parseSignalLog(r.stderr, { duration_s: Number.isFinite(vdur) ? vdur : 1e9 });
  const shift = (x) => ({ start: round6(x.start + part.start_s), end: round6(x.end + part.start_s) });
  const new_black = found.blacks.map(shift).filter((x) => !overlaps(x, signals.blacks));
  const new_freeze = found.freezes.map(shift).filter((x) => !overlaps(x, signals.freezes));
  return new_black.length || new_freeze.length ? st("FAIL", { new_black, new_freeze }) : st("PASS", "no black or frozen region that the source does not have");
}

export async function checkPart(ctx, { file, part, plan, signals }) {
  const checks = {};
  const dec = ensureTool(await runTool(ctx, "ffmpeg", ["-v", "error", "-nostdin", "-i", file, "-f", "null", "-"], { timeoutMs: 3600000 }), "ffmpeg", "qc");
  const decodes = dec.status === 0 && dec.stderr.trim() === "";
  checks.decode = st(decodes ? "PASS" : "FAIL", decodes ? null : tail(dec.stderr, 300) || `exit ${dec.status}`);
  const info = await ffprobeJson(ctx, file, ["-show_streams", "-show_format"]);
  const v = info?.streams?.find((x) => x.codec_type === "video");
  const a = info?.streams?.find((x) => x.codec_type === "audio");
  checks.geometry = st(v && v.width === OUT.w && v.height === OUT.h ? "PASS" : "FAIL", v ? `${v.width}x${v.height}` : "no video stream");
  const fps = plan.source.fps;
  const vdur = Number(v?.duration ?? NaN);
  const forced = Boolean(part.boundary_out?.forced) || Boolean(plan.parts[part.index - 2]?.boundary_out?.forced);
  if (!Number.isFinite(vdur)) checks.duration = st("FAIL", "no video duration");
  else if (vdur <= plan.settings.max_s + 1 / fps + 1e-6) checks.duration = st("PASS", `${vdur} s`);
  else checks.duration = st(forced ? "PASS" : "FAIL", `${vdur} s is over max ${plan.settings.max_s} s${forced ? " (forced boundary, flagged)" : ""}`);
  if (!plan.source.has_audio) {
    checks.audio = st("NOT_RUN", "source has no audio stream");
    checks.av_sync = st("NOT_RUN", "source has no audio stream");
  } else {
    checks.audio = st(a ? "PASS" : "FAIL", a ? `${a.codec_name} ${a.sample_rate} Hz ${a.channel_layout ?? `${a.channels} ch`}` : "no audio stream");
    if (a && v) {
      const adur = Number(a.duration);
      const diff = Math.abs(adur - vdur);
      const tol = 1 / fps + AAC_PRIMING_S;
      const starts = Math.max(Math.abs(Number(v.start_time ?? 0)), Math.abs(Number(a.start_time ?? 0)));
      checks.av_sync = st(diff <= tol && starts <= 0.05 ? "PASS" : "FAIL", `audio ${adur} s, video ${vdur} s, diff ${round6(diff)} s (tolerance ${round6(tol)} s), largest start_time ${starts} s`);
    } else checks.av_sync = st("FAIL", "a stream is missing");
  }
  const cf = await ffprobeJson(ctx, file, ["-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames"]);
  const frames = Number(cf?.streams?.[0]?.nb_read_frames ?? NaN);
  let samples = null;
  if (a) {
    const sf = await ffprobeJson(ctx, file, ["-select_streams", "a:0", "-show_entries", "frame=nb_samples"]);
    samples = (sf?.frames ?? []).reduce((n, x) => n + Number(x.nb_samples), 0);
  }
  checks.black_frozen = await blackFrozen(ctx, file, part, signals, vdur);
  const status = Object.values(checks).some((c) => c.status === "FAIL") ? "FAIL" : "PASS";
  return { index: part.index, file, status, checks, counts: { frames, samples, video_duration_s: vdur, audio_duration_s: a ? Number(a.duration) : null } };
}

// Plan-level and decoded-level coverage (spec section 8.2, VFR rule from Task 0).
export function coverage({ plan, results }) {
  const N = results.length;
  const src = plan.source;
  const continuity = checkContinuity(plan);
  const plan_level = { status: continuity.length ? "FAIL" : "PASS", errors: continuity };
  const counts = results.map((r) => r.qc.counts);
  const sumFrames = counts.reduce((n, c) => n + c.frames, 0);
  let frames;
  if (src.fps_mode === "cfr") {
    const diff = sumFrames - src.frame_count;
    frames = { mode: "count", source: src.frame_count, parts: sumFrames, diff, tolerance: N, status: Math.abs(diff) <= N ? "PASS" : "FAIL" };
  } else {
    const sumDur = round6(counts.reduce((n, c) => n + c.video_duration_s, 0));
    const diff = round6(sumDur - src.duration_s);
    const tol = round6(N / src.fps);
    frames = { mode: "duration", source_s: src.duration_s, parts_s: sumDur, diff_s: diff, tolerance_s: tol,
      frames_informational: { source: src.frame_count, parts: sumFrames }, status: Math.abs(diff) <= tol ? "PASS" : "FAIL" };
  }
  let samples;
  if (!src.has_audio) samples = { status: "NOT_RUN", reason: "source has no audio stream" };
  else {
    const expected = Math.round((src.sample_count * OUT.sample_rate) / src.sample_rate);
    const sum = counts.reduce((n, c) => n + (c.samples ?? 0), 0);
    const diff = sum - expected;
    samples = { source: src.sample_count, source_rate: src.sample_rate, expected_at_48k: expected, parts: sum, diff, tolerance: 1024 * N, status: Math.abs(diff) <= 1024 * N ? "PASS" : "FAIL" };
  }
  const status = [plan_level.status, frames.status, samples.status].includes("FAIL") ? "FAIL" : "PASS";
  return { status, plan_level, frames, samples,
    rounding: { frames: frames.diff ?? frames.diff_s, samples: samples.diff ?? null, note: "sub-frame and sub-sample rounding across all cuts, reported explicitly" } };
}

export const writeQcReport = (planDir, report) => writeJsonAtomic(join(planDir, "qa", "qc.json"), report);

