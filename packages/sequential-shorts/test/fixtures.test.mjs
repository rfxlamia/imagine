import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { FFPROBE, hasFfmpeg, makeVideo, rotate, offsetAudio, framePixel, countFrames, speechWav, tmp, streams, fakeUv, writeAsrReply } from "./helpers/media.mjs";

const skip = !hasFfmpeg && "NOT_RUN: ffmpeg/ffprobe not available";

test("16:9 fixture carries red left and green right edge blocks", { skip }, () => {
  const p = makeVideo(join(tmp("fx-"), "edges.mp4"), { w: 320, h: 180, seconds: 2, edges: true, tone: true });
  const [lr, lg] = framePixel(p, 1.0, 8, 90);
  const [rr, rg] = framePixel(p, 1.0, 312, 90);
  assert.ok(lr > 180 && lg < 80, `left edge should be red, got ${lr},${lg}`);
  assert.ok(rg > 180 && rr < 80, `right edge should be green, got ${rr},${rg}`);
});

test("vfr fixture has irregular frame intervals", { skip }, () => {
  const p = makeVideo(join(tmp("fx-"), "vfr.mp4"), { seconds: 3, vfr: true });
  const r = spawnSync(FFPROBE, ["-v", "error", "-select_streams", "v:0", "-show_entries", "packet=pts_time", "-of", "csv=p=0", p], { encoding: "utf8" });
  const pts = r.stdout.trim().split("\n").map(Number).sort((a, b) => a - b);
  const d = pts.slice(1).map((x, i) => x - pts[i]);
  assert.ok(Math.max(...d) / Math.min(...d) > 1.5);
});

test("rotation and audio offset fixtures", { skip }, () => {
  const dir = tmp("fx-");
  const base = makeVideo(join(dir, "base.mp4"), { seconds: 2, tone: true });
  const rot = rotate(base, join(dir, "rot.mp4"), 90);
  const s = streams(rot);
  assert.equal(s.video.side_data_list?.find((x) => x.rotation !== undefined)?.rotation, 90);
  const off = offsetAudio(base, join(dir, "off.mp4"), 0.5);
  assert.ok(Number(streams(off).audio.start_time) > 0.4);
});

test("29.97 fps fixture", { skip }, () => {
  const p = makeVideo(join(tmp("fx-"), "ntsc.mp4"), { seconds: 2, fps: "30000/1001", tone: true });
  assert.equal(streams(p).video.r_frame_rate, "30000/1001");
  assert.equal(countFrames(p), 60);
});

test("speechWav word timings follow the layout", () => {
  const dir = tmp("fx-");
  const { words, duration } = speechWav(join(dir, "s.wav"), { sentences: [3, 2], lead: 0.5, wordS: 0.3, wordGap: 0.1, sentenceGap: 0.6, tail: 1 });
  assert.equal(words.length, 5);
  assert.deepEqual(words.map((w) => w.word), ["w1", "w2", "w3.", "w4", "w5."]);
  assert.equal(words[0].start, 0.5);
  assert.equal(words[3].start, Math.round((0.5 + 0.3 * 3 + 0.1 * 2 + 0.6) * 1000) / 1000);
  assert.ok(Math.abs(duration - (words[4].end + 1)) < 1e-9);
  assert.equal(readFileSync(join(dir, "s.wav")).subarray(0, 4).toString("latin1"), "RIFF");
});

test("fake uv replays the reply file and honours modes", () => {
  const dir = tmp("fx-");
  const reply = writeAsrReply(dir, [{ start: 0.5, end: 0.8, word: "halo", probability: 0.9 }]);
  const ok = spawnSync(process.execPath, [fakeUv, "run"], { input: JSON.stringify({ audio: "x", model: "m", language: null }), env: { ...process.env, FAKE_UV_REPLY: reply }, encoding: "utf8" });
  assert.equal(JSON.parse(ok.stdout.trim()).ok, true);
  const fail = spawnSync(process.execPath, [fakeUv], { input: "{}", env: { ...process.env, FAKE_UV_MODE: "fail" }, encoding: "utf8" });
  assert.equal(fail.status, 1);
  assert.equal(JSON.parse(fail.stdout.trim()).ok, false);
  const garbage = spawnSync(process.execPath, [fakeUv], { input: "{}", env: { ...process.env, FAKE_UV_MODE: "garbage" }, encoding: "utf8" });
  assert.equal(garbage.stdout.trim(), "not json");
});
