import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCandidates } from "../src/plan/candidates.mjs";
import { partition } from "../src/plan/partition.mjs";
import { EMPTY_SIGNALS, cfrTimeline, sentenceWords, transcriptOf } from "./helpers/plan.mjs";

const plan = (tl, transcript, signals = EMPTY_SIGNALS, target_s = 60, max_s = 90) =>
  partition(buildCandidates({ timeline: tl, transcript, signals }), { timeline: tl, target_s, max_s });

test("an utterance crossing 60 s is cut at a sentence end, not at 60.000 s", () => {
  const tl = cfrTimeline(120);
  const s = [];
  for (let k = 0; k < 5; k++) s.push(sentenceWords(10 * k + 0.5, 10 * k + 9.4));
  s.push(sentenceWords(50.0, 66.0, { wordS: 0.4, gap: 0.05 }));
  s.push(sentenceWords(66.6, 75.4), sentenceWords(76.0, 85.4), sentenceWords(86.0, 95.4), sentenceWords(96.0, 105.4), sentenceWords(106.0, 119.0));
  const r = plan(tl, transcriptOf(s));
  const cuts = r.parts.slice(0, -1).map((p) => p.boundary);
  assert.ok(cuts.length >= 1);
  for (const c of cuts) {
    assert.match(c.kind, /^sentence_end/);
    assert.ok(!(c.t > 50 && c.t < 66), `cut at ${c.t} lies inside the long utterance`);
    assert.ok(Math.abs(c.t - 60) > 1);
  }
});

test("a short tail is redistributed instead of left as a 10 s part", () => {
  const tl = cfrTimeline(130);
  const s = Array.from({ length: 13 }, (_, k) => sentenceWords(10 * k + 0.5, 10 * k + 9.4));
  const r = plan(tl, transcriptOf(s));
  assert.equal(r.parts.length, 2);
  for (const p of r.parts) assert.ok(p.duration_s >= 30, `part of ${p.duration_s} s`);
});

test("a 95 s sentence with no usable gap gets a forced cut with a reason", () => {
  const tl = cfrTimeline(100);
  const r = plan(tl, transcriptOf([sentenceWords(2.0, 97.0, { wordS: 0.4, gap: 0.02 })]));
  const forced = r.parts.map((p) => p.boundary).filter((b) => b.forced_only);
  assert.ok(forced.length >= 1);
  assert.match(forced[0].forced_reason, /largest available gap/);
  for (const p of r.parts) assert.ok(p.duration_s <= 90 + 1e-9);
});

test("no-VO mode partitions on silence, scene cuts and grid", () => {
  const tl = cfrTimeline(120);
  const r = plan(tl, transcriptOf([], "failed"), { ...EMPTY_SIGNALS, silences: [{ start: 30, end: 31 }, { start: 70, end: 71 }], scene_cuts: [{ t: 50, score: 30 }] });
  for (const p of r.parts) assert.ok(p.duration_s <= 90);
  assert.equal(r.parts.at(-1).end_frame, tl.frame_count);
});

function rng(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("continuity invariants hold on 200 random inputs", () => {
  for (let seed = 1; seed <= 200; seed++) {
    const r = rng(seed);
    const tl = cfrTimeline(30 + r() * 570);
    const target_s = 20 + r() * 70;
    const max_s = Math.min(180, target_s * (1.2 + r() * 0.8));
    const cands = [];
    for (let f = 15; f < tl.frame_count; f += 15) {
      const forced = r() < 0.1;
      cands.push({ id: `c${f}`, t: tl.frameTime(f), frame: f, sample: tl.sampleAt(tl.frameTime(f)), kind: forced ? "grid" : "word_gap",
        cost: forced ? 1200 : r() * 6, forced_only: forced, forced_reason: forced ? "x" : null, evidence: [] });
    }
    const { parts } = partition(cands, { timeline: tl, target_s, max_s });
    assert.equal(parts[0].start_frame, 0, `seed ${seed}`);
    assert.equal(parts.at(-1).end_frame, tl.frame_count, `seed ${seed}`);
    parts.forEach((p, i) => {
      assert.ok(p.end_frame > p.start_frame, `seed ${seed}`);
      assert.ok(p.duration_s <= max_s + 1e-9, `seed ${seed}: ${p.duration_s} > ${max_s}`);
      if (i > 0) assert.equal(p.start_frame, parts[i - 1].end_frame, `seed ${seed}`);
    });
  }
});

test("no feasible partition is HARD", () => {
  assert.throws(() => partition([], { timeline: cfrTimeline(200), target_s: 60, max_s: 90 }), (e) => e.code === "HARD");
});
