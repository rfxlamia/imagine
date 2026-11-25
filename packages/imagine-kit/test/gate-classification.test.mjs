import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GATE_CLASSES, CHECKPOINT_IDS, DELIVERY, GATE_CLASSIFICATION, LEGACY_GATES, LEGACY_TO_CHECKPOINT, classifyGate,
} from "../src/gate-classification.mjs";

const EXPECTED_GATES = ["G0", "G1", "G2", "G3", "G4", "G5r", "G5a", "G5b", "G6", "G7"];

test("classification covers exactly the legacy gates", () => {
  assert.deepEqual([...LEGACY_GATES].sort(), [...EXPECTED_GATES].sort());
});

test("every gate maps to exactly one valid target (Req 1.1)", () => {
  for (const id of LEGACY_GATES) {
    const target = LEGACY_TO_CHECKPOINT[id];
    assert.equal(typeof target, "string", id);
    assert.ok([...CHECKPOINT_IDS, DELIVERY].includes(target), `${id} -> ${target}`);
    assert.equal(GATE_CLASSIFICATION[id].target, target);
  }
  assert.deepEqual(Object.keys(LEGACY_TO_CHECKPOINT).sort(), [...EXPECTED_GATES].sort());
});

test("G0 maps to Q1 and G7 maps to delivery (Req 1.1, 1.12)", () => {
  assert.equal(LEGACY_TO_CHECKPOINT.G0, "Q1");
  assert.equal(LEGACY_TO_CHECKPOINT.G7, "delivery");
  assert.equal(LEGACY_TO_CHECKPOINT.G7, DELIVERY);
});

test("only G7 maps to delivery", () => {
  const delivery = LEGACY_GATES.filter((id) => LEGACY_TO_CHECKPOINT[id] === DELIVERY);
  assert.deepEqual(delivery, ["G7"]);
});

test("each gate has a valid class and a retained-check list", () => {
  for (const id of LEGACY_GATES) {
    const g = GATE_CLASSIFICATION[id];
    assert.ok(GATE_CLASSES.includes(g.class), id);
    assert.ok(Array.isArray(g.retainedChecks), id);
    assert.ok(Array.isArray(g.removed), id);
    assert.equal(new Set(g.retainedChecks).size, g.retainedChecks.length, `${id} duplicates`);
  }
});

test("every gate targeting a checkpoint retains at least one check", () => {
  for (const id of LEGACY_GATES) {
    if (LEGACY_TO_CHECKPOINT[id] === DELIVERY) continue;
    assert.ok(GATE_CLASSIFICATION[id].retainedChecks.length > 0, id);
  }
});

test("retained checks per gate", () => {
  const expected = {
    G0: ["creative-brief-contract"],
    G1: ["script-unit-coverage", "duration-sum", "vo-no-overlap"],
    G2: ["entities-exist", "voice-usage-permission"],
    G3: ["style-consistency"],
    G4: ["plan-validation"],
    G5r: ["visual-continuity"],
    G5a: ["vo-coverage-and-duration", "audio-licence"],
    G5b: ["image-integrity", "alpha-cutout-integrity", "asset-ref-exists", "raster-quality-floor"],
    G6: ["scene-lint", "motion-assertions", "mp4-technical", "visual-review", "loudness-mix", "audio-mix-review"],
    G7: [],
  };
  for (const [id, checks] of Object.entries(expected)) {
    assert.deepEqual([...GATE_CLASSIFICATION[id].retainedChecks], checks, id);
  }
});

test("G7 is ceremonial, retains nothing, and requires publication authorization (Req 1.12)", () => {
  const g = GATE_CLASSIFICATION.G7;
  assert.equal(g.class, "ceremonial");
  assert.deepEqual([...g.retainedChecks], []);
  assert.match(g.humanApproval, /publication_authorization/);
});

test("classifyGate returns the entry or null for unknown ids", () => {
  assert.equal(classifyGate("G0"), GATE_CLASSIFICATION.G0);
  assert.equal(classifyGate("G99"), null);
  assert.equal(classifyGate("toString"), null);
  assert.equal(classifyGate("__proto__"), null);
});

test("classification is frozen", () => {
  assert.ok(Object.isFrozen(GATE_CLASSIFICATION));
  assert.ok(Object.isFrozen(GATE_CLASSIFICATION.G1));
  assert.ok(Object.isFrozen(GATE_CLASSIFICATION.G1.retainedChecks));
});
