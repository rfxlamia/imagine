import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { ShortsError } from "./errors.mjs";
import { round6 } from "./run/fsx.mjs";
import { sha256File } from "./run/hash.mjs";
import { ensureTool, runTool, tail } from "./run/tools.mjs";
import { makeTimeline, parseRational } from "./plan/timeline.mjs";

const hard = (message, detail) => new ShortsError("HARD", message, { check: "probe", detail });

async function ffprobe(ctx, args) {
  return ensureTool(await runTool(ctx, "ffprobe", ["-v", "error", ...args], { timeoutMs: 600000 }), "ffprobe", "probe");
}

export async function probe(ctx, input) {
  const path = resolve(ctx.cwd ?? process.cwd(), input);
  if (!existsSync(path) || !statSync(path).isFile()) throw new ShortsError("HARD", `input not found: ${input}`, { check: "probe", item: input });
  const meta = await ffprobe(ctx, ["-show_streams", "-show_format", "-of", "json", path]);
  if (meta.status !== 0) throw hard("ffprobe cannot read the input (missing, corrupt or not a media file)", tail(meta.stderr));
  let info;
  try { info = JSON.parse(meta.stdout); } catch { throw hard("ffprobe returned unreadable output", tail(meta.stdout)); }
  const v = (info.streams ?? []).find((s) => s.codec_type === "video" && !s.disposition?.attached_pic);
  if (!v) throw hard("input has no video stream");
  const a = (info.streams ?? []).find((s) => s.codec_type === "audio") ?? null;
  const formatStart = Number(info.format?.start_time ?? 0) || 0;

  const pk = await ffprobe(ctx, ["-select_streams", "v:0", "-show_entries", "packet=pts_time", "-of", "csv=p=0", path]);
  const pts = pk.stdout.split("\n").map((l) => l.trim().replace(/,$/, "")).filter((l) => l.length > 0).map(Number).filter((x) => Number.isFinite(x)).sort((x, y) => x - y);
  if (pk.status !== 0 || pts.length === 0) throw hard("the video stream has no decodable packets", tail(pk.stderr));
  const dec = ensureTool(await runTool(ctx, "ffmpeg", ["-v", "error", "-nostdin", "-i", path, "-map", "0:v:0", "-frames:v", "1", "-f", "null", "-"], { timeoutMs: 120000 }), "ffmpeg", "probe");
  if (dec.status !== 0) throw hard("the video stream cannot be decoded", tail(dec.stderr));

  const frame_times = pts.map((p) => round6(p - formatStart));
  const intervals = frame_times.slice(1).map((t, i) => t - frame_times[i]).filter((d) => d > 0);
  const sorted = [...intervals].sort((x, y) => x - y);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const jitter = median > 0 ? Math.max(...intervals.map((d) => Math.abs(d - median))) / median : 0;
  const fps_rational = parseRational(v.avg_frame_rate) ? v.avg_frame_rate : v.r_frame_rate;
  const rotation = Number(v.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? 0);
  const swap = Math.abs(rotation) % 180 === 90;

  let audio = null;
  if (a) {
    const fr = await ffprobe(ctx, ["-select_streams", "a:0", "-show_entries", "frame=nb_samples", "-of", "csv=p=0", path]);
    const sample_count = fr.stdout.split("\n").reduce((s, l) => s + (Number(l.trim().replace(/,$/, "")) || 0), 0);
    const start_s = Number(a.start_time ?? formatStart);
    audio = { index: a.index, codec: a.codec_name, sample_rate: Number(a.sample_rate), channels: a.channels, channel_layout: a.channel_layout ?? null,
      start_s, offset_s: round6(start_s - formatStart), sample_count };
  }

  const { num, den } = parseRational(fps_rational);
  return {
    path, sha256: await sha256File(path), size: statSync(path).size,
    duration_s: round6(Number(info.format?.duration ?? 0)), format_start_s: formatStart,
    video: { index: v.index, codec: v.codec_name, width: v.width, height: v.height, rotation,
      display_width: swap ? v.height : v.width, display_height: swap ? v.width : v.height,
      r_frame_rate: v.r_frame_rate, avg_frame_rate: v.avg_frame_rate, fps_rational, fps: round6(num / den), time_base: v.time_base,
      start_s: Number(v.start_time ?? formatStart), fps_mode: jitter > 0.01 ? "vfr" : "cfr", jitter: round6(jitter), frame_count: frame_times.length },
    audio, frame_times,
  };
}

export const timelineFromProbe = (p) => makeTimeline({ fps_mode: p.video.fps_mode, fps_rational: p.video.fps_rational, frame_times: p.frame_times,
  frame_count: p.video.frame_count, duration_s: p.duration_s, sample_rate: p.audio?.sample_rate ?? null });
