import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import YAML from "yaml";
import { sha256File } from "../src/hash.mjs";
import { wavInfo } from "../src/media.mjs";
import { approveThrough, cli, getManifest, getProject, put, setProject } from "./helpers/fixture.mjs";
import { ELEVEN_NARRATOR, FAKE_UV, NARRATOR, ttsProject } from "./helpers/tts.mjs";
import { creditsReport } from "../src/commands/qc.mjs";
import { createContext } from "../src/sources.mjs";

const DEFAULT_KEY = "sk_test_mock_eleven_key_123456789";

test("production elevenlabs takes: WAV path, manifest fields (creator, free, none), journal, CREDITS.md, redo, advice, characters, uv log", async () => {
  for (const tierCase of ["creator", "free", "none"]) {
    const p = await ttsProject({ narrator: ELEVEN_NARRATOR });
    const fakeTier = tierCase;
    const r = await p.run({ ELEVENLABS_API_KEY: DEFAULT_KEY, FAKE_ELEVEN_TIER: fakeTier }, "tts", "L01");
    assert.equal(r.exit, 0, JSON.stringify(r.env.errors));

    // WAV path
    const wavPath = join(p.dir, "assets/vo/L01.v1.wav");
    assert.ok(existsSync(wavPath));
    const info = wavInfo(readFileSync(wavPath));
    assert.deepEqual([info.channels, info.bits, info.sample_rate], [1, 16, 24000]);

    // Manifest entry fields
    const m = getManifest(p.dir).assets.find((a) => a.id === "L01");
    assert.ok(m);
    assert.equal(m.kind, "vo");
    assert.equal(m.v, 1);
    assert.equal(m.voice, "elevenlabs:21m00Tcm4TlvDq8ikWAM");
    assert.equal(m.engine, "elevenlabs");
    assert.equal(m.model_id, "eleven_v4");
    assert.equal(m.voice_id, "21m00Tcm4TlvDq8ikWAM");
    assert.equal(m.language_code, "en");
    const expectedTier = tierCase === "none" ? "unknown" : tierCase;
    assert.equal(m.provider_tier, expectedTier);
    assert.equal(m.source, "ElevenLabs voice 21m00Tcm4TlvDq8ikWAM, model eleven_v4");
    assert.equal(m.credit, "Voice: 21m00Tcm4TlvDq8ikWAM (ElevenLabs)");

    if (tierCase === "creator") {
      assert.equal(m.license, "ElevenLabs paid plan (creator): commercial use permitted under the ElevenLabs Terms of Service and Prohibited Use Policy, provided you hold the rights to the text. Content made on a paid plan keeps its commercial rights after a downgrade.");
      const adviceItem = r.env.advice.find((a) => a.rule === "PROC-HOSTED-TTS-LICENCE");
      assert.equal(adviceItem, undefined, "no licence advice on paid tier");
    } else if (tierCase === "free") {
      assert.equal(m.license, "ElevenLabs free plan: no commercial use; attribution to ElevenLabs is required when shared non-commercially.");
      const adviceItem = r.env.advice.find((a) => a.rule === "PROC-HOSTED-TTS-LICENCE");
      assert.ok(adviceItem);
      assert.equal(adviceItem.source, "assets/CREDITS.md");
      assert.equal(adviceItem.message, m.license);
    } else {
      // none -> unverified / unknown
      assert.equal(m.license, "ElevenLabs plan unverified (the subscription could not be read): commercial use requires a paid plan; free-plan audio is non-commercial and needs attribution.");
      const adviceItem = r.env.advice.find((a) => a.rule === "PROC-HOSTED-TTS-LICENCE");
      assert.ok(adviceItem);
      assert.equal(adviceItem.source, "assets/CREDITS.md");
      assert.equal(adviceItem.message, m.license);
    }

    // Journal line
    const journalText = readFileSync(join(p.dir, "journal.md"), "utf8");
    assert.ok(journalText.includes(`engine=elevenlabs voice=21m00Tcm4TlvDq8ikWAM model=eleven_v4 tier=${expectedTier}`));

    // CREDITS.md section + bullet
    const creditsPath = join(p.dir, "assets/CREDITS.md");
    assert.ok(existsSync(creditsPath));
    const creditsContent = readFileSync(creditsPath, "utf8");
    assert.ok(creditsContent.includes("## Voices (ElevenLabs)"));
    const expectedBullet = `- 21m00Tcm4TlvDq8ikWAM: ElevenLabs voice \`21m00Tcm4TlvDq8ikWAM\`, model \`eleven_v4\`, plan \`${expectedTier}\`. Licence: ${m.license}`;
    assert.ok(creditsContent.includes(expectedBullet));

    // No duplicate bullet on redo
    const redoRes = await p.run({ ELEVENLABS_API_KEY: DEFAULT_KEY, FAKE_ELEVEN_TIER: fakeTier }, "tts", "L01", "--redo", "L01", "--note", "redo take");
    assert.equal(redoRes.exit, 0);
    const creditsAfterRedo = readFileSync(creditsPath, "utf8");
    const count = creditsAfterRedo.split(expectedBullet).length - 1;
    assert.equal(count, 1, "bullet must appear exactly once in CREDITS.md");

    // data.characters
    const u1 = getProject(p.dir);
    assert.ok(r.env.data.characters > 0);

    // uv request: no key in json, eleven_key_present is true
    const calls = p.calls();
    assert.ok(calls.length >= 1);
    const firstCall = calls[0];
    assert.equal(firstCall.eleven_key_present, true);
    assert.equal(JSON.stringify(firstCall.request).includes(DEFAULT_KEY), false);
    assert.equal(JSON.stringify(firstCall.argv).includes(DEFAULT_KEY), false);
  }
});

