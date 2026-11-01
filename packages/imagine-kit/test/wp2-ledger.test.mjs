import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseRules } from "../../../tools/check-traceability.mjs";

const WP2_RULES = [
  "HARD-REFS-APPROVED", "HARD-ASSETS-APPROVED", "HARD-VO-PRESENT", "HARD-AUDIO-STREAM", "HARD-AUDIO-LICENCE", "HARD-LOUDNESS",
  "HARD-RASTER-TIER", "HARD-NO-NATIVE-CLAIM", "HARD-SCENE-LINT", "HARD-SCENE-CLASS", "HARD-ROOT-MOTION", "HARD-NO-BEST-EFFORT",
  "HARD-HAS-VOICE-CLONING", "HARD-REAL-RASTER", "HARD-TTS-EOS", "PROC-TELEMETRY-OFF", "PROC-SCRATCH-NOT-ASSET",
  "PROC-ONE-LINE-PER-WAV", "PROC-REVISED-PROMPT", "PROC-FRAMING-IN-PROMPT", "PROC-IMG-RETRY", "PROC-RESUME-IDEMPOTENT",
  "PROC-VERSIONS-IMMUTABLE", "PROC-CAPTION-ORIGINAL", "PROC-CLOCK-PER-MODE",
  "AC-01", "AC-06", "AC-07", "AC-08", "AC-14", "AC-15",
];
const here = fileURLToPath(new URL(".", import.meta.url));

test("WP2 ledger: every WP2 rule id appears in a kit test file", () => {
  const text = readdirSync(here).filter((f) => f.endsWith(".test.mjs") && f !== "wp2-ledger.test.mjs")
    .map((f) => readFileSync(join(here, f), "utf8")).join("\n");
  assert.deepEqual(WP2_RULES.filter((id) => !new RegExp(`\\b${id}\\b`).test(text)), []);
});

test("WP2 ledger: every WP2 rule is an active tests/both rule in the registry", () => {
  const rules = parseRules(readFileSync(join(here, "..", "..", "..", "docs", "contracts", "rules.yaml"), "utf8"));
  const byId = new Map(rules.map((r) => [r.id, r]));
  const bad = [];
  for (const id of WP2_RULES) {
    const r = byId.get(id);
    if (!r) bad.push(`${id}: not in the registry`);
    else if (r.status === "deferred") bad.push(`${id}: deferred`);
    else if (!["tests", "both"].includes(r.cover)) bad.push(`${id}: cover ${r.cover}`);
  }
  assert.deepEqual(bad, []);
});
