import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { loadElevenLabsKey, redact } from "../src/tts/secrets.mjs";
import { runElevenLabsWorker, runTts } from "../src/tts/worker.mjs";
import { wavInfo } from "../src/media.mjs";
import { KitError } from "../src/errors.mjs";

const FAKE_UV = fileURLToPath(new URL("./fakes/uv.mjs", import.meta.url));
const WORKER_PY = fileURLToPath(new URL("../python/elevenlabs_worker.py", import.meta.url));

test("redact: replaces secret occurrences and handles edge cases safely", () => {
  const secret = "sk-test-secret-12345";
  assert.equal(redact(`Error with ${secret} key`, secret), "Error with [redacted] key");
  assert.equal(redact(`${secret} repeated ${secret}`, secret), "[redacted] repeated [redacted]");
  assert.equal(redact("no secret here", secret), "no secret here");
  assert.equal(redact("no secret here", ""), "no secret here");
  assert.equal(redact("no secret here", null), "no secret here");
  assert.equal(redact("no secret here", undefined), "no secret here");
  assert.equal(redact(null, secret), "");
  assert.equal(redact(undefined, secret), "");
  assert.equal(redact(12345, "34"), "12[redacted]5");
});

test("loadElevenLabsKey: key from env", () => {
  const ctx = { env: { ELEVENLABS_API_KEY: "  sk-env-key-12345  " } };
  const key = loadElevenLabsKey(ctx);
  assert.equal(key, "sk-env-key-12345");
});

test("loadElevenLabsKey: key from ~/.config/elevenlabs/key (mode 600) when env unset", () => {
  const tmpHome = mkdtempSync(join(tmpdir(), "imagine-home-"));
  try {
    const dir = join(tmpHome, ".config", "elevenlabs");
    mkdirSync(dir, { recursive: true });
    const keyPath = join(dir, "key");
    writeFileSync(keyPath, "  sk-file-key-99999 \n");
    chmodSync(keyPath, 0o600);

    const ctx = { env: { HOME: tmpHome } };
    const key = loadElevenLabsKey(ctx);
    assert.equal(key, "sk-file-key-99999");
  } finally {
    rmSync(tmpHome, { recursive: true, force: true });
  }
});

test("loadElevenLabsKey: missing key throws NEEDS_USER without leaking key", () => {
  const tmpHome = mkdtempSync(join(tmpdir(), "imagine-home-"));
  try {
    const ctx = { env: { HOME: tmpHome } };
    assert.throws(
      () => loadElevenLabsKey(ctx),
      (err) => {
        assert.ok(err instanceof KitError);
        assert.equal(err.code, "NEEDS_USER");
        assert.equal(err.rule, "HARD-SECRET-NEVER-WRITTEN");
        assert.match(err.message, /no ElevenLabs API key/);
        return true;
      }
    );
  } finally {
    rmSync(tmpHome, { recursive: true, force: true });
  }
});

test("loadElevenLabsKey: file mode 644 throws NEEDS_USER telling user to chmod 600", () => {
  const tmpHome = mkdtempSync(join(tmpdir(), "imagine-home-"));
  const secret = "sk-super-secret-key-to-not-leak";
  try {
    const dir = join(tmpHome, ".config", "elevenlabs");
    mkdirSync(dir, { recursive: true });
    const keyPath = join(dir, "key");
    writeFileSync(keyPath, secret);
    chmodSync(keyPath, 0o644);

    const ctx = { env: { HOME: tmpHome } };
    assert.throws(
      () => loadElevenLabsKey(ctx),
      (err) => {
        assert.ok(err instanceof KitError);
        assert.equal(err.code, "NEEDS_USER");
        assert.equal(err.rule, "HARD-SECRET-NEVER-WRITTEN");
        assert.match(err.message, /chmod 600 ~\/\.config\/elevenlabs\/key/);
        assert.equal(err.message.includes(secret), false);
        return true;
      }
    );
  } finally {
    rmSync(tmpHome, { recursive: true, force: true });
  }
});

test("loadElevenLabsKey: symlinked key file throws NEEDS_USER telling user to chmod 600", () => {
  const tmpHome = mkdtempSync(join(tmpdir(), "imagine-home-"));
  const secret = "sk-symlinked-secret-key";
  try {
    const dir = join(tmpHome, ".config", "elevenlabs");
    mkdirSync(dir, { recursive: true });
    const realTarget = join(tmpHome, "real_key");
    writeFileSync(realTarget, secret);
    chmodSync(realTarget, 0o600);

    const keyPath = join(dir, "key");
    symlinkSync(realTarget, keyPath);

    const ctx = { env: { HOME: tmpHome } };
    assert.throws(
      () => loadElevenLabsKey(ctx),
      (err) => {
        assert.ok(err instanceof KitError);
        assert.equal(err.code, "NEEDS_USER");
        assert.equal(err.rule, "HARD-SECRET-NEVER-WRITTEN");
        assert.match(err.message, /chmod 600 ~\/\.config\/elevenlabs\/key/);
        assert.equal(err.message.includes(secret), false);
        return true;
      }
    );
  } finally {
    rmSync(tmpHome, { recursive: true, force: true });
  }
});

