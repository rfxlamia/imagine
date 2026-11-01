import { KitError } from "./errors.mjs";
import { ensureTool, runTool } from "./tools.mjs";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// Width and height from the IHDR chunk, or null when the bytes are not a PNG.
export function pngInfo(buf) {
  if (buf.length < 24 || !buf.subarray(0, 8).equals(PNG_SIGNATURE) || buf.toString("latin1", 12, 16) !== "IHDR") return null;
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  return w > 0 && h > 0 ? { w, h } : null;
}

// Decodes the image to 32x32 gray through ffmpeg; a spread of at most 2 levels means a blank plate.
export async function isUniformImage(ctx, path) {
  const r = ensureTool(await runTool(ctx, "ffmpeg", ["-v", "error", "-i", path, "-vf", "scale=32:32:flags=area,format=gray", "-frames:v", "1", "-f", "rawvideo", "-"]), "ffmpeg", "HARD-REAL-RASTER");
  if (r.status !== 0 || r.stdoutBuf.length < 1024) throw new KitError("HARD_NOT_RUN", "ffmpeg could not decode the image", { rule: "HARD-REAL-RASTER", detail: r.stderr.slice(-300) });
  let lo = 255;
  let hi = 0;
  for (const b of r.stdoutBuf.subarray(0, 1024)) { if (b < lo) lo = b; if (b > hi) hi = b; }
  return hi - lo <= 2;
}

const rate = (s) => {
  const [n, d] = String(s ?? "").split("/").map(Number);
  return d ? Math.round((n / d) * 1000) / 1000 : Number.isFinite(n) ? n : null;
};

export async function probeMedia(ctx, path, rule = "HARD-FPS-SIZE") {
  const r = ensureTool(await runTool(ctx, "ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", path]), "ffprobe", rule);
  if (r.status !== 0) throw new KitError("HARD_NOT_RUN", "ffprobe could not read the file", { rule, detail: r.stderr.slice(-300) });
  const doc = JSON.parse(r.stdout);
  const v = (doc.streams ?? []).find((s) => s.codec_type === "video");
  const a = (doc.streams ?? []).find((s) => s.codec_type === "audio");
  return {
    w: v?.width ?? null, h: v?.height ?? null, fps: v ? rate(v.r_frame_rate) : null, video_codec: v?.codec_name ?? null,
    duration_s: doc.format?.duration === undefined ? null : Math.round(Number(doc.format.duration) * 1000) / 1000,
    audio: a ? { codec: a.codec_name, channels: a.channels, sample_rate: Number(a.sample_rate) } : null,
  };
}

// Integrated loudness and true peak through the ebur128 filter. Silence yields lufs -70 and a null peak.
export async function measureLoudness(ctx, path) {
  const r = ensureTool(await runTool(ctx, "ffmpeg", ["-nostats", "-hide_banner", "-i", path, "-vn", "-af", "ebur128=peak=true", "-f", "null", "-"]), "ffmpeg", "HARD-LOUDNESS");
  const at = r.stderr.lastIndexOf("Summary:");
  if (r.status !== 0 || at < 0) throw new KitError("HARD_NOT_RUN", "ebur128 produced no summary", { rule: "HARD-LOUDNESS", detail: r.stderr.slice(-300) });
  const tail = r.stderr.slice(at);
  const num = (re) => {
    const m = tail.match(re);
    if (!m || /inf/.test(m[1])) return null;
    return Number(m[1]);
  };
  return { lufs: num(/\bI:\s+(-?inf|-?\d+(?:\.\d+)?) LUFS/), true_peak: num(/Peak:\s+(-?inf|-?\d+(?:\.\d+)?) dBFS/) };
}

// RIFF/WAVE header: PCM format and data length, enough to check "24 kHz mono 16-bit" and read the duration.
export function wavInfo(buf) {
  if (buf.length < 44 || buf.toString("latin1", 0, 4) !== "RIFF" || buf.toString("latin1", 8, 12) !== "WAVE") return null;
  let at = 12;
  let fmt = null;
  while (at + 8 <= buf.length) {
    const id = buf.toString("latin1", at, at + 4);
    const size = buf.readUInt32LE(at + 4);
    if (id === "fmt ") fmt = { format: buf.readUInt16LE(at + 8), channels: buf.readUInt16LE(at + 10), sample_rate: buf.readUInt32LE(at + 12), bits: buf.readUInt16LE(at + 22) };
    if (id === "data") {
      if (!fmt) return null;
      const frames = Math.min(size, buf.length - at - 8) / (fmt.channels * (fmt.bits / 8));
      return { ...fmt, duration_s: Math.round((frames / fmt.sample_rate) * 1000) / 1000 };
    }
    at += 8 + size + (size % 2);
  }
  return null;
}