test("resume: a second plain run regenerates nothing (params hash current)", async () => {
  const p = await ttsProject({ narrator: ELEVEN_NARRATOR });
  const r1 = await p.run({ ELEVENLABS_API_KEY: DEFAULT_KEY }, "tts", "L01");
  assert.equal(r1.exit, 0);
  assert.equal(p.calls().length, 1);
  const sha = r1.env.data.takes[0].sha256;

  const r2 = await p.run({ ELEVENLABS_API_KEY: DEFAULT_KEY }, "tts", "L01");
  assert.equal(r2.exit, 0);
  assert.equal(p.calls().length, 1, "no additional calls on resume");
  assert.equal(r2.env.data.takes[0].sha256, sha);
  assert.ok(r2.env.advice.some((a) => a.rule === "PROC-RESUME-IDEMPOTENT"));
});

test("missing key (no env, HOME pointing to an empty temp dir) -> exit 7, code NEEDS_USER, nothing written to assets/vo", async () => {
  const p = await ttsProject({ narrator: ELEVEN_NARRATOR });
  const emptyHome = mkdtempSync(join(tmpdir(), "imagine-empty-home-"));
  try {
    const r = await p.run({ HOME: emptyHome, ELEVENLABS_API_KEY: "" }, "tts", "L01");
    assert.equal(r.exit, 7);
    assert.equal(r.env.code, "NEEDS_USER");
    assert.equal(r.env.errors[0].rule, "HARD-SECRET-NEVER-WRITTEN");
    assert.equal(existsSync(join(p.dir, "assets/vo/L01.v1.wav")), false);
  } finally {
    rmSync(emptyHome, { recursive: true, force: true });
  }
});

test("mixed cast with a missing ElevenLabs key fails before the Pocket worker runs", async () => {
  const p = await ttsProject({
    edit: (text) => text.replace("L02 [narrator]: Tonight the sea was quiet, and no ship was coming.", "L02 [mara]: Tonight the sea was quiet, and no ship was coming."),
  });
  const bible = readFileSync(join(p.dir, "bible.yaml"), "utf8");
  put(p.dir, "bible.yaml", bible.replace(
    "    voice:\n      engine: pocket-tts\n      source: builtin:eve",
    "    voice:\n      engine: elevenlabs\n      voice_id: 21m00Tcm4TlvDq8ikWAM\n      model_id: eleven_v4"
  ));
  await approveThrough(p.cwd, "G2");

  const emptyHome = mkdtempSync(join(tmpdir(), "imagine-empty-home-"));
  try {
    const r = await p.run({ HOME: emptyHome, ELEVENLABS_API_KEY: "" }, "tts", "L01,L02");
    assert.equal(r.exit, 7);
    assert.equal(r.env.code, "NEEDS_USER");
    assert.equal(r.env.errors[0].rule, "HARD-SECRET-NEVER-WRITTEN");
    assert.equal(p.calls().length, 0, "Pocket TTS must not run before the ElevenLabs key is resolved");
    assert.equal(existsSync(join(p.dir, "assets/vo/L01.v1.wav")), false);
    assert.equal(existsSync(join(p.dir, "assets/vo/L02.v1.wav")), false);
  } finally {
    rmSync(emptyHome, { recursive: true, force: true });
  }
});

