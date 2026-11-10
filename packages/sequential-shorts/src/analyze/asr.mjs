import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ShortsError } from "../errors.mjs";
import { round6 } from "../run/fsx.mjs";
import { ensureTool, runTool, tail } from "../run/tools.mjs";

export const FASTER_WHISPER = "faster-whisper==1.2.1";
// faster-whisper 1.2.1 passes metadata_errors to av.open, removed in PyAV 19.
export const PYAV = "av==18.0.0";
export const ASR_PYTHON = "3.12";
export const TRANSCRIPT_SCHEMA = "sequential-shorts/transcript@1";
export const RELIABILITY = { min_word_coverage: 0.15, min_language_probability: 0.5, min_median_word_probability: 0.4 };
const WORKER = fileURLToPath(new URL("../../python/asr_worker.py", import.meta.url));

export async function extractAsrAudio(ctx, probe, workDir) {
  const out = join(workDir, "asr-16k.wav");
  const args = ["-v", "error", "-nostdin", "-y", "-i", probe.path, "-map", "0:a:0", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", out];
  const r = ensureTool(await runTool(ctx, "ffmpeg", args, { timeoutMs: 3600000 }), "ffmpeg", "asr");
  if (r.status !== 0) throw new ShortsError("HARD", "could not extract audio for ASR", { check: "asr", detail: tail(r.stderr) });
  return out;
}

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

export function classifyTranscript(words, { language_probability, duration_s }) {
  const R = RELIABILITY;
  const covered = words.reduce((s, w) => s + Math.max(0, w.end - w.start), 0);
  const word_coverage = duration_s > 0 ? covered / duration_s : 0;
  const med = median(words.map((w) => w.probability));
  const reasons = [];
  if (word_coverage < R.min_word_coverage) reasons.push(`word coverage ${(word_coverage * 100).toFixed(1)} percent is below 15 percent of the duration`);
  if (!(language_probability >= R.min_language_probability)) reasons.push(`language probability ${language_probability} is below ${R.min_language_probability}`);
  if (!(med >= R.min_median_word_probability)) reasons.push(`median word probability ${med} is below ${R.min_median_word_probability}`);
  return { status: reasons.length ? "unreliable" : "ok", reasons, stats: { word_coverage: round6(word_coverage), median_word_probability: med === null ? null : round6(med), word_count: words.length } };
}

export function failedTranscript({ reason, model, language, revision = null, source_sha256 = null }) {
  return { schema: TRANSCRIPT_SCHEMA, status: "failed", reasons: [reason], source_sha256, request: { model, language, revision }, language: null, language_probability: null,
    provenance: null, stats: { word_coverage: 0, median_word_probability: null, word_count: 0 }, segments: [], words: [] };
}

function normalizeReply(reply, { offset_s, duration_s }) {
  const at = (x) => round6(Math.min(duration_s, Math.max(0, Number(x) + offset_s)));
  const words = [];
  const segments = [];
  for (const s of reply.segments) {
    const first = words.length;
    for (const w of s.words ?? []) {
      const text = String(w.word ?? "").trim();
      if (!text) continue;
      words.push({ i: words.length, start: at(w.start), end: at(w.end), word: text, probability: round6(Number(w.probability)) });
    }
    const has = words.length > first;
    segments.push({ start: at(s.start), end: at(s.end), text: String(s.text ?? "").trim(), first_word: has ? first : null, last_word: has ? words.length - 1 : null });
  }
  return { words, segments };
}

export async function transcribe(ctx, { wav, model, language, revision = null, offset_s, duration_s, source_sha256 = null }) {
  const request = { audio: wav, model, language: language === "auto" ? null : language, revision };
  const args = ["run", "--python", ASR_PYTHON, "--with", FASTER_WHISPER, "--with", PYAV, "python", "-I", WORKER];
  const r = ensureTool(await runTool(ctx, "uv", args, { input: JSON.stringify(request), timeoutMs: 4 * 3600 * 1000 }), "uv", "asr");
  const last = r.stdout.trim().split("\n").filter(Boolean).at(-1) ?? "";
  let reply = null;
  try { reply = JSON.parse(last); } catch { reply = null; }
  if (r.status !== 0 || !reply || reply.ok !== true || !Array.isArray(reply.segments)) {
    const reason = reply?.error ?? (r.timedOut ? "ASR worker timed out" : `ASR worker failed: ${tail(r.stderr || last, 300)}`);
    return failedTranscript({ reason, model, language, revision, source_sha256 });
  }
  const { words, segments } = normalizeReply(reply, { offset_s, duration_s });
  const c = classifyTranscript(words, { language_probability: reply.language_probability, duration_s });
  return { schema: TRANSCRIPT_SCHEMA, status: c.status, reasons: c.reasons, source_sha256, request: { model, language, revision },
    language: reply.language, language_probability: reply.language_probability,
    provenance: { engine: "faster-whisper", faster_whisper: reply.faster_whisper, model: reply.model, device: "cpu", compute_type: "int8", word_timestamps: true, vad_filter: true, offset_s },
    stats: c.stats, segments, words };
}

export async function transcribeSource(ctx, probe, { workDir, model, language, revision = null }) {
  if (!probe.audio) return failedTranscript({ reason: "source has no audio stream", model, language, revision, source_sha256: probe.sha256 });
  const wav = await extractAsrAudio(ctx, probe, workDir);
  return transcribe(ctx, { wav, model, language, revision, offset_s: probe.audio.offset_s, duration_s: probe.duration_s, source_sha256: probe.sha256 });
}
