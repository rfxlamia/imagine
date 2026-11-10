import { round6 } from "../run/fsx.mjs";

export function parseRational(s) {
  const [n, d = "1"] = String(s ?? "").split("/");
  const num = Number(n);
  const den = Number(d);
  return num > 0 && den > 0 ? { num, den } : null;
}

// All times are seconds on the media timeline minus the format start_time. Frame k starts at frameTime(k);
// frameTime(frame_count) is the end of the video. Audio sample index of a time is round(t * sample_rate).
export function makeTimeline({ fps_mode, fps_rational, frame_times = [], frame_count, duration_s, sample_rate = null }) {
  const r = parseRational(fps_rational);
  if (!r) throw new Error(`invalid frame rate ${fps_rational}`);
  const vfr = fps_mode === "vfr";
  const frameTime = (k) => {
    if (k <= 0) return 0;
    if (vfr) return k >= frame_count ? duration_s : frame_times[k];
    return round6((k * r.den) / r.num);
  };
  const snapFrame = (t) => {
    if (!vfr) return Math.min(frame_count, Math.max(0, Math.round((t * r.num) / r.den)));
    if (t >= duration_s) return frame_count;
    let lo = 0;
    let hi = frame_count;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (frameTime(mid) <= t) lo = mid; else hi = mid;
    }
    return t - frameTime(lo) <= frameTime(hi) - t ? lo : hi;
  };
  const sampleAt = (t) => (sample_rate ? Math.round(t * sample_rate) : null);
  return { fps: r.num / r.den, fps_rational: `${r.num}/${r.den}`, frameDur: r.den / r.num, frame_count, duration_s, sample_rate, vfr, frameTime, snapFrame, sampleAt };
}
