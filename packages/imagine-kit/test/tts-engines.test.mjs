import { test } from "node:test";
import assert from "node:assert/strict";
import { ELEVENLABS_DEFAULT_MODEL, ELEVENLABS_SDK, resolveVoice } from "../src/tts/voices.mjs";
import { expectedTtsParamsHash, ttsParamsHash } from "../src/tts/provenance.mjs";
import { loadValidator } from "../src/schemas.mjs";
import { KitError } from "../src/errors.mjs";

test("Pocket regression pin: builtin voice hash is byte-identical to original code", () => {
  const voice = resolveVoice("/tmp", { engine: "pocket-tts", model: "english", source: "builtin:george", seed_base: 1300 }, { language: "en", item: "L01" });
  const hash = ttsParamsHash(voice, 1301, "Hello there.");
  assert.equal(hash, "36a5c4c04b9ab6c5aa701952d51bfc942c8836e654f87525e540aa441f0a7c9e");
});

test("elevenlabs constants exported", () => {
  assert.equal(ELEVENLABS_DEFAULT_MODEL, "eleven_v4");
  assert.equal(ELEVENLABS_SDK, "elevenlabs==2.73.0");
});

test("elevenlabs: defaults (model eleven_v4, language from project id)", () => {
  const voice = resolveVoice("/tmp", { engine: "elevenlabs", voice_id: "JBFqnCBsd6RMkjVDRZzb" }, { language: "id", item: "L01" });
  assert.deepEqual(voice, {
    engine: "elevenlabs",
    model: "eleven_v4",
    voice_id: "JBFqnCBsd6RMkjVDRZzb",
    language_code: "id",
    source: "elevenlabs:JBFqnCBsd6RMkjVDRZzb",
    sourceHash: "elevenlabs:JBFqnCBsd6RMkjVDRZzb",
    seed_base: 1300,
  });

  const noLang = resolveVoice("/tmp", { engine: "elevenlabs", voice_id: "JBFqnCBsd6RMkjVDRZzb" }, { language: "en-US", item: "L01" });
  assert.equal("language_code" in noLang, false);
});

test("elevenlabs: explicit fields", () => {
  const cfg = {
    engine: "elevenlabs",
    voice_id: "JBFqnCBsd6RMkjVDRZzb",
    voice_name: "Serena",
    model_id: "eleven_turbo_v2_5",
    language_code: "en",
    voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0, speed: 1, use_speaker_boost: true },
    seed_base: 1400,
  };
  const voice = resolveVoice("/tmp", cfg, { language: "id", item: "L01" });
  assert.deepEqual(voice, {
    engine: "elevenlabs",
    model: "eleven_turbo_v2_5",
    voice_id: "JBFqnCBsd6RMkjVDRZzb",
    voice_name: "Serena",
    language_code: "en",
    voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0, speed: 1, use_speaker_boost: true },
    source: "elevenlabs:JBFqnCBsd6RMkjVDRZzb",
    sourceHash: "elevenlabs:JBFqnCBsd6RMkjVDRZzb",
    seed_base: 1400,
  });
});

test("elevenlabs: eleven_multilingual_v2 drops language_code even if set", () => {
  const voice = resolveVoice("/tmp", {
    engine: "elevenlabs",
    voice_id: "JBFqnCBsd6RMkjVDRZzb",
    model_id: "eleven_multilingual_v2",
    language_code: "id",
  }, { language: "id", item: "L01" });
  assert.equal("language_code" in voice, false);
  assert.equal(voice.model, "eleven_multilingual_v2");

  const voiceVariant = resolveVoice("/tmp", {
    engine: "elevenlabs",
    voice_id: "JBFqnCBsd6RMkjVDRZzb",
    model_id: "eleven_multilingual_v2_experimental",
  }, { language: "id", item: "L01" });
  assert.equal("language_code" in voiceVariant, false);
});

