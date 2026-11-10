import { round6 } from "../run/fsx.mjs";

// Lower is better. Forced-only costs dominate every valid cost, so the DP uses them only when nothing else fits.
export const COSTS = { sentence_end_base: 0.5, sentence_end_min: 0.1, sentence_end_short_gap: 2.0, clause: 3.0, within_sentence: 6.0,
  silence: 0.4, scene_only: 1.5, novo_silence: 0.3, novo_scene: 0.2, novo_grid: 3.0,
  scene_bonus_inside: 0.15, scene_bonus_near: 0.1, motion_penalty: 1.0, freeze_penalty: 2.0, forced_gap_base: 1000, forced_word: 1200 };
export const LIMITS = { sentence_gap_s: 0.25, min_gap_s: 0.04, scene_near_s: 0.3, motion_high: 8, freeze_readable_s: 1.5, grid_s: 0.5, novo_grid_s: 1.0 };

const TERMINAL = /[.?!…]["'”’)\]]*$/;
const CLAUSE = /[,;:]["'”’)\]]*$/;
const fmt = (x) => String(Math.round(x * 1000) / 1000);

// Index of the word whose open interior contains t, or -1. Words are sorted by start and do not overlap.
export function wordAt(words, t) {
  let lo = 0;
  let hi = words.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (words[mid].start < t) { found = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return found >= 0 && t > words[found].start + 1e-6 && t < words[found].end - 1e-6 ? found : -1;
}

const sentenceCost = (g) => Math.max(COSTS.sentence_end_min, COSTS.sentence_end_base - 0.4 * Math.min(1, (g - LIMITS.sentence_gap_s) / 0.75));

function voCandidates(words, signals, duration) {
  const raw = [];
  const sceneIn = (a, b) => signals.scene_cuts.filter((c) => c.t >= a && c.t <= b).sort((x, y) => y.score - x.score)[0] ?? null;
  for (let i = 0; i < words.length - 1; i++) {
    const a = words[i];
    const b = words[i + 1];
    const g = round6(b.start - a.end);
    const sc = g > 0 ? sceneIn(a.end, b.start) : null;
    // ASR word times drift by 100-300 ms; acoustic silence overlapping the gap is the better cut point.
    const sil = g > 0 && !sc ? signals.silences.find((s) => s.start < b.start && s.end > a.end) : null;
    const t = sc ? sc.t : sil ? (Math.max(a.end, sil.start) + Math.min(b.start, sil.end)) / 2 : (a.end + b.start) / 2;
    const evidence = [`after "${a.word}" (word ${a.i}), gap ${fmt(g)} s before "${b.word}"`];
    if (g < LIMITS.min_gap_s) {
      raw.push({ t, kinds: ["word_gap"], cost: COSTS.forced_gap_base + 100 * (1 - Math.max(0, g) / LIMITS.min_gap_s), gap_s: g, forced_only: true, evidence,
        forced_reason: `no word gap of at least ${LIMITS.min_gap_s} s fits the max window; cut at the largest available gap (${fmt(Math.max(0, g))} s) after "${a.word}"` });
      continue;
    }
    let kind;
    let cost;
    if (TERMINAL.test(a.word)) {
      if (g >= LIMITS.sentence_gap_s) { kind = "sentence_end"; cost = sentenceCost(g); } else { kind = "sentence_end_short_gap"; cost = COSTS.sentence_end_short_gap; }
    } else if (CLAUSE.test(a.word)) { kind = "clause_gap"; cost = COSTS.clause; } else { kind = "word_gap"; cost = COSTS.within_sentence; }
    const kinds = [kind];
    if (sc) { kinds.push("scene_cut"); cost -= COSTS.scene_bonus_inside; evidence.push(`scene cut at ${fmt(sc.t)} s (score ${sc.score}) inside the gap`); }
    if (sil) { kinds.push("silence"); evidence.push(`audio silence ${fmt(sil.start)}-${fmt(sil.end)} s confirms the gap`); }
    raw.push({ t, kinds, cost, gap_s: g, evidence });
  }
  for (const s of signals.silences) {
    const mid = (s.start + s.end) / 2;
    if (wordAt(words, mid) === -1) raw.push({ t: mid, kinds: ["silence"], cost: COSTS.silence, evidence: [`silence ${fmt(s.start)}-${fmt(s.end)} s`] });
  }
  for (const c of signals.scene_cuts) {
    if (wordAt(words, c.t) === -1) raw.push({ t: c.t, kinds: ["scene_cut"], cost: COSTS.scene_only, evidence: [`scene cut at ${fmt(c.t)} s (score ${c.score})`] });
  }
  for (let k = 1; k * LIMITS.grid_s < duration; k++) {
    const t = round6(k * LIMITS.grid_s);
    const wi = wordAt(words, t);
    if (wi !== -1) {
      raw.push({ t, kinds: ["grid"], cost: COSTS.forced_word, forced_only: true, evidence: [`grid point inside word "${words[wi].word}"`],
        forced_reason: `no word gap fits the max window; cut at a grid point inside word "${words[wi].word}"` });
    }
  }
  return raw;
}

function noVoCandidates(signals, duration) {
  const raw = [];
  for (const s of signals.silences) raw.push({ t: (s.start + s.end) / 2, kinds: ["silence"], cost: COSTS.novo_silence, evidence: [`silence ${fmt(s.start)}-${fmt(s.end)} s`] });
  for (const c of signals.scene_cuts) raw.push({ t: c.t, kinds: ["scene_cut"], cost: COSTS.novo_scene, evidence: [`scene cut at ${fmt(c.t)} s (score ${c.score})`] });
  for (let k = 1; k * LIMITS.novo_grid_s < duration; k++) raw.push({ t: round6(k * LIMITS.novo_grid_s), kinds: ["grid"], cost: COSTS.novo_grid, evidence: ["frame grid (no reliable speech)"] });
  return raw;
}

function applySignals(c, signals) {
  if (!c.kinds.includes("scene_cut") && !c.forced_only) {
    const near = signals.scene_cuts.find((s) => Math.abs(s.t - c.t) <= LIMITS.scene_near_s);
    if (near) { c.cost -= COSTS.scene_bonus_near; c.kinds.push("scene_cut_near"); c.evidence.push(`scene cut at ${fmt(near.t)} s within ${LIMITS.scene_near_s} s`); }
  }
  const mo = signals.motion.find((m) => c.t >= m.start && c.t < m.end);
  if (mo && mo.score >= LIMITS.motion_high) { c.cost += COSTS.motion_penalty; c.kinds.push("high_motion"); c.evidence.push(`motion score ${mo.score} in ${fmt(mo.start)}-${fmt(mo.end)} s`); }
  const fr = signals.freezes.find((f) => c.t > f.start + 0.05 && c.t <= f.end && c.t - f.start < LIMITS.freeze_readable_s);
  if (fr) { c.cost += COSTS.freeze_penalty; c.kinds.push("freeze_unread"); c.evidence.push(`still frame since ${fmt(fr.start)} s, visible less than ${LIMITS.freeze_readable_s} s`); }
}

export function buildCandidates({ timeline, transcript, signals }) {
  const duration = timeline.duration_s;
  const raw = transcript?.status === "ok" ? voCandidates(transcript.words, signals, duration) : noVoCandidates(signals, duration);
  for (const c of raw) applySignals(c, signals);
  const byFrame = new Map();
  for (const c of raw) {
    const frame = timeline.snapFrame(c.t);
    if (frame <= 0 || frame >= timeline.frame_count) continue;
    const prev = byFrame.get(frame);
    if (!prev) { byFrame.set(frame, { ...c, frame }); continue; }
    const takeNew = (prev.forced_only && !c.forced_only) || (Boolean(prev.forced_only) === Boolean(c.forced_only) && c.cost < prev.cost);
    const winner = takeNew ? { ...c, frame } : prev;
    const loser = takeNew ? prev : c;
    winner.kinds = [...new Set([...winner.kinds, ...loser.kinds.filter((k) => !(loser.forced_only && !winner.forced_only))])];
    winner.evidence = [...winner.evidence, ...(loser.forced_only && !winner.forced_only ? [] : loser.evidence)];
    byFrame.set(frame, winner);
  }
  return [...byFrame.values()].sort((a, b) => a.frame - b.frame).map((c, i) => {
    const t = timeline.frameTime(c.frame);
    return { id: `c${String(i + 1).padStart(4, "0")}`, t, frame: c.frame, sample: timeline.sampleAt(t), kind: c.kinds.join("+"),
      cost: Math.round(Math.max(0.01, c.cost) * 1e4) / 1e4, gap_s: c.gap_s ?? null, forced_only: Boolean(c.forced_only),
      forced_reason: c.forced_only ? c.forced_reason : null, evidence: c.evidence };
  });
}
