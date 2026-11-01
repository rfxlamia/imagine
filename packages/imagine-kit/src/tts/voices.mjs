import { existsSync, realpathSync } from "node:fs";
import { join, sep } from "node:path";
import { bibleLookup } from "../docs.mjs";
import { KitError } from "../errors.mjs";
import { sha256File } from "../hash.mjs";

export const ID_MODEL_CONFIG = "hf://anak10thn/pocket-tts-indonesian/indonesian_6l.yaml@382fe85ca848546efb04bf1b7fdba78c6396e2ce";
export const DEFAULT_SEED_BASE = 1300;
const ENGINE = "pocket-tts";

// The voice of a unit's speaker: `narrator.voice` for the narrator, `characters.<id>.voice` otherwise.
export function voiceConfig(bible, speaker) {
  const who = speaker ?? "narrator";
  const v = who === "narrator" ? bible?.narrator?.voice : bibleLookup(bible, `characters.${who}.voice`);
  return v && typeof v === "object" ? v : null;
}

const fail = (message, item) => new KitError("HARD", message, { rule: "HARD-HAS-VOICE-CLONING", item });

// Turns a bible voice block into what the worker needs; the voice source is hashed so a changed clip changes params_hash.
export function resolveVoice(dir, cfg, { language, item }) {
  if (cfg.engine !== ENGINE) throw fail(`voice engine "${cfg.engine}" is not supported; use ${ENGINE}`, item);
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
  return { engine: ENGINE, model, source: cfg.source, voice, voice_is_file: m[1] === "file", sourceHash,
    seed_base: Number.isInteger(cfg.seed_base) ? cfg.seed_base : DEFAULT_SEED_BASE,
    ...(typeof cfg.temperature === "number" ? { temperature: cfg.temperature } : {}),
    ...(model === "indonesian" ? { config: ID_MODEL_CONFIG, eos_threshold: -6.0 } : {}) };
}

// bible `pronunciation: [{term, say}]` rewrites only what the model reads; captions keep the original text.
export function applyLexicon(text, bible) {
  let out = text;
  for (const e of Array.isArray(bible?.pronunciation) ? bible.pronunciation : []) {
    if (typeof e?.term === "string" && typeof e?.say === "string" && e.term) out = out.split(e.term).join(e.say);
  }
  return out;
}
