import { ShortsError } from "../errors.mjs";
import { round6 } from "../run/fsx.mjs";

export const OUT = { w: 1080, h: 1920, crf: 18, preset: "medium", audio_bitrate: "192k", sample_rate: 48000 };
export const MARKER = { band_min_px: 96, band_font: 60, pill_font: 40, pill_x: 64, pill_y: 160 };
const even = (x) => 2 * Math.round(x / 2);

export function layoutFor(source) {
  const a = source.display_width / source.display_height;
  return Math.abs(a - 9 / 16) / (9 / 16) <= 0.01 ? "passthrough" : "contain";
}

// The whole frame scaled to fit 1080 wide (or 1920 tall for very tall input), centered. Nothing is cropped.
export function containGeometry(source) {
  const a = source.display_width / source.display_height;
  let w = OUT.w;
  let h = even(OUT.w / a);
  if (h > OUT.h) { h = OUT.h; w = even(OUT.h * a); }
  return { w, h, x: (OUT.w - w) / 2, y: (OUT.h - h) / 2 };
}

export function resolveMarker(setting, layout, caps, source) {
  if (setting === "off") return { mode: "off", draw: false, style: null, warning: null };
  const style = layout === "contain" && containGeometry(source).y >= MARKER.band_min_px ? "band" : "pill";
  if (setting === "auto") {
    if (layout === "passthrough") return { mode: "auto", draw: false, style: null, warning: null };
    if (!caps.drawtext) return { mode: "auto", draw: false, style: null, warning: "ffmpeg drawtext with fontconfig is not available; the Part X/N marker was skipped" };
    return { mode: "auto", draw: true, style, warning: null };
  }
  if (!caps.drawtext) {
    throw new ShortsError("HARD", "--marker on needs ffmpeg drawtext with fontconfig (for example Homebrew ffmpeg-full through SEQ_SHORTS_FFMPEG)", { check: "marker", detail: caps.drawtext_detail });
  }
  return { mode: "on", draw: true, style, warning: null };
}

export function markerFilter(marker, part, source) {
  if (!marker.draw) return "";
  const text = `Part ${part.index}/${part.of}`;
  if (marker.style === "band") {
    const band = containGeometry(source).y;
    const y = Math.max(0, Math.round((band - MARKER.band_font) / 2));
    return `,drawtext=font=Sans:text='${text}':fontsize=${MARKER.band_font}:fontcolor=white:x=(w-text_w)/2:y=${y}:shadowcolor=black@0.6:shadowx=2:shadowy=2`;
  }
  return `,drawtext=font=Sans:text='${text}':fontsize=${MARKER.pill_font}:fontcolor=white:box=1:boxcolor=black@0.45:boxborderw=16:x=${MARKER.pill_x}:y=${MARKER.pill_y}`;
}

const seekFrameFor = (timeline, part) => (part.start_frame === 0 ? 0 : Math.min(part.start_frame, timeline.snapFrame(Math.max(0, part.start_s - 3))));

// Accurate trim (spec section 7.1): a coarse input seek half a frame before the seek frame (so that frame is the first
// one decoded), then trim by frame index relative to it. Audio comes from a second, unseeked input and is trimmed by
// sample index, so part i end and part i+1 start are the same sample. Verified: frame and sample sums are exact.
export function composeArgs({ plan, part, timeline, marker, out, preset = OUT.preset }) {
  const src = plan.source;
  const layout = layoutFor(src);
  const last = part.index === part.of;
  const seekFrame = seekFrameFor(timeline, part);
  const seekS = seekFrame === 0 ? 0 : (timeline.frameTime(seekFrame - 1) + timeline.frameTime(seekFrame)) / 2;
  let v = `[0:v:0]trim=start_frame=${part.start_frame - seekFrame}${last ? "" : `:end_frame=${part.end_frame - seekFrame}`},setpts=PTS-STARTPTS`;
  if (src.fps_mode === "vfr") v += `,fps=${src.fps_rational}`;
  const mk = markerFilter(marker, part, src);
  let graph;
  if (layout === "passthrough") {
    const scale = src.display_width === OUT.w && src.display_height === OUT.h ? "" : `,scale=${OUT.w}:${OUT.h}:flags=lanczos`;
    graph = `${v}${scale},setsar=1,format=yuv420p${mk}[v]`;
  } else {
    const g = containGeometry(src);
    if (plan.settings.background === "blur") {
      graph = `${v},split=2[fg0][bg0];[bg0]scale=${OUT.w}:${OUT.h}:force_original_aspect_ratio=increase,crop=${OUT.w}:${OUT.h},gblur=sigma=30,colorchannelmixer=rr=0.6:gg=0.6:bb=0.6[bg];`
        + `[fg0]scale=${g.w}:${g.h}:flags=lanczos,setsar=1[fg];[bg][fg]overlay=${g.x}:${g.y},setsar=1,format=yuv420p${mk}[v]`;
    } else {
      const hex = plan.settings.background.slice("color:#".length);
      graph = `${v},scale=${g.w}:${g.h}:flags=lanczos,setsar=1,pad=${OUT.w}:${OUT.h}:${g.x}:${g.y}:color=0x${hex},format=yuv420p${mk}[v]`;
    }
  }
  const audio = src.has_audio;
  if (audio) {
    const off = Math.round((src.audio_offset_s ?? 0) * src.sample_rate);
    const as = part.start_sample - off;
    const ae = part.end_sample - off;
    const lead = as < 0 ? -as : 0;
    // A later-starting audio stream runs past the video end; bound the last part then too.
    const openEnd = last && off <= 0;
    graph += `;[1:a:0]atrim=start_sample=${Math.max(0, as)}${openEnd ? "" : `:end_sample=${Math.max(0, ae)}`},asetpts=PTS-STARTPTS${lead > 0 ? `,adelay=delays=${lead}S:all=1` : ""}[a]`;
  }
  const args = ["-hide_banner", "-nostdin", "-v", "error", "-y",
    ...(seekS > 0 ? ["-ss", seekS.toFixed(6)] : []), "-i", src.path, ...(audio ? ["-i", src.path] : []),
    "-filter_complex", graph, "-map", "[v]", ...(audio ? ["-map", "[a]"] : []),
    "-c:v", "libx264", "-crf", String(OUT.crf), "-preset", preset, "-pix_fmt", "yuv420p",
    ...(src.fps_mode === "vfr" ? ["-fps_mode", "cfr"] : []),
    ...(audio ? ["-c:a", "aac", "-b:a", OUT.audio_bitrate, "-ar", String(OUT.sample_rate)] : []),
    "-movflags", "+faststart", "-map_metadata", "-1", out];
  return { args, layout, seek_frame: seekFrame, seek_s: round6(seekS), marker };
}
