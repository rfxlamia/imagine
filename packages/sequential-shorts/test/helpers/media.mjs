import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const FFMPEG = process.env.SEQ_SHORTS_FFMPEG ?? "ffmpeg";
export const FFPROBE = process.env.SEQ_SHORTS_FFPROBE ?? "ffprobe";
export const TOOLS = { ffmpeg: [FFMPEG], ffprobe: [FFPROBE] };
export const hasFfmpeg = spawnSync(FFMPEG, ["-version"]).status === 0 && spawnSync(FFPROBE, ["-version"]).status === 0;
export const hasDrawtext = hasFfmpeg && spawnSync(FFMPEG, ["-v", "error", "-f", "lavfi", "-i", "color=s=64x64:d=0.1", "-vf", "drawtext=font=Sans:text=x", "-f", "null", "-"]).status === 0;
export const fakeUv = fileURLToPath(new URL("../fakes/uv.mjs", import.meta.url));
export const tmp = (prefix) => mkdtempSync(join(tmpdir(), `ss-${prefix}`));

export function ff(args) {
  const r = spawnSync(FFMPEG, ["-v", "error", "-y", ...args], { encoding: "utf8", maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr}`);
  return r;
}

export function ffprobeJson(path, args) {
  const r = spawnSync(FFPROBE, ["-v", "error", ...args, "-of", "json", path], { encoding: "utf8", maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`ffprobe failed: ${r.stderr}`);
  return JSON.parse(r.stdout);
}

export function streams(path) {
  const j = ffprobeJson(path, ["-show_streams", "-show_format"]);
  return { video: j.streams.find((s) => s.codec_type === "video"), audio: j.streams.find((s) => s.codec_type === "audio"), format: j.format };
}

export function countFrames(path) {
  const j = ffprobeJson(path, ["-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames"]);
  return Number(j.streams[0].nb_read_frames);
}

export function countSamples(path) {
  const j = ffprobeJson(path, ["-select_streams", "a:0", "-show_entries", "frame=nb_samples"]);
  return j.frames.reduce((s, f) => s + Number(f.nb_samples), 0);
}

export function encodeWav(samples, sampleRate) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) data.writeInt16LE(samples[i], i * 2);
  const head = Buffer.alloc(44);
  head.write("RIFF", 0, "latin1");
  head.writeUInt32LE(36 + data.length, 4);
  head.write("WAVEfmt ", 8, "latin1");
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(sampleRate, 24);
  head.writeUInt32LE(sampleRate * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write("data", 36, "latin1");
  head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

const r3 = (x) => Math.round(x * 1000) / 1000;

// "Speech" as tone bursts: one burst per word, silence between words and longer silence between sentences.
// sentences: array of word counts. sentenceGap may be a number or an array (gap after sentence i).
export function speechWav(path, { sentences, sampleRate = 48000, lead = 0.5, wordS = 0.3, wordGap = 0.08, sentenceGap = 0.6, tail = 1.0, freq = 300 }) {
  const words = [];
  let t = lead;
  let n = 0;
  sentences.forEach((count, si) => {
    for (let k = 0; k < count; k++) {
      n += 1;
      const last = k === count - 1;
      words.push({ start: r3(t), end: r3(t + wordS), word: `w${n}${last ? "." : ""}`, probability: 0.9 });
      t = r3(t + wordS + (last ? (Array.isArray(sentenceGap) ? sentenceGap[si] ?? 0.6 : sentenceGap) : wordGap));
    }
  });
  const duration = r3(words.at(-1).end + tail);
  const samples = new Int16Array(Math.round(duration * sampleRate));
  for (const w of words) {
    for (let i = Math.round(w.start * sampleRate); i < Math.round(w.end * sampleRate); i++) {
      samples[i] = Math.round(Math.sin((2 * Math.PI * freq * i) / sampleRate) * 12000);
    }
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, encodeWav(samples, sampleRate));
  return { words, duration };
}

// Solid color segments (a scene cut at each boundary), optional edge blocks, VFR, tone or WAV audio.
export function makeVideo(path, { w = 320, h = 180, fps = "30", seconds = 3, segments = null, edges = false, vfr = false, tone = false, wav = null, silentAudio = false }) {
  mkdirSync(dirname(path), { recursive: true });
  const segs = segments ?? [{ color: "0x204060", seconds }];
  const total = segs.reduce((s, x) => s + x.seconds, 0);
  const args = [];
  segs.forEach((s) => args.push("-f", "lavfi", "-i", `color=c=${s.color}:s=${w}x${h}:r=${fps}:d=${s.seconds}`));
  const chain = [`${segs.map((_, i) => `[${i}:v]`).join("")}concat=n=${segs.length}:v=1:a=0`];
  if (edges) chain.push("drawbox=x=0:y=ih*0.3:w=iw*0.08:h=ih*0.4:color=0xFF0000:t=fill", "drawbox=x=iw*0.92:y=ih*0.3:w=iw*0.08:h=ih*0.4:color=0x00FF00:t=fill");
  if (vfr) chain.push("setpts='(N+floor(N/3)*0.5)/30/TB'");
  const audioIndex = segs.length;
  if (wav) args.push("-i", wav);
  else if (tone) args.push("-f", "lavfi", "-i", `sine=frequency=440:sample_rate=48000:duration=${total}`);
  else if (silentAudio) args.push("-f", "lavfi", "-i", `anullsrc=r=48000:cl=stereo:d=${total}`);
  const hasAudio = Boolean(wav || tone || silentAudio);
  args.push("-filter_complex", `${chain.join(",")}[v]`, "-map", "[v]");
  if (hasAudio) args.push("-map", `${audioIndex}:a`, "-c:a", "aac", "-b:a", "128k");
  if (vfr) args.push("-fps_mode", "passthrough");
  args.push("-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-t", String(vfr ? total * 1.5 : total), path);
  ff(args);
  return path;
}

export function rotate(src, out, deg) { ff(["-display_rotation:v:0", String(deg), "-i", src, "-c", "copy", out]); return out; }
export function offsetAudio(src, out, s) { ff(["-i", src, "-itsoffset", String(s), "-i", src, "-map", "0:v", "-map", "1:a", "-c", "copy", out]); return out; }
export function offsetAll(src, out, s) { ff(["-i", src, "-c", "copy", "-output_ts_offset", String(s), out]); return out; }

export function framePixel(path, t, x, y) {
  const r = spawnSync(FFMPEG, ["-v", "error", "-ss", String(t), "-i", path, "-frames:v", "1", "-vf", `crop=1:1:${x}:${y}:exact=1`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 1 << 20 });
  if (r.status !== 0) throw new Error(`framePixel failed: ${r.stderr}`);
  return [...r.stdout.subarray(0, 3)];
}

export function asrReply(words, { language = "id", language_probability = 0.97, model = "large-v3-turbo" } = {}) {
  return {
    ok: true, language, language_probability, faster_whisper: "1.2.1",
    model: { name: model, repo: "mobiuslabsgmbh/faster-whisper-large-v3-turbo", revision: "fake-rev", cached: true },
    segments: [{ start: words[0]?.start ?? 0, end: words.at(-1)?.end ?? 0, text: words.map((w) => w.word).join(" "), words }],
  };
}

export function writeAsrReply(dir, words, opts) {
  const p = join(dir, "asr-reply.json");
  writeFileSync(p, JSON.stringify(asrReply(words, opts)));
  return p;
}