test("elevenlabs: each invalid field rejected", () => {
  const assertHardError = (cfg, ctx, matchMsg) => {
    assert.throws(
      () => resolveVoice("/tmp", cfg, ctx ?? { language: "en", item: "L01" }),
      (err) => {
        assert.ok(err instanceof KitError);
        assert.equal(err.code, "HARD");
        assert.equal(err.rule, "HARD-HAS-VOICE-CLONING");
        assert.equal(err.item, "L01");
        assert.match(err.message, matchMsg);
        return true;
      }
    );
  };

  // Unknown engine
  assertHardError({ engine: "unknown" }, { item: "L01" }, /^voice engine "unknown" is not supported; use pocket-tts or elevenlabs$/);

  // voice_id invalid or missing
  assertHardError({ engine: "elevenlabs" }, { item: "L01" }, /voice_id/);
  assertHardError({ engine: "elevenlabs", voice_id: "short" }, { item: "L01" }, /voice_id/);
  assertHardError({ engine: "elevenlabs", voice_id: "has-hyphen!" }, { item: "L01" }, /voice_id/);
  assertHardError({ engine: "elevenlabs", voice_id: "A".repeat(65) }, { item: "L01" }, /voice_id/);

  // model_id invalid
  assertHardError({ engine: "elevenlabs", voice_id: "JBFqnCBsd6RMkjVDRZzb", model_id: "Eleven-V4" }, { item: "L01" }, /model_id/);
  assertHardError({ engine: "elevenlabs", voice_id: "JBFqnCBsd6RMkjVDRZzb", model_id: "" }, { item: "L01" }, /model_id/);

  // language_code invalid
  assertHardError({ engine: "elevenlabs", voice_id: "JBFqnCBsd6RMkjVDRZzb", language_code: "eng" }, { item: "L01" }, /language_code/);
  assertHardError({ engine: "elevenlabs", voice_id: "JBFqnCBsd6RMkjVDRZzb", language_code: "ID" }, { item: "L01" }, /language_code/);
  assertHardError({ engine: "elevenlabs", voice_id: "JBFqnCBsd6RMkjVDRZzb", language_code: "" }, { item: "L01" }, /language_code/);

  // voice_name empty or non-string
  assertHardError({ engine: "elevenlabs", voice_id: "JBFqnCBsd6RMkjVDRZzb", voice_name: "" }, { item: "L01" }, /voice_name/);
  assertHardError({ engine: "elevenlabs", voice_id: "JBFqnCBsd6RMkjVDRZzb", voice_name: 123 }, { item: "L01" }, /voice_name/);

  // voice_settings invalid type, unknown key, or bad property values
  assertHardError({ engine: "elevenlabs", voice_id: "JBFqnCBsd6RMkjVDRZzb", voice_settings: "invalid" }, { item: "L01" }, /voice_settings/);
  assertHardError({ engine: "elevenlabs", voice_id: "JBFqnCBsd6RMkjVDRZzb", voice_settings: { unknown_key: 1 } }, { item: "L01" }, /voice_settings/);
  assertHardError({ engine: "elevenlabs", voice_id: "JBFqnCBsd6RMkjVDRZzb", voice_settings: { stability: "high" } }, { item: "L01" }, /voice_settings/);
  assertHardError({ engine: "elevenlabs", voice_id: "JBFqnCBsd6RMkjVDRZzb", voice_settings: { use_speaker_boost: 1 } }, { item: "L01" }, /voice_settings/);
  assertHardError({ engine: "elevenlabs", voice_id: "JBFqnCBsd6RMkjVDRZzb", voice_settings: { speed: NaN } }, { item: "L01" }, /voice_settings/);

  // seed_base invalid
  assertHardError({ engine: "elevenlabs", voice_id: "JBFqnCBsd6RMkjVDRZzb", seed_base: "1300" }, { item: "L01" }, /seed_base/);
  assertHardError({ engine: "elevenlabs", voice_id: "JBFqnCBsd6RMkjVDRZzb", seed_base: 1.5 }, { item: "L01" }, /seed_base/);
  assertHardError({ engine: "elevenlabs", voice_id: "JBFqnCBsd6RMkjVDRZzb", seed_base: -1 }, { item: "L01" }, /seed_base/);
  assertHardError({ engine: "elevenlabs", voice_id: "JBFqnCBsd6RMkjVDRZzb", seed_base: 4294966296 }, { item: "L01" }, /seed_base/);
});

test("elevenlabs: voice_settings key order does not affect ttsParamsHash", () => {
  const cfg1 = {
    engine: "elevenlabs",
    voice_id: "JBFqnCBsd6RMkjVDRZzb",
    voice_settings: { speed: 1, stability: 0.5, style: 0, similarity_boost: 0.75, use_speaker_boost: true },
  };
  const cfg2 = {
    engine: "elevenlabs",
    voice_id: "JBFqnCBsd6RMkjVDRZzb",
    voice_settings: { use_speaker_boost: true, similarity_boost: 0.75, style: 0, stability: 0.5, speed: 1 },
  };
  const voice1 = resolveVoice("/tmp", cfg1, { language: "en", item: "L01" });
  const voice2 = resolveVoice("/tmp", cfg2, { language: "en", item: "L01" });
  assert.deepEqual(Object.keys(voice1.voice_settings), ["similarity_boost", "speed", "stability", "style", "use_speaker_boost"]);
  assert.deepEqual(voice1.voice_settings, voice2.voice_settings);
  assert.equal(ttsParamsHash(voice1, 1301, "Hello world."), ttsParamsHash(voice2, 1301, "Hello world."));
});

