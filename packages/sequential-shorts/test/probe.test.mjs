import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { probe, timelineFromProbe } from "../src/probe.mjs";
import { makeTimeline, parseRational } from "../src/plan/timeline.mjs";
import { TOOLS, ff, hasFfmpeg, makeVideo, offsetAll, offsetAudio, rotate, tmp, countFrames } from "./helpers/media.mjs";

const skip = !hasFfmpeg && "NOT_RUN: ffmpeg/ffprobe not available";
const ctx = { tools: TOOLS };

test("parseRational", () => {
  assert.deepEqual(parseRational("30000/1001"), { num: 30000, den: 1001 });
  assert.equal(parseRational("0/0"), null);
});

test("CFR timeline snaps and maps samples consistently", () => {
  const tl = makeTimeline({ fps_mode: "cfr", fps_rational: "30/1", frame_count: 300, duration_s: 10, sample_rate: 48000 });
  for (const k of [0, 1, 29, 150, 299, 300]) {
    assert.equal(tl.snapFrame(tl.frameTime(k)), k);
    assert.equal(tl.sampleAt(tl.frameTime(k)), Math.round((k * 48000) / 30));
  }
  assert.equal(tl.snapFrame(1.016), 30);
  assert.equal(tl.snapFrame(-5), 0);
  assert.equal(tl.snapFrame(99), 300);
});

test("VFR timeline snaps to the nearest frame time", () => {
  const tl = makeTimeline({ fps_mode: "vfr", fps_rational: "25/1", frame_times: [0, 0.04, 0.1, 0.14], frame_count: 4, duration_s: 0.18, sample_rate: 48000 });
  assert.equal(tl.snapFrame(0.08), 2);
  assert.equal(tl.frameTime(4), 0.18);
  assert.equal(tl.snapFrame(0.17), 4);
});

test("probe CFR fixture", { skip }, async () => {
  const p = makeVideo(join(tmp("pr-"), "a.mp4"), { seconds: 3, tone: true });
  const r = await probe(ctx, p);
  assert.equal(r.video.fps_mode, "cfr");
  assert.equal(r.video.fps, 30);
  assert.equal(r.video.frame_count, countFrames(p));
  assert.equal(r.audio.sample_rate, 48000);
  assert.ok(r.audio.sample_count > 140000);
  assert.match(r.sha256, /^[0-9a-f]{64}$/);
  const tl = timelineFromProbe(r);
  assert.equal(tl.frame_count, 90);
});

test("probe VFR fixture", { skip }, async () => {
  const r = await probe(ctx, makeVideo(join(tmp("pr-"), "v.mp4"), { seconds: 3, vfr: true }));
  assert.equal(r.video.fps_mode, "vfr");
  assert.equal(r.audio, null);
});

test("probe rotation, audio offset and non-zero start", { skip }, async () => {
  const dir = tmp("pr-");
  const base = makeVideo(join(dir, "b.mp4"), { w: 320, h: 180, seconds: 2, tone: true });
  const rot = await probe(ctx, rotate(base, join(dir, "r.mp4"), 90));
  assert.equal(Math.abs(rot.video.rotation), 90);
  assert.equal(rot.video.display_width, 180);
  assert.equal(rot.video.display_height, 320);
  const off = await probe(ctx, offsetAudio(base, join(dir, "o.mp4"), 0.5));
  assert.ok(off.audio.offset_s > 0.4);
  const st = await probe(ctx, offsetAll(base, join(dir, "s.mp4"), 1.5));
  assert.ok(st.format_start_s > 1);
  assert.ok(st.frame_times[0] < 0.05);
});

test("probe rejects garbage, missing and audio-only input", { skip }, async () => {
  const dir = tmp("pr-");
  writeFileSync(join(dir, "bad.mp4"), "not a video");
  await assert.rejects(probe(ctx, join(dir, "bad.mp4")), (e) => e.code === "HARD");
  await assert.rejects(probe(ctx, join(dir, "missing.mp4")), (e) => e.code === "HARD" && /not found/.test(e.message));
  ff(["-f", "lavfi", "-i", "sine=d=1", "-c:a", "aac", join(dir, "a.m4a")]);
  await assert.rejects(probe(ctx, join(dir, "a.m4a")), (e) => e.code === "HARD" && /no video stream/.test(e.message));
});

test("probe without ffprobe is BLOCKED", async () => {
  const dir = tmp("pr-");
  writeFileSync(join(dir, "x.mp4"), "x");
  await assert.rejects(probe({ tools: { ffprobe: "/nonexistent/ffprobe" } }, join(dir, "x.mp4")), (e) => e.code === "BLOCKED");
});