test("eleven-401 -> exit 3 BLOCKED, nothing committed", async () => {
  const p = await ttsProject({ narrator: ELEVEN_NARRATOR });
  const r = await p.run({ ELEVENLABS_API_KEY: DEFAULT_KEY, FAKE_UV_MODE: "eleven-401" }, "tts", "L01");
  assert.equal(r.exit, 3);
  assert.equal(r.env.code, "BLOCKED");
  assert.equal(existsSync(join(p.dir, "assets/vo/L01.v1.wav")), false);
  assert.equal(getManifest(p.dir).assets.filter((a) => a.id === "L01").length, 0);
});

test("SECRET LEAK test: key absent from stdout, stderr, and every file under project dir for all modes", async () => {
  const secretKey = "sk_test_LEAKCHECK_0123456789abcdef";

  function assertNoLeak(dir, secret, outputs = []) {
    for (const out of outputs) {
      if (typeof out === "string") {
        assert.equal(out.includes(secret), false, `Secret leaked in output string: ${out}`);
      } else if (out && typeof out === "object") {
        const json = JSON.stringify(out);
        assert.equal(json.includes(secret), false, `Secret leaked in json object: ${json}`);
      }
    }
    function walk(d) {
      for (const ent of readdirSync(d, { withFileTypes: true })) {
        const full = join(d, ent.name);
        if (ent.isDirectory()) {
          walk(full);
        } else if (ent.isFile()) {
          const buf = readFileSync(full);
          assert.equal(buf.includes(secret), false, `Secret leaked in file: ${full}`);
        }
      }
    }
    walk(dir);
  }

  // 1. Production run
  {
    const p = await ttsProject({ narrator: ELEVEN_NARRATOR });
    const r = await p.run({ ELEVENLABS_API_KEY: secretKey }, "tts", "L01");
    assert.equal(r.exit, 0);
    assertNoLeak(p.dir, secretKey, [r.stdout, r.env]);
  }

  // 2. Scratch run
  {
    const p = await ttsProject({ narrator: ELEVEN_NARRATOR });
    const r = await p.run({ ELEVENLABS_API_KEY: secretKey }, "tts", "L01", "--scratch");
    assert.equal(r.exit, 0);
    assertNoLeak(p.dir, secretKey, [r.stdout, r.env]);
  }

  // 3. Audition run
  {
    const p = await ttsProject({ narrator: ELEVEN_NARRATOR });
    const r = await p.run({ ELEVENLABS_API_KEY: secretKey }, "tts", "--audition", "--voices", "21m00Tcm4TlvDq8ikWAM", "--line", "L01");
    assert.equal(r.exit, 0);
    assertNoLeak(p.dir, secretKey, [r.stdout, r.env]);
  }

  // 4. eleven-401 failure
  {
    const p = await ttsProject({ narrator: ELEVEN_NARRATOR });
    const r = await p.run({ ELEVENLABS_API_KEY: secretKey, FAKE_UV_MODE: "eleven-401" }, "tts", "L01");
    assert.equal(r.exit, 3);
    assertNoLeak(p.dir, secretKey, [r.stdout, r.env]);
  }

  // 5. eleven-garbage failure
  {
    const p = await ttsProject({ narrator: ELEVEN_NARRATOR });
    const r = await p.run({ ELEVENLABS_API_KEY: secretKey, FAKE_UV_MODE: "eleven-garbage" }, "tts", "L01");
    assert.equal(r.exit, 3);
    assertNoLeak(p.dir, secretKey, [r.stdout, r.env]);
  }
});

