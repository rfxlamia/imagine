// Machine-readable disposition of every Legacy_Gate (Requirement 1).
// Each gate maps to exactly one target: a Checkpoint (Q1/Q2/Q3) or the delivery state (Production_Complete).
// Retained check ids match CHECKPOINTS[...].checks[].id in the design (checkpoints.mjs).
export const GATE_CLASSES = Object.freeze(["essential", "ceremonial", "mixed"]);
export const CHECKPOINT_IDS = Object.freeze(["Q1", "Q2", "Q3"]);
export const DELIVERY = "delivery";

const gate = (target, cls, retainedChecks, removed, humanApproval) =>
  Object.freeze({ target, class: cls, retainedChecks: Object.freeze(retainedChecks), removed: Object.freeze(removed), humanApproval });

export const GATE_CLASSIFICATION = Object.freeze({
  // 1.2: Creative_Brief output contract kept; second approval step removed when fields are complete and unambiguous.
  G0: gate("Q1", "essential", ["creative-brief-contract"], ["second-approval-step"], "none when brief fields are complete and unambiguous"),
  // 1.3, 1.4
  G1: gate("Q1", "ceremonial", ["script-unit-coverage", "duration-sum", "vo-no-overlap"], ["per-sentence-approval"], "none"),
  // 1.3, 1.5
  G2: gate("Q1", "ceremonial", ["entities-exist", "voice-usage-permission"], ["per-entity-approval"], "none"),
  // 1.3, 1.6
  G3: gate("Q1", "ceremonial", ["style-consistency"], ["per-style-anchor-approval"], "none"),
  // 1.7
  G4: gate("Q1", "mixed", ["plan-validation"], [], "material_change only"),
  // 1.8
  G5r: gate("Q2", "mixed", ["visual-continuity"], ["per-image-approval"], "none"),
  // 1.9
  G5a: gate("Q2", "mixed", ["vo-coverage-and-duration", "audio-licence"], ["per-vo-approval", "per-cue-approval"], "none"),
  // 1.10
  G5b: gate("Q2", "mixed", ["image-integrity", "alpha-cutout-integrity", "asset-ref-exists", "raster-quality-floor"], ["per-asset-approval"], "none"),
  // 1.11: draft review is optional
  G6: gate("Q3", "essential", ["scene-lint", "motion-assertions", "mp4-technical", "visual-review", "loudness-mix", "audio-mix-review"], [], "optional draft review"),
  // 1.12: replaced by Production_Complete; publishing needs a separate Publication_Authorization
  G7: gate(DELIVERY, "ceremonial", [], ["g7-approval"], "publication_authorization required for external publishing"),
});

export const LEGACY_GATES = Object.freeze(Object.keys(GATE_CLASSIFICATION));

// gate id -> "Q1" | "Q2" | "Q3" | "delivery"
export const LEGACY_TO_CHECKPOINT = Object.freeze(
  Object.fromEntries(Object.entries(GATE_CLASSIFICATION).map(([id, g]) => [id, g.target])),
);

export const classifyGate = (id) => (Object.hasOwn(GATE_CLASSIFICATION, id) ? GATE_CLASSIFICATION[id] : null);
