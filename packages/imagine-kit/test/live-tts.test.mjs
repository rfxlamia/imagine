import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { wavInfo } from "../src/media.mjs";
import { cliWith, getManifest } from "./helpers/fixture.mjs";
import { ttsProject } from "./helpers/tts.mjs";

// One real Pocket TTS run through uv. Skipped unless IMAGINE_LIVE=1 (it downloads the model on first use).
const live = process.env.IMAGINE_LIVE === "1" ? test : test.skip;

live("live: tts produces a real 24 kHz mono 16-bit take and the same seed reproduces it", async () => {
  const p = await ttsProject();
  const first = await cliWith(p.cwd, { env: process.env }, "tts", "L01");
  assert.equal(first.exit, 0, JSON.stringify(first.env.errors));
  const entry = getManifest(p.dir).assets[0];
  const info = wavInfo(readFileSync(join(p.dir, entry.path)));
  assert.deepEqual([info.channels, info.bits, info.sample_rate], [1, 16, 24000]);
  assert.ok(info.duration_s > 1 && info.duration_s < 15, `duration ${info.duration_s}`);
  const scratchA = await cliWith(p.cwd, { env: process.env }, "tts", "L01", "--scratch");
  const scratchB = await cliWith(p.cwd, { env: process.env }, "tts", "L01", "--scratch");
  assert.equal(scratchA.env.data.takes[0].sha256, scratchB.env.data.takes[0].sha256, "same seed, same PCM");
});