test("duration report: total_duration_s, duration_range, missing_lines, and ADV-VO-DURATION-RANGE advice", async () => {
  const p = await ttsProject({ narrator: ELEVEN_NARRATOR });

  // Only L01 run: missing_lines has L02, L03
  const r1 = await p.run({ ELEVENLABS_API_KEY: DEFAULT_KEY }, "tts", "L01");
  assert.equal(r1.exit, 0);
  assert.deepEqual(r1.env.data.missing_lines, ["L02", "L03"]);
  assert.ok(typeof r1.env.data.total_duration_s === "number");
  assert.deepEqual(r1.env.data.duration_range, { min: 12, max: 15 });
  // total is less than 12, but missing_lines is not empty, so no ADV-VO-DURATION-RANGE advice
  assert.equal(r1.env.advice.some((a) => a.rule === "ADV-VO-DURATION-RANGE"), false);

  // Scratch run with L01: scratch totals
  const s1 = await p.run({ ELEVENLABS_API_KEY: DEFAULT_KEY }, "tts", "L01", "--scratch");
  assert.equal(s1.exit, 0);
  assert.deepEqual(s1.env.data.missing_lines, ["L02", "L03"]);
  assert.ok(typeof s1.env.data.total_duration_s === "number");
  assert.deepEqual(s1.env.data.duration_range, { min: 12, max: 15 });

  // Set G0 duration range to very low so total > max triggers advice
  setProject(p.dir, (proj) => {
    proj.g0.duration_s = { min: 1, max: 2 };
  });
  const rOver = await p.run({ ELEVENLABS_API_KEY: DEFAULT_KEY }, "tts", "L01", "--redo", "L01", "--note", "redo for dur");
  assert.equal(rOver.exit, 0);
  const advOver = rOver.env.advice.find((a) => a.rule === "ADV-VO-DURATION-RANGE");
  assert.ok(advOver);
  assert.match(advOver.message, /total VO .+s is outside the G0 range 1-2s/);

  // Set G0 duration range to very high and generate all lines so total < min with no missing lines triggers advice
  setProject(p.dir, (proj) => {
    proj.g0.duration_s = { min: 50, max: 60 };
  });
  const rAll = await p.run({ ELEVENLABS_API_KEY: DEFAULT_KEY }, "tts", "--all");
  assert.equal(rAll.exit, 0);
  assert.deepEqual(rAll.env.data.missing_lines, []);
  const advUnder = rAll.env.advice.find((a) => a.rule === "ADV-VO-DURATION-RANGE");
  assert.ok(advUnder);
  assert.match(advUnder.message, /total VO .+s is outside the G0 range 50-60s/);
});

test("audition with elevenlabs:<id> tokens and bare tokens on an elevenlabs cast", async () => {
  const p = await ttsProject({ narrator: ELEVEN_NARRATOR });

  // 1. Bare token on elevenlabs cast
  const rBare = await p.run({ ELEVENLABS_API_KEY: DEFAULT_KEY }, "tts", "--audition", "--voices", "21m00Tcm4TlvDq8ikWAM", "--line", "L01");
  assert.equal(rBare.exit, 0);
  assert.ok(existsSync(join(p.dir, "tmp/audition/narrator-21m00Tcm4TlvDq8ikWAM.wav")));
  assert.ok(rBare.env.data.characters > 0);

  // 2. elevenlabs:<id> explicit token
  const rExplicit = await p.run({ ELEVENLABS_API_KEY: DEFAULT_KEY }, "tts", "--audition", "--voices", "elevenlabs:EXPLICITVOICE123", "--line", "L01");
  assert.equal(rExplicit.exit, 0);
  assert.ok(existsSync(join(p.dir, "tmp/audition/narrator-EXPLICITVOICE123.wav")));
  assert.ok(rExplicit.env.data.characters > 0);

  // 3. Builtin token on elevenlabs cast falls back to pocket
  const rPocket = await p.run({ ELEVENLABS_API_KEY: DEFAULT_KEY }, "tts", "--audition", "--voices", "builtin:eve", "--line", "L01");
  assert.equal(rPocket.exit, 0);
  assert.ok(existsSync(join(p.dir, "tmp/audition/narrator-eve.wav")));
});

