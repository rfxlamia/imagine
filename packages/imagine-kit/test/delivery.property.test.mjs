import test from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import fc from "fast-check";
import { updateDelivery, publishPlatform, DELIVERY_ITEM_ID } from "../src/delivery.mjs";
import { CHECKPOINTS, checkpointItemId } from "../src/checkpoints.mjs";
import { sha256File } from "../src/hash.mjs";
import { makeProject, getProject, setProject } from "./helpers/fixture.mjs";

const NUM_RUNS = 30;
const NOW = new Date("2025-01-01T00:00:00Z");
const PLATFORMS = ["youtube", "tiktok", "instagram"];
const Q3_IDS = CHECKPOINTS.Q3.checks.map((c) => c.id);
const ev = (checkId, result) => ({ checkId, result, evaluator: "t", evaluatorCapabilities: ["text"], ruleVersion: "1", inputHashes: {}, outputRefs: [], at: NOW.toISOString() });
const publication = (scope, fileHash) => ({ kind: "publication", scope, quote: "yes, publish it", ...(fileHash !== undefined ? { fileHash } : {}), at: NOW.toISOString() });
const hex64 = fc.stringMatching(/^[0-9a-f]{64}$/);
const content = fc.uint8Array({ minLength: 0, maxLength: 64 });

const { dir } = await makeProject();

function seed(shots, passedFlags, consents) {
  setProject(dir, (p) => {
    p.items = Object.fromEntries(Object.entries(p.items ?? {}).filter(([id]) => !id.startsWith("checkpoint:Q3") && id !== DELIVERY_ITEM_ID));
    shots.forEach((id, i) => {
      p.items[checkpointItemId("Q3", [id])] = { kind: "checkpoint", status: "pending",
        evidence: Q3_IDS.map((c, k) => ev(c, passedFlags[i] || k > 0 ? "passed" : "failed")) };
    });
    p.consents = consents;
  });
}

// **Validates: Requirements 12.1**
test("Property 23: Reaching Production_Complete never publishes", () => {
  const shotIds = fc.uniqueArray(fc.stringMatching(/^s[0-9]{2}$/), { minLength: 1, maxLength: 5 });
  fc.assert(fc.property(
    shotIds, fc.array(fc.boolean(), { minLength: 5, maxLength: 5 }), fc.boolean(),
    (shots, flags, withConsent) => {
      const consents = withConsent ? PLATFORMS.map((pl) => publication(pl, "a".repeat(64))) : [];
      seed(shots, flags, consents);
      const allPassed = shots.every((_, i) => flags[i]);
      const r = updateDelivery(dir, { shots, now: NOW });
      assert.equal(r.state, allPassed ? "ready" : "pending");
      assert.notEqual(r.state, "published");
      const stored = getProject(dir).items[DELIVERY_ITEM_ID];
      assert.notEqual(stored?.state, "published");
      // Calling again, with or without consents, still never publishes.
      assert.notEqual(updateDelivery(dir, { shots, now: NOW }).state, "published");
    },
  ), { numRuns: NUM_RUNS });
});

// **Validates: Requirements 12.3, 12.5**
test("Property 24: publish succeeds exactly when the recorded hash equals the file's hash", () => {
  fc.assert(fc.property(
    content, fc.constantFrom(...PLATFORMS), fc.constantFrom("match", "random", "tampered", "absent"), hex64, content,
    (bytes, platform, mode, otherHash, extra) => {
      const rel = "final.mp4";
      writeFileSync(join(dir, rel), bytes);
      const original = sha256File(join(dir, rel));
      const recorded = mode === "random" ? otherHash : mode === "absent" ? undefined : original;
      seed([], [], [publication(platform, recorded)]);
      if (mode === "tampered") writeFileSync(join(dir, rel), Buffer.concat([Buffer.from(bytes), Buffer.from([1]), Buffer.from(extra)]));
      const actual = sha256File(join(dir, rel));
      const r = publishPlatform(dir, { platform, file: rel, now: NOW });
      const state = getProject(dir).items?.[DELIVERY_ITEM_ID]?.state;
      if (recorded !== undefined && recorded === actual) {
        assert.equal(r.published, true);
        assert.equal(state, "published");
      } else {
        assert.equal(r.published, false);
        assert.notEqual(state, "published");
        assert.ok(r.errors.some((e) => e.rule === "PUBLICATION-HASH-MISMATCH"));
      }
    },
  ), { numRuns: NUM_RUNS });
});

test("Property 24: a publish with no publication consent for the platform is refused", () => {
  // **Validates: Requirements 12.3**
  writeFileSync(join(dir, "final.mp4"), "x");
  const hash = sha256File(join(dir, "final.mp4"));
  seed([], [], [publication("youtube", hash)]);
  const r = publishPlatform(dir, { platform: "tiktok", file: "final.mp4", now: NOW });
  assert.equal(r.published, false);
  assert.ok(r.errors.some((e) => e.rule === "CONSENT-REQUIRED"));
  assert.equal(getProject(dir).items?.[DELIVERY_ITEM_ID], undefined);
});
