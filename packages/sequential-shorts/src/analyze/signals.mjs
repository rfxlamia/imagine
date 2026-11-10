import { ShortsError } from "../errors.mjs";
import { round6 } from "../run/fsx.mjs";
import { ensureTool, runTool, tail } from "../run/tools.mjs";

export const SIGNAL_SETTINGS = { silence_db: -35, silence_min_s: 0.25, scene_threshold: 10, freeze_noise_db: -60, freeze_min_s: 0.8,
  black_min_s: 0.1, black_pix_th: 0.1, motion_window_s: 0.5, analysis_width: 320 };

// One decode pass on a downscaled copy. Every detector logs to stderr; all signals are candidates only.
export function signalArgs(path, hasAudio) {
  const s = SIGNAL_SETTINGS;
  const v = `[0:v:0]scale=${s.analysis_width}:-2,scdet=threshold=${s.scene_threshold},freezedetect=n=${s.freeze_noise_db}dB:d=${s.freeze_min_s},`
    + `blackdetect=d=${s.black_min_s}:pix_th=${s.black_pix_th},metadata=mode=print:key=lavfi.scd.score[v]`;
  const graph = hasAudio ? `${v};[0:a:0]silencedetect=n=${s.silence_db}dB:d=${s.silence_min_s}[a]` : v;
  return ["-hide_banner", "-nostats", "-nostdin", "-i", path, "-filter_complex", graph, "-map", "[v]", ...(hasAudio ? ["-map", "[a]"] : []), "-f", "null", "-"];
}

export function parseSignalLog(text, { duration_s, offset_s = 0 }) {
  const at = (x) => round6(Math.min(duration_s, Math.max(0, Number(x) - offset_s)));
  const silences = [];
  const scene_cuts = [];
  const freezes = [];
  const blacks = [];
  const frameScores = [];
  let silenceOpen = null;
  let freezeOpen = null;
  let lastPts = null;
  for (const line of text.split("\n")) {
    let m;
    if ((m = line.match(/silence_start: (-?[\d.]+)/))) silenceOpen = at(m[1]);
    else if ((m = line.match(/silence_end: (-?[\d.]+)/))) { silences.push({ start: silenceOpen ?? 0, end: at(m[1]) }); silenceOpen = null; }
    else if ((m = line.match(/lavfi\.scd\.score: ([\d.]+), lavfi\.scd\.time: ([\d.]+)/))) scene_cuts.push({ t: at(m[2]), score: Number(m[1]) });
    else if ((m = line.match(/lavfi\.freezedetect\.freeze_start: ([\d.]+)/))) freezeOpen = at(m[1]);
    else if ((m = line.match(/lavfi\.freezedetect\.freeze_end: ([\d.]+)/))) { freezes.push({ start: freezeOpen ?? 0, end: at(m[1]) }); freezeOpen = null; }
    else if ((m = line.match(/black_start:([\d.]+) black_end:([\d.]+)/))) blacks.push({ start: at(m[1]), end: at(m[2]) });
    else if ((m = line.match(/pts_time:(-?[\d.]+)/))) lastPts = at(m[1]);
    else if ((m = line.match(/lavfi\.scd\.score=([\d.]+)/)) && lastPts !== null) frameScores.push({ t: lastPts, score: Number(m[1]) });
  }
  if (silenceOpen !== null) silences.push({ start: silenceOpen, end: round6(duration_s) });
  if (freezeOpen !== null) freezes.push({ start: freezeOpen, end: round6(duration_s) });
  const w = SIGNAL_SETTINGS.motion_window_s;
  const buckets = new Map();
  for (const f of frameScores) {
    const k = Math.floor(f.t / w);
    const b = buckets.get(k) ?? { sum: 0, n: 0 };
    b.sum += f.score;
    b.n += 1;
    buckets.set(k, b);
  }
  const motion = [...buckets.entries()].sort((x, y) => x[0] - y[0])
    .map(([k, b]) => ({ start: round6(k * w), end: round6(Math.min(duration_s, (k + 1) * w)), score: round6(b.sum / b.n) }));
  return { silences, scene_cuts, motion, freezes, blacks, settings: SIGNAL_SETTINGS };
}

export async function analyzeSignals(ctx, probe) {
  const r = ensureTool(await runTool(ctx, "ffmpeg", signalArgs(probe.path, Boolean(probe.audio)), { timeoutMs: 3 * 3600 * 1000 }), "ffmpeg", "signals");
  if (r.status !== 0) throw new ShortsError("HARD", "signal analysis failed", { check: "signals", detail: tail(r.stderr) });
  return parseSignalLog(r.stderr, { duration_s: probe.duration_s, offset_s: probe.format_start_s });
}