test("mixed cast: narrator Pocket + character ElevenLabs", async () => {
  const p = await ttsProject({
    edit: (text) => text.replace("L02 [narrator]: Tonight the sea was quiet, and no ship was coming.", "L02 [mara]: Tonight the sea was quiet, and no ship was coming."),
  });

  // Cast mara as ElevenLabs in bible.yaml
  const bible = readFileSync(join(p.dir, "bible.yaml"), "utf8");
  const updatedBible = bible.replace(
    "    voice:\n      engine: pocket-tts\n      source: builtin:eve",
    "    voice:\n      engine: elevenlabs\n      voice_id: 21m00Tcm4TlvDq8ikWAM\n      model_id: eleven_v4"
  );
  put(p.dir, "bible.yaml", updatedBible);
  // Re-approve G2
  await approveThrough(p.cwd, "G2");

  const r = await p.run({ ELEVENLABS_API_KEY: DEFAULT_KEY }, "tts", "L01,L02");
  assert.equal(r.exit, 0, JSON.stringify(r.env.errors));

  const mL01 = getManifest(p.dir).assets.find((a) => a.id === "L01");
  const mL02 = getManifest(p.dir).assets.find((a) => a.id === "L02");

  // L01 is pocket
  assert.equal(mL01.voice, "builtin:george");
  assert.equal(mL01.engine, undefined);
  assert.equal(mL01.license, undefined);

  // L02 is elevenlabs
  assert.equal(mL02.voice, "elevenlabs:21m00Tcm4TlvDq8ikWAM");
  assert.equal(mL02.engine, "elevenlabs");
  assert.equal(mL02.model_id, "eleven_v4");
  assert.ok(mL02.license);

  // Characters sent to ElevenLabs equals length of L02 text
  assert.equal(r.env.data.characters, mL02.tts_text.length);

  // Calls to fake uv: exactly 2 calls (Pocket then ElevenLabs)
  const calls = p.calls();
  assert.equal(calls.length, 2);
  assert.ok(calls[0].argv.some((a) => a.includes("pocket-tts")));
  assert.ok(calls[1].argv.some((a) => a.includes("elevenlabs==2.73.0")));
});

test("Pocket regression: an existing Pocket production run has no engine/license fields and data.characters === 0", async () => {
  const p = await ttsProject(); // default Pocket narrator
  const r = await p.run({}, "tts", "L01");
  assert.equal(r.exit, 0);

  const m = getManifest(p.dir).assets.find((a) => a.id === "L01");
  assert.equal(m.engine, undefined);
  assert.equal(m.license, undefined);
  assert.equal(m.model_id, undefined);
  assert.equal(m.voice_id, undefined);
  assert.equal(m.provider_tier, undefined);
  assert.equal(m.credit, undefined);

  assert.equal(r.env.data.characters, 0);
  assert.ok(typeof r.env.data.total_duration_s === "number");
  assert.deepEqual(r.env.data.duration_range, { min: 12, max: 15 });
  assert.deepEqual(r.env.data.missing_lines, ["L02", "L03"]);
});

test("qc credits report includes the elevenlabs vo entry", async () => {
  const p = await ttsProject({ narrator: ELEVEN_NARRATOR });
  const r = await p.run({ ELEVENLABS_API_KEY: DEFAULT_KEY }, "tts", "L01");
  assert.equal(r.exit, 0);

  const sctx = createContext(p.dir);
  const items = creditsReport(sctx);
  const voItem = items.find((i) => i.id === "L01");
  assert.ok(voItem);
  assert.equal(voItem.kind, "vo");
  assert.equal(voItem.v, 1);
  assert.ok(voItem.license);
  assert.equal(voItem.source, "ElevenLabs voice 21m00Tcm4TlvDq8ikWAM, model eleven_v4");
  assert.equal(voItem.credit, "Voice: 21m00Tcm4TlvDq8ikWAM (ElevenLabs)");
});

test("seed out of bounds for elevenlabs throws KitError HARD before running jobs", async () => {
  const outOfBoundsNarrator = "narrator:\n  voice:\n    engine: elevenlabs\n    voice_id: 21m00Tcm4TlvDq8ikWAM\n    model_id: eleven_v4\n    seed_base: 4294967295\n";
  const p = await ttsProject({ narrator: outOfBoundsNarrator });
  // In production, seed = seed_base + v = 4294967295 + 1 = 4294967296 > 4294967295
  const r = await p.run({ ELEVENLABS_API_KEY: DEFAULT_KEY }, "tts", "L01");
  assert.equal(r.exit, 1);
  assert.equal(r.env.errors[0].rule, "HARD-HAS-VOICE-CLONING");
  assert.equal(p.calls().length, 0, "no worker jobs ran");
});
