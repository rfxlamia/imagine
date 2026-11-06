import { sha256 } from "../hash.mjs";
import { applyLexicon, resolveVoice, voiceConfig } from "./voices.mjs";

export function ttsParamsHash(voice, seed, ttsText) {
  if (voice.engine === "elevenlabs") {
    return sha256(JSON.stringify({ engine: voice.engine, model: voice.model, voice_id: voice.voice_id,
      language_code: voice.language_code ?? null, voice_settings: voice.voice_settings ?? null,
      seed, tts_text: ttsText, elevenlabs: "2.73.0" }));
  }
  return sha256(JSON.stringify({ engine: voice.engine, model: voice.model, config: voice.config ?? null, source: voice.sourceHash,
    temperature: voice.temperature ?? null, eos_threshold: voice.eos_threshold ?? null, seed, tts_text: ttsText, pocket_tts: "4.0.1" }));
}

// Returns the parameters that the current project would use to generate this immutable take version.
export function expectedTtsParamsHash(ctx, entry) {
  if (!entry || entry.kind !== "vo" || typeof entry.line !== "string" || !Number.isInteger(entry.v)) return null;
  const unit = ctx.units.units[entry.line];
  if (!unit) return null;
  const config = voiceConfig(ctx.bible, unit.speaker);
  if (!config) return null;
  try {
    const voice = resolveVoice(ctx.dir, config, { language: ctx.project.g0.language, item: entry.line });
    return ttsParamsHash(voice, voice.seed_base + entry.v, applyLexicon(unit.text, ctx.bible));
  } catch {
    return null;
  }
}

