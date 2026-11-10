import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkPart } from "../src/qa/qc.mjs";
import { TOOLS, hasFfmpeg, makeVideo, tmp } from "./helpers/media.mjs";
import { OFF_MARKER, planFromMedia, renderWith } from "./helpers/render.mjs";

const skip = !hasFfmpeg && "NOT_RUN: ffmpeg not available";
const ctx = { tools: TOOLS };
const stubPart = (extra = {}) => ({ index: 1, of: 1, start_s: 0, end_s: 2, duration_s: 2, boundary_out: { forced: false }, ...extra });
const stubPlan = (part, { max_s = 90, has_audio = true } = {}) => ({ settings: { max_s }, source: { fps: 30, has_audio }, parts: [part] });
const NO_SIGNALS = { silences: [], scene_cuts: [], motion: [], freezes: [], blacks: [] };

test("a correctly rendered part passes every check", { skip }, async () => {
  const dir = tmp("qc-");
  const media = makeVideo(join(dir, "src.mp4"), { w: 320, h: 180, seconds: 12, tone: true });
  const f = await planFromMedia(dir, media, { settings: { target_s: 5, max_s: 8 } });
  const p = f.plan.parts[0];
  const out = renderWith(f.plan, p, f.timeline, OFF_MARKER, join(dir, "p1.mp4"));
  const qc = await checkPart(ctx, { file: out, part: p, plan: f.plan, signals: f.signals });
  assert.equal(qc.status, "PASS", JSON.stringify(qc.checks));
  for (const c of Object.values(qc.checks)) assert.equal(c.status, "PASS");
  assert.equal(qc.counts.frames, p.end_frame - p.start_frame);
  assert.ok(qc.counts.samples > 0);
});

test("wrong geometry, missing audio and undecodable files fail", { skip }, async () => {
  const dir = tmp("qc-");
  const small = makeVideo(join(dir, "small.mp4"), { w: 720, h: 1280, seconds: 2, tone: true });
  const g = await checkPart(ctx, { file: small, part: stubPart(), plan: stubPlan(stubPart()), signals: NO_SIGNALS });
  assert.equal(g.checks.geometry.status, "FAIL");
  const mute = makeVideo(join(dir, "mute.mp4"), { w: 1080, h: 1920, seconds: 2 });
  const a = await checkPart(ctx, { file: mute, part: stubPart(), plan: stubPlan(stubPart()), signals: NO_SIGNALS });
  assert.equal(a.checks.audio.status, "FAIL");
  writeFileSync(join(dir, "bad.mp4"), "not an mp4");
  const d = await checkPart(ctx, { file: join(dir, "bad.mp4"), part: stubPart(), plan: stubPlan(stubPart()), signals: NO_SIGNALS });
  assert.equal(d.checks.decode.status, "FAIL");
  assert.equal(d.status, "FAIL");
});

test("duration over max fails unless the boundary was forced", { skip }, async () => {
  const dir = tmp("qc-");
  const file = makeVideo(join(dir, "long.mp4"), { w: 1080, h: 1920, seconds: 4, tone: true });
  const over = await checkPart(ctx, { file, part: stubPart(), plan: stubPlan(stubPart(), { max_s: 2 }), signals: NO_SIGNALS });
  assert.equal(over.checks.duration.status, "FAIL");
  const forcedPart = stubPart({ boundary_out: { forced: true } });
  const forced = await checkPart(ctx, { file, part: forcedPart, plan: stubPlan(forcedPart, { max_s: 2 }), signals: NO_SIGNALS });
  assert.equal(forced.checks.duration.status, "PASS");
  assert.match(forced.checks.duration.detail, /forced/);
});

test("black frames not present in the source fail; known ones pass", { skip }, async () => {
  const dir = tmp("qc-");
  const file = makeVideo(join(dir, "b.mp4"), { w: 1080, h: 1920, tone: true, segments: [{ color: "0x204060", seconds: 1 }, { color: "0x000000", seconds: 1 }] });
  const fresh = await checkPart(ctx, { file, part: stubPart(), plan: stubPlan(stubPart()), signals: NO_SIGNALS });
  assert.equal(fresh.checks.black_frozen.status, "FAIL");
  const known = await checkPart(ctx, { file, part: stubPart(), plan: stubPlan(stubPart()),
    signals: { ...NO_SIGNALS, blacks: [{ start: 1, end: 2 }], freezes: [{ start: 0, end: 2 }] } });
  assert.equal(known.checks.black_frozen.status, "PASS", JSON.stringify(known.checks.black_frozen));
});

test("missing signals and audio-free sources are NOT_RUN, not PASS", { skip }, async () => {
  const dir = tmp("qc-");
  const file = makeVideo(join(dir, "v.mp4"), { w: 1080, h: 1920, seconds: 2 });
  const qc = await checkPart(ctx, { file, part: stubPart(), plan: stubPlan(stubPart(), { has_audio: false }), signals: null });
  assert.equal(qc.checks.black_frozen.status, "NOT_RUN");
  assert.equal(qc.checks.audio.status, "NOT_RUN");
  assert.equal(qc.checks.av_sync.status, "NOT_RUN");
});
