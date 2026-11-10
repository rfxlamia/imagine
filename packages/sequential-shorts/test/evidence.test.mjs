import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { boundaryEvidence, excerpt } from "../src/qa/evidence.mjs";
import { coverage } from "../src/qa/qc.mjs";
import { renderParts } from "../src/render/render.mjs";
import { readJson, writeJsonAtomic } from "../src/run/fsx.mjs";
import { TOOLS, hasFfmpeg, makeVideo, speechWav, streams, tmp } from "./helpers/media.mjs";
import { planFromMedia } from "./helpers/render.mjs";

const skip = !hasFfmpeg && "NOT_RUN: ffmpeg not available";

async function rendered() {
  const root = tmp("ev-");
  const { words, duration } = speechWav(join(root, "src", "s.wav"), { sentences: [5, 5, 5, 5, 5, 5], sentenceGap: 0.8 });
  const media = makeVideo(join(root, "src", "src.mp4"), { w: 320, h: 180, seconds: duration, wav: join(root, "src", "s.wav") });
  const out = join(root, "out");
  const f = await planFromMedia(out, media, { words, settings: { target_s: 5, max_s: 8, background: "color:#000000" } });
  const r = await renderParts({ tools: TOOLS }, { plan: f.plan, planDir: out, timeline: f.timeline, caps: { drawtext: false }, signals: f.signals, preset: "ultrafast" });
  return { out, f, r };
}

test("excerpt marks the cut", () => {
  const words = [{ start: 0, end: 0.3, word: "a." }, { start: 1, end: 1.3, word: "b" }];
  assert.equal(excerpt(words, 0.6), "a. | b");
});

test("CFR coverage passes on real parts and fails on a frame deficit", { skip }, async () => {
  const { f, r } = await rendered();
  const cov = coverage({ plan: f.plan, results: r.results });
  assert.equal(cov.status, "PASS", JSON.stringify(cov));
  assert.equal(cov.frames.mode, "count");
  const short = r.results.map((x, i) => (i === 0 ? { ...x, qc: { ...x.qc, counts: { ...x.qc.counts, frames: x.qc.counts.frames - 5 } } } : x));
  assert.equal(coverage({ plan: f.plan, results: short }).frames.status, "FAIL");
});

test("VFR coverage is duration based", () => {
  const plan = { source: { fps_mode: "vfr", fps: 25, duration_s: 10, frame_count: 230, has_audio: false }, settings: { max_s: 90 },
    parts: [
      { index: 1, of: 2, start_s: 0, end_s: 5, start_frame: 0, end_frame: 115, start_sample: null, end_sample: null, duration_s: 5, boundary_out: { forced: false } },
      { index: 2, of: 2, start_s: 5, end_s: 10, start_frame: 115, end_frame: 230, start_sample: null, end_sample: null, duration_s: 5, boundary_out: { forced: false } },
    ] };
  const results = [{ qc: { counts: { frames: 125, video_duration_s: 5.0 } } }, { qc: { counts: { frames: 126, video_duration_s: 5.04 } } }];
  const cov = coverage({ plan, results });
  assert.equal(cov.frames.mode, "duration");
  assert.equal(cov.frames.status, "PASS");
  assert.deepEqual(cov.frames.frames_informational, { source: 230, parts: 251 });
  assert.equal(cov.samples.status, "NOT_RUN");
});

test("boundary evidence: contact sheets, clips, review.json", { skip }, async () => {
  const { out, f, r } = await rendered();
  const review = await boundaryEvidence({ tools: TOOLS }, { plan: f.plan, planDir: out, results: r.results, transcript: f.transcript });
  assert.equal(review.cuts.length, f.plan.parts.length - 1);
  const c = review.cuts[0];
  assert.equal(c.visual, "NOT_RUN");
  assert.equal(c.listening, "NOT_RUN");
  assert.match(c.excerpt, / \| /);
  const sheet = streams(join(out, c.contact_sheet)).video;
  assert.equal(sheet.height, 480);
  assert.equal(sheet.width, 8 * 270 + 7 * 8);
  assert.ok(Math.abs(Number(streams(join(out, c.audio_clip)).audio.duration) - 3) < 0.05);
  const saved = readJson(join(out, "qa", "review.json"));
  saved.cuts[0].visual = "PASS";
  saved.cuts[0].visual_note = "clean cut on a sentence end";
  writeJsonAtomic(join(out, "qa", "review.json"), saved);
  const again = await boundaryEvidence({ tools: TOOLS }, { plan: f.plan, planDir: out, results: r.results, transcript: f.transcript });
  assert.equal(again.cuts[0].visual, "PASS");
  assert.equal(again.cuts[0].visual_note, "clean cut on a sentence end");
});
