import { existsSync, realpathSync } from "node:fs";
import { join, sep } from "node:path";
import { bibleLookup } from "../docs.mjs";
import { KitError } from "../errors.mjs";
import { sha256File } from "../hash.mjs";

export const ID_MODEL_CONFIG = "hf://anak10thn/pocket-tts-indonesian/indonesian_6l.yaml@382fe85ca848546efb04bf1b7fdba78c6396e2ce";
export const DEFAULT_SEED_BASE = 1300;
export const ELEVENLABS_DEFAULT_MODEL = "eleven_v4";
export const ELEVENLABS_SDK = "elevenlabs==2.73.0";
const POCKET_ENGINE = "pocket-tts";
const ELEVENLABS_ENGINE = "elevenlabs";
const ELEVEN_SETTINGS = new Set(["stability", "similarity_boost", "style", "speed", "use_speaker_boost"]);

// The voice of a unit's speaker: `narrator.voice` for the narrator, `characters.<id>.voice` otherwise.
export function voiceConfig(bible, speaker) {
  const who = speaker ?? "narrator";
  const v = who === "narrator" ? bible?.narrator?.voice : bibleLookup(bible, `characters.${who}.voice`);
  return v && typeof v === "object" ? v : null;
}

const fail = (message, item) => new KitError("HARD", message, { rule: "HARD-HAS-VOICE-CLONING", item });

function resolvePocket(dir, cfg, { language, item }) {
  const model = cfg.model ?? (language === "id" ? "indonesian" : "english");
  if (!["english", "indonesian"].includes(model)) throw fail(`voice model "${model}" must be english or indonesian`, item);
  const m = String(cfg.source ?? "").match(/^(builtin|file):(.+)$/);
  if (!m) throw fail(`voice source "${cfg.source}" must be builtin:<name> or file:<path inside the project>`, item);
  let voice = m[2];
  let sourceHash = `builtin:${m[2]}`;
  if (m[1] === "file") {
    const p = join(dir, m[2]);
    if (!existsSync(p)) throw fail(`voice file ${m[2]} does not exist`, item);
    const real = realpathSync(p);
    if (!real.startsWith(realpathSync(dir) + sep)) throw fail(`voice file ${m[2]} is outside the project`, item);
    voice = real;
    sourceHash = `file:${sha256File(real)}`;
  } else if (model === "indonesian") {
    throw fail("the Indonesian model has no built-in voices; use file:<clip inside the project>", item);
  }
  return { engine: POCKET_ENGINE, model, source: cfg.source, voice, voice_is_file: m[1] === "file", sourceHash,
    seed_base: Number.isInteger(cfg.seed_base) ? cfg.seed_base : DEFAULT_SEED_BASE,
    ...(typeof cfg.temperature === "number" ? { temperature: cfg.temperature } : {}),
    ...(model === "indonesian" ? { config: ID_MODEL_CONFIG, eos_threshold: -6.0 } : {}) };
}

function resolveElevenLabs(cfg, { language, item }) {
  if (typeof cfg.voice_id !== "string" || !/^[A-Za-z0-9]{8,64}$/.test(cfg.voice_id)) {
    throw fail(`voice_id "${cfg.voice_id}" must match ^[A-Za-z0-9]{8,64}$`, item);
  }
  if (cfg.voice_name !== undefined && (typeof cfg.voice_name !== "string" || !cfg.voice_name)) {
    throw fail("voice_name must be a non-empty string", item);
  }
  if (cfg.model_id !== undefined && (typeof cfg.model_id !== "string" || !/^[a-z0-9_]+$/.test(cfg.model_id))) {
    throw fail(`model_id "${cfg.model_id}" must match ^[a-z0-9_]+$`, item);
  }
  const model = cfg.model_id ?? ELEVENLABS_DEFAULT_MODEL;
  if (cfg.language_code !== undefined && (typeof cfg.language_code !== "string" || !/^[a-z]{2}$/.test(cfg.language_code))) {
    throw fail(`language_code "${cfg.language_code}" must match ^[a-z]{2}$`, item);
  }
  let lang = cfg.language_code ?? (typeof language === "string" && /^[a-z]{2}$/.test(language) ? language : undefined);
  if (model.startsWith("eleven_multilingual_v2")) lang = undefined;
  let voice_settings;
  if (cfg.voice_settings !== undefined) {
    if (typeof cfg.voice_settings !== "object" || cfg.voice_settings === null || Array.isArray(cfg.voice_settings)) {
      throw fail("voice_settings must be an object", item);
    }
    for (const [k, v] of Object.entries(cfg.voice_settings)) {
      if (!ELEVEN_SETTINGS.has(k)) throw fail(`voice_settings unknown key "${k}"`, item);
      if (k === "use_speaker_boost") {
        if (typeof v !== "boolean") throw fail("voice_settings.use_speaker_boost must be boolean", item);
      } else if (typeof v !== "number" || !Number.isFinite(v)) {
        throw fail(`voice_settings.${k} must be a number`, item);
      }
    }
    voice_settings = {};
    for (const k of Object.keys(cfg.voice_settings).sort()) {
      voice_settings[k] = cfg.voice_settings[k];
    }
  }
  if (cfg.seed_base !== undefined && (!Number.isInteger(cfg.seed_base) || cfg.seed_base < 0 || cfg.seed_base > 4294966295)) {
    throw fail("seed_base must be an integer between 0 and 4294966295", item);
  }
  return {
    engine: ELEVENLABS_ENGINE,
    model,
    voice_id: cfg.voice_id,
    ...(cfg.voice_name ? { voice_name: cfg.voice_name } : {}),
    ...(lang ? { language_code: lang } : {}),
    ...(voice_settings ? { voice_settings } : {}),
    source: `elevenlabs:${cfg.voice_id}`,
    sourceHash: `elevenlabs:${cfg.voice_id}`,
    seed_base: cfg.seed_base ?? DEFAULT_SEED_BASE,
  };
}

// Turns a bible voice block into what the worker needs; the voice source is hashed so a changed clip changes params_hash.
export function resolveVoice(dir, cfg, { language, item }) {
  if (cfg.engine === POCKET_ENGINE) return resolvePocket(dir, cfg, { language, item });
  if (cfg.engine === ELEVENLABS_ENGINE) return resolveElevenLabs(cfg, { language, item });
  throw fail(`voice engine "${cfg.engine}" is not supported; use pocket-tts or elevenlabs`, item);
}

// bible `pronunciation: [{term, say}]` rewrites only what the model reads; captions keep the original text.
export function applyLexicon(text, bible) {
  let out = text;
  for (const e of Array.isArray(bible?.pronunciation) ? bible.pronunciation : []) {
    if (typeof e?.term === "string" && typeof e?.say === "string" && e.term) out = out.split(e.term).join(e.say);
  }
  return out;
}