test("loadElevenLabsKey: empty file after trim throws NEEDS_USER", () => {
  const tmpHome = mkdtempSync(join(tmpdir(), "imagine-home-"));
  try {
    const dir = join(tmpHome, ".config", "elevenlabs");
    mkdirSync(dir, { recursive: true });
    const keyPath = join(dir, "key");
    writeFileSync(keyPath, "   \n\t  \n");
    chmodSync(keyPath, 0o600);

    const ctx = { env: { HOME: tmpHome } };
    assert.throws(
      () => loadElevenLabsKey(ctx),
      (err) => {
        assert.ok(err instanceof KitError);
        assert.equal(err.code, "NEEDS_USER");
        assert.equal(err.rule, "HARD-SECRET-NEVER-WRITTEN");
        return true;
      }
    );
  } finally {
    rmSync(tmpHome, { recursive: true, force: true });
  }
});

test("Pocket-only runTts never asks for a key", async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), "imagine-tts-pocket-"));
  const log = join(tmpDir, "uv.jsonl");
  try {
    const ctx = {
      tools: { uv: [process.execPath, FAKE_UV] },
      env: { HOME: tmpDir, FAKE_UV_LOG: log }, // No ELEVENLABS_API_KEY, no ~/.config/elevenlabs/key
    };
    const out1 = join(tmpDir, "p1.wav");
    const jobs = [
      { engine: "pocket-tts", id: "P01", model: "english", voice: "george", voice_is_file: false, text: "Hello Pocket", seed: 10, out: out1 },
    ];
    const { results, tier } = await runTts(ctx, jobs);
    assert.equal(tier, null);
    assert.equal(results.length, 1);
    assert.equal(results[0].id, "P01");
    assert.ok(existsSync(out1));
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("runTts with mixed jobs: sequential, stripped engine, key isolation, correct order, 24kHz mono 16-bit WAVs", async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), "imagine-tts-mixed-"));
  const log = join(tmpDir, "uv.jsonl");
  const secretKey = "sk-eleven-mixed-secret-xyz";
  try {
    const ctx = {
      tools: { uv: [process.execPath, FAKE_UV] },
      env: {
        HOME: tmpDir,
        ELEVENLABS_API_KEY: secretKey,
        FAKE_UV_LOG: log,
        FAKE_ELEVEN_TIER: "starter",
      },
    };
    const pOut1 = join(tmpDir, "p1.wav");
    const eOut = join(tmpDir, "e1.wav");
    const pOut2 = join(tmpDir, "p2.wav");

    const jobs = [
      { engine: "pocket-tts", id: "P01", model: "english", voice: "george", voice_is_file: false, text: "First Pocket line", seed: 1, out: pOut1 },
      { engine: "elevenlabs", id: "E01", voice_id: "21m00Tcm4TlvDq8ikWAM", model_id: "eleven_v4", text: "ElevenLabs line", seed: 2, out: eOut },
      { engine: "pocket-tts", id: "P02", model: "english", voice: "george", voice_is_file: false, text: "Second Pocket line", seed: 3, out: pOut2 },
    ];

    const { results, tier } = await runTts(ctx, jobs);

    // Results in ORIGINAL job order
    assert.equal(results.length, 3);
    assert.equal(results[0].id, "P01");
    assert.equal(results[1].id, "E01");
    assert.equal(results[2].id, "P02");
    assert.equal(tier, "starter");

    // Verify WAVs are 24 kHz mono 16-bit
    for (const p of [pOut1, eOut, pOut2]) {
      const info = wavInfo(readFileSync(p));
      assert.ok(info !== null, `expected valid wav at ${p}`);
      assert.equal(info.channels, 1, "mono");
      assert.equal(info.sample_rate, 24000, "24 kHz");
      assert.equal(info.bits, 16, "16-bit");
      assert.ok(info.duration_s > 0);
    }

    // Inspect logged calls to fake uv
    const logged = readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
    assert.equal(logged.length, 2, "exactly two calls: Pocket then ElevenLabs");

    // Pocket call: argv contains pocket-tts, request has no engine key
    const pocketCall = logged[0];
    assert.ok(pocketCall.argv.some((a) => a.includes("pocket-tts")));
    for (const j of pocketCall.request.jobs) {
      assert.equal("engine" in j, false, "pocket job has no engine key");
    }

    // ElevenLabs call: argv contains elevenlabs==2.73.0, eleven_key_present is true
    const elevenCall = logged[1];
    assert.ok(elevenCall.argv.some((a) => a.includes("elevenlabs==2.73.0")));
    assert.equal(elevenCall.eleven_key_present, true);
    for (const j of elevenCall.request.jobs) {
      assert.equal("engine" in j, false, "elevenlabs job has no engine key");
    }

    // Key isolation: secretKey must not appear ANYWHERE in argv or request json of any call
    const logRaw = readFileSync(log, "utf8");
    assert.equal(logRaw.includes(secretKey), false, "secret key must never appear in uv logs");
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("eleven-401: BLOCKED error, secret redacted, HTTP status present, key never in message/detail", async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), "imagine-tts-401-"));
  const secretKey = "sk-super-secret-key-401";
  try {
    const ctx = {
      tools: { uv: [process.execPath, FAKE_UV] },
      env: {
        ELEVENLABS_API_KEY: secretKey,
        FAKE_UV_MODE: "eleven-401",
      },
    };
    const out = join(tmpDir, "out.wav");
    const jobs = [
      { engine: "elevenlabs", id: "E01", voice_id: "21m00Tcm4TlvDq8ikWAM", model_id: "eleven_v4", text: "Test line", seed: 10, out },
    ];

    await assert.rejects(
      async () => runTts(ctx, jobs),
      (err) => {
        assert.ok(err instanceof KitError);
        assert.equal(err.code, "BLOCKED");
        assert.equal(err.rule, "PROC-ONE-LINE-PER-WAV");
        assert.equal(err.item, "E01");
        // Key never present in message or detail
        assert.equal(err.message.includes(secretKey), false);
        if (err.detail) assert.equal(err.detail.includes(secretKey), false);
        // Message contains [redacted] and HTTP status 401
        assert.ok(err.message.includes("[redacted]"));
        assert.ok(err.message.includes("401"));
        return true;
      }
    );
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("eleven-garbage: BLOCKED error from non-JSON stderr, secret redacted, key never in message/detail", async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), "imagine-tts-garbage-"));
  const secretKey = "sk-super-secret-key-garbage";
  try {
    const ctx = {
      tools: { uv: [process.execPath, FAKE_UV] },
      env: {
        ELEVENLABS_API_KEY: secretKey,
        FAKE_UV_MODE: "eleven-garbage",
      },
    };
    const out = join(tmpDir, "out.wav");
    const jobs = [
      { engine: "elevenlabs", id: "E01", voice_id: "21m00Tcm4TlvDq8ikWAM", model_id: "eleven_v4", text: "Test line", seed: 10, out },
    ];

    await assert.rejects(
      async () => runTts(ctx, jobs),
      (err) => {
        assert.ok(err instanceof KitError);
        assert.equal(err.code, "BLOCKED");
        assert.equal(err.rule, "PROC-ONE-LINE-PER-WAV");
        // Key never present in message or detail
        assert.equal(err.message.includes(secretKey), false);
        if (err.detail) assert.equal(err.detail.includes(secretKey), false);
        // Message contains [redacted]
        assert.ok(err.message.includes("[redacted]"));
        return true;
      }
    );
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("eleven-split-key: stderr slice cutting across key does not leak tail in message or detail", async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), "imagine-tts-split-"));
  const secretKey = "sk_test_LEAKCHECK_0123456789abcdef";
  try {
    const ctx = {
      tools: { uv: [process.execPath, FAKE_UV] },
      env: {
        ELEVENLABS_API_KEY: secretKey,
        FAKE_UV_MODE: "eleven-split-key",
      },
    };
    const out = join(tmpDir, "out.wav");
    const jobs = [
      { engine: "elevenlabs", id: "E01", voice_id: "21m00Tcm4TlvDq8ikWAM", model_id: "eleven_v4", text: "Test line", seed: 10, out },
    ];

    await assert.rejects(
      async () => runTts(ctx, jobs),
      (err) => {
        assert.ok(err instanceof KitError);
        assert.equal(err.code, "BLOCKED");
        // Assert no 8+ char substring of the key appears in message or detail
        for (let len = 8; len <= secretKey.length; len++) {
          for (let i = 0; i <= secretKey.length - len; i++) {
            const sub = secretKey.slice(i, i + len);
            assert.equal(err.message.includes(sub), false, `message leaked substring of key: ${sub}`);
            if (err.detail) {
              assert.equal(err.detail.includes(sub), false, `detail leaked substring of key: ${sub}`);
            }
          }
        }
        return true;
      }
    );
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("python3 -m py_compile elevenlabs_worker.py succeeds", (t) => {
  const probe = spawnSync("python3", ["--version"], { stdio: "ignore" });
  if (probe.error) {
    t.skip("python3 is not available in environment");
    return;
  }
  const r = spawnSync("python3", ["-m", "py_compile", WORKER_PY]);
  assert.equal(r.status, 0, `py_compile failed with status ${r.status}: ${r.stderr?.toString()}`);
});
