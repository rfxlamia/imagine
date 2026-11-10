import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCandidates, wordAt } from "../src/plan/candidates.mjs";
import { EMPTY_SIGNALS, cfrTimeline, transcriptOf } from "./helpers/plan.mjs";

const WORDS = [
  { start: 1.0, end: 1.3, word: "Halo", probability: 0.9 },
  { start: 1.4, end: 1.8, word: "dunia.", probability: 0.9 },
  { start: 2.4, end: 2.7, word: "Ini", probability: 0.9 },
  { start: 2.75, end: 3.0, word: "kita", probability: 0.9 },
  { start: 3.1, end: 3.4, word: "semua,", probability: 0.9 },
  { start: 3.5, end: 3.8, word: "ya", probability: 0.9 },
];
const tl = cfrTimeline(10);
const at = (cands, t) => cands.find((c) => Math.abs(c.t - t) < 0.02);

test("lexical cost ordering", () => {
  const c = buildCandidates({ timeline: tl, transcript: transcriptOf([WORDS]), signals: EMPTY_SIGNALS });
  const sentence = at(c, 2.1);
  const within = at(c, 1.35);
  const clause = at(c, 3.45);
  assert.equal(sentence.kind, "sentence_end");
  assert.equal(within.kind, "word_gap");
  assert.equal(clause.kind, "clause_gap");
  assert.ok(sentence.cost < clause.cost && clause.cost < within.cost);
  for (const x of c) {
    assert.equal(x.t, tl.frameTime(x.frame));
    assert.equal(x.sample, Math.round(x.t * 48000));
  }
  assert.deepEqual(c.map((x) => x.frame), [...c.map((x) => x.frame)].sort((a, b) => a - b));
});

test("longer sentence gaps cost less", () => {
  const long = WORDS.map((w, i) => (i >= 2 ? { ...w, start: w.start + 0.4, end: w.end + 0.4 } : w));
  const a = at(buildCandidates({ timeline: tl, transcript: transcriptOf([WORDS]), signals: EMPTY_SIGNALS }), 2.1);
  const b = at(buildCandidates({ timeline: tl, transcript: transcriptOf([long]), signals: EMPTY_SIGNALS }), 2.3);
  assert.ok(b.cost < a.cost);
});

test("scene cut inside a gap moves the candidate and lowers the cost", () => {
  const plain = at(buildCandidates({ timeline: tl, transcript: transcriptOf([WORDS]), signals: EMPTY_SIGNALS }), 2.1);
  const c = buildCandidates({ timeline: tl, transcript: transcriptOf([WORDS]), signals: { ...EMPTY_SIGNALS, scene_cuts: [{ t: 2.0, score: 40 }] } });
  const moved = c.find((x) => x.kind.startsWith("sentence_end"));
  assert.equal(moved.t, 2);
  assert.match(moved.kind, /scene_cut/);
  assert.ok(moved.cost < plain.cost);
});

test("acoustic silence pulls the cut into its overlap with the word gap", () => {
  const c = buildCandidates({ timeline: tl, transcript: transcriptOf([WORDS]), signals: { ...EMPTY_SIGNALS, silences: [{ start: 2.1, end: 2.8 }] } });
  const cut = c.find((x) => x.kind.startsWith("sentence_end"));
  assert.match(cut.kind, /silence/);
  assert.ok(Math.abs(cut.t - 2.25) < 0.02, `cut at ${cut.t}`);
  assert.ok(cut.evidence.some((e) => /confirms the gap/.test(e)));
});

test("scene cut near a candidate lowers the cost without moving it", () => {
  const c = buildCandidates({ timeline: tl, transcript: transcriptOf([WORDS]), signals: { ...EMPTY_SIGNALS, scene_cuts: [{ t: 3.2, score: 40 }] } });
  const clause = at(c, 3.45);
  assert.match(clause.kind, /scene_cut_near/);
});

test("tiny gaps and grid points inside words are forced-only", () => {
  const w = [
    { start: 1.0, end: 1.5, word: "a", probability: 0.9 },
    { start: 1.52, end: 4.0, word: "panjaaang", probability: 0.9 },
  ];
  const c = buildCandidates({ timeline: tl, transcript: transcriptOf([w]), signals: EMPTY_SIGNALS });
  const tiny = at(c, 1.51);
  assert.equal(tiny.forced_only, true);
  assert.ok(tiny.cost > 1000);
  assert.match(tiny.forced_reason, /largest available gap/);
  const grid = c.filter((x) => x.kind === "grid");
  assert.deepEqual(grid.map((x) => x.t), [2, 2.5, 3, 3.5]);
  assert.ok(grid.every((x) => x.forced_only && /inside word "panjaaang"/.test(x.forced_reason)));
  assert.equal(wordAt(transcriptOf([w]).words, 2.0), 1);
  assert.equal(wordAt(transcriptOf([w]).words, 1.51), -1);
});

test("no-VO mode uses silence, scene cuts and a 1 s grid", () => {
  const c = buildCandidates({ timeline: tl, transcript: transcriptOf([WORDS], "unreliable"),
    signals: { ...EMPTY_SIGNALS, silences: [{ start: 4, end: 5 }], scene_cuts: [{ t: 7.2, score: 30 }] } });
  assert.ok(at(c, 4.5).kind.includes("silence"));
  assert.ok(at(c, 7.2).kind.includes("scene_cut"));
  assert.ok(at(c, 1).kind.includes("grid"));
  assert.ok(c.every((x) => !x.forced_only));
});

test("motion and unread still-frame penalties", () => {
  const plain = at(buildCandidates({ timeline: tl, transcript: transcriptOf([WORDS]), signals: EMPTY_SIGNALS }), 2.1);
  const moving = at(buildCandidates({ timeline: tl, transcript: transcriptOf([WORDS]), signals: { ...EMPTY_SIGNALS, motion: [{ start: 2.0, end: 2.5, score: 20 }] } }), 2.1);
  assert.match(moving.kind, /high_motion/);
  assert.ok(Math.abs(moving.cost - plain.cost - 1) < 1e-6);
  const still = at(buildCandidates({ timeline: tl, transcript: transcriptOf([WORDS]), signals: { ...EMPTY_SIGNALS, freezes: [{ start: 1.5, end: 4 }] } }), 2.1);
  assert.match(still.kind, /freeze_unread/);
  const fresh = at(buildCandidates({ timeline: tl, transcript: transcriptOf([WORDS]), signals: { ...EMPTY_SIGNALS, freezes: [{ start: 2.1, end: 4 }] } }), 2.1);
  assert.doesNotMatch(fresh.kind, /freeze_unread/);
});
