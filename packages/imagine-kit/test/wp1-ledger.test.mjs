import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseRules } from "../../../tools/check-traceability.mjs";

const WP1_RULES = [
  "PROC-ATOMIC-COMMIT", "PROC-JOURNAL", "PROC-CONFLICT-REDISPATCH", "CAP-BLOCKED-STOP", "CAP-ADV-NOT-RUN",
  "GATE-QUOTE", "GATE-PER-ITEM", "HARD-NON-WAIVABLE", "HARD-FPS-SIZE", "HARD-DURATION", "HARD-STORY-IDS", "HARD-STORY-UNIT-ONCE",
  "HARD-ENTITIES-EXIST", "HARD-NO-PLACEHOLDER", "HARD-STORYBOARD-ASSET-DECL", "HARD-PREVIZ-BEATS-INSIDE", "HARD-VO-NO-OVERLAP",
  "HARD-MUSICLED-ASSET", "HARD-FX-TOOL-ENUM", "HARD-FX-WEBGL-FALLBACK", "HARD-NO-CSS-FILTER-RASTER", "HARD-PREVIZ-NAMES-EXIST",
  "HARD-PATCH-KEYS", "HARD-PATCH-BASE-REV", "HARD-PATCH-REVERIFY", "HARD-PATCH-INPUTS-DECLARED", "HARD-STORY-WRITERS",
  "HARD-STYLE-OUTPUT-READONLY", "HARD-STATUS-DERIVED", "HARD-GATES-RECORDED",
  "DAG-G0-FORMAT", "DAG-G0-LANGUAGE", "DAG-G0-AUDIO-MODE", "DAG-SCRIPT-L-VO", "DAG-SCRIPT-T-PREVIZ", "DAG-BIBLE-ENTITY",
  "DAG-BIBLE-VOICE", "DAG-BIBLE-LEXICON", "DAG-VO-RETIME", "DAG-STYLE-ANCHOR", "DAG-SHOT-STORYBOARD", "DAG-SHOT-PREVIZ",
  "DAG-SHOT-FX", "DAG-MUSIC-GRID", "DAG-REF-VERSION", "DAG-ASSET-APPROVED", "DAG-EDIT-RENDER", "DAG-STALE-VS-REVIEW",
  "AC-02", "AC-04", "AC-05", "AC-12",
];
const here = fileURLToPath(new URL(".", import.meta.url));

test("WP1 ledger: every WP1 rule id appears in a kit test file", () => {
  const text = readdirSync(here).filter((f) => f.endsWith(".test.mjs") && f !== "wp1-ledger.test.mjs")
    .map((f) => readFileSync(join(here, f), "utf8")).join("\n");
  assert.deepEqual(WP1_RULES.filter((id) => !new RegExp(`\\b${id}\\b`).test(text)), []);
});

test("WP1 ledger: every WP1 rule is an active tests/both rule in the registry", () => {
  const rules = parseRules(readFileSync(join(here, "..", "..", "..", "docs", "contracts", "rules.yaml"), "utf8"));
  const byId = new Map(rules.map((r) => [r.id, r]));
  for (const id of WP1_RULES) {
    const r = byId.get(id);
    assert.ok(r, `${id} is in the registry`);
    assert.notEqual(r.status, "deferred", `${id} is active`);
    assert.ok(["tests", "both"].includes(r.cover), `${id} has tests coverage`);
  }
});