test("elevenlabs: seed_base bounds [0, 4294966295] accepted", () => {
  const vMin = resolveVoice("/tmp", { engine: "elevenlabs", voice_id: "JBFqnCBsd6RMkjVDRZzb", seed_base: 0 }, { language: "en", item: "L01" });
  assert.equal(vMin.seed_base, 0);
  const vMax = resolveVoice("/tmp", { engine: "elevenlabs", voice_id: "JBFqnCBsd6RMkjVDRZzb", seed_base: 4294966295 }, { language: "en", item: "L01" });
  assert.equal(vMax.seed_base, 4294966295);
});

test("elevenlabs hash sensitivity and voice_name neutrality", () => {
  const base = resolveVoice("/tmp", {
    engine: "elevenlabs",
    voice_id: "JBFqnCBsd6RMkjVDRZzb",
    voice_name: "Serena",
    model_id: "eleven_v4",
    language_code: "id",
    voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0, speed: 1, use_speaker_boost: true },
    seed_base: 1300,
  }, { language: "id", item: "L01" });
  const baseHash = ttsParamsHash(base, 1301, "Hello world.");

  // Changing voice_name (or omitting it) does not change hash
  const diffName = { ...base, voice_name: "OtherName" };
  assert.equal(ttsParamsHash(diffName, 1301, "Hello world."), baseHash);
  const noName = { ...base };
  delete noName.voice_name;
  assert.equal(ttsParamsHash(noName, 1301, "Hello world."), baseHash);

  // Changing voice_id changes hash
  assert.notEqual(ttsParamsHash({ ...base, voice_id: "OtherVoiceId123" }, 1301, "Hello world."), baseHash);

  // Changing model changes hash
  assert.notEqual(ttsParamsHash({ ...base, model: "eleven_multilingual_v2" }, 1301, "Hello world."), baseHash);

  // Changing language_code changes hash
  assert.notEqual(ttsParamsHash({ ...base, language_code: "en" }, 1301, "Hello world."), baseHash);
  const noLang = { ...base };
  delete noLang.language_code;
  assert.notEqual(ttsParamsHash(noLang, 1301, "Hello world."), baseHash);

  // Changing voice_settings changes hash
  assert.notEqual(ttsParamsHash({ ...base, voice_settings: { ...base.voice_settings, stability: 0.8 } }, 1301, "Hello world."), baseHash);
  const noSettings = { ...base };
  delete noSettings.voice_settings;
  assert.notEqual(ttsParamsHash(noSettings, 1301, "Hello world."), baseHash);

  // Changing seed changes hash
  assert.notEqual(ttsParamsHash(base, 1302, "Hello world."), baseHash);

  // Changing text changes hash
  assert.notEqual(ttsParamsHash(base, 1301, "Different text."), baseHash);
});

test("expectedTtsParamsHash works for elevenlabs voice", () => {
  const ctx = {
    dir: "/tmp",
    project: { g0: { language: "id" } },
    bible: { narrator: { voice: { engine: "elevenlabs", voice_id: "JBFqnCBsd6RMkjVDRZzb" } } },
    units: { units: { L01: { speaker: "narrator", text: "Selamat pagi." } } },
  };
  const entry = { id: "L01", kind: "vo", line: "L01", v: 1 };
  const hash = expectedTtsParamsHash(ctx, entry);
  const voice = resolveVoice(ctx.dir, ctx.bible.narrator.voice, { language: "id", item: "L01" });
  assert.equal(hash, ttsParamsHash(voice, 1301, "Selamat pagi."));
});

test("manifest schema accepts elevenlabs and pocket-tts optional fields", () => {
  const v = loadValidator("manifest");
  const baseAsset = {
    id: "L01",
    kind: "vo",
    v: 1,
    path: "assets/vo/L01.v1.wav",
    sha256: "a".repeat(64),
    status: "pending",
  };

  const okEleven = {
    assets: [{
      ...baseAsset,
      engine: "elevenlabs",
      model_id: "eleven_v4",
      voice_id: "JBFqnCBsd6RMkjVDRZzb",
      language_code: "id",
      provider_tier: "standard",
    }],
  };
  assert.equal(v(okEleven).valid, true);

  const okPocket = {
    assets: [{
      ...baseAsset,
      engine: "pocket-tts",
      model_id: "english",
      voice_id: "george",
      language_code: "en",
      provider_tier: "local",
    }],
  };
  assert.equal(v(okPocket).valid, true);

  const badEngine = {
    assets: [{
      ...baseAsset,
      engine: "unsupported-engine",
    }],
  };
  assert.equal(v(badEngine).valid, false);
});
