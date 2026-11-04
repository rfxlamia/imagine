import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const here = dirname(fileURLToPath(import.meta.url));
const LINES = [
  "Every night for forty years, Mara climbed the stairs and lit the lamp.",
  "Tonight the sea was quiet, and no ship was coming.",
  "She lit it anyway.",
];

test("keeper-3 narration carries the three runbook lines in kit format", () => {
  const text = readFileSync(join(here, "scripts", "keeper-3.md"), "utf8");
  assert.deepEqual(text.trim().split("\n"), LINES.map((l, i) => `L0${i + 1} [narrator]: ${l}`));
});

test("keeper-3 copy carries the same sentences as T units", () => {
  const text = readFileSync(join(here, "scripts", "keeper-3-copy.md"), "utf8");
  assert.deepEqual(text.trim().split("\n"), LINES.map((l, i) => `T0${i + 1}: ${l}`));
});

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;
const sfx = (out) => spawnSync("bash", [join(here, "make-sfx.sh"), out], { encoding: "utf8" });

test("make-sfx.sh is deterministic and writes a 48 kHz mono 16-bit 0.40 s WAV", { skip: !hasFfmpeg }, () => {
  const a = mkdtempSync(join(tmpdir(), "sfx-a-"));
  const b = mkdtempSync(join(tmpdir(), "sfx-b-"));
  assert.equal(sfx(a).status, 0);
  assert.equal(sfx(b).status, 0);
  assert.deepEqual(readFileSync(join(a, "lamp-on.wav")), readFileSync(join(b, "lamp-on.wav")));
  const p = spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=sample_rate,channels,bits_per_sample:format=duration",
    "-of", "json", join(a, "lamp-on.wav")], { encoding: "utf8" });
  const j = JSON.parse(p.stdout);
  assert.equal(j.streams[0].sample_rate, "48000");
  assert.equal(j.streams[0].channels, 1);
  assert.equal(j.streams[0].bits_per_sample, 16);
  assert.ok(Math.abs(Number(j.format.duration) - 0.4) <= 0.01);
});

test("make-sfx.sh writes the three licence fields the manifest requires", { skip: !hasFfmpeg }, () => {
  const d = mkdtempSync(join(tmpdir(), "sfx-l-"));
  assert.equal(sfx(d).status, 0);
  const lic = YAML.parse(readFileSync(join(d, "lamp-on.licence.yaml"), "utf8"));
  assert.equal(lic.license, "original");
  assert.match(lic.source, /make-sfx\.sh/);
  assert.ok(lic.credit.length > 0);
});
