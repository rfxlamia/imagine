import { test } from "node:test";
import assert from "node:assert/strict";
import { loadValidator } from "../src/schemas.mjs";

const envelope = { ok: true, command: "status", kit_version: "0.1.0", contract: 1, project: null,
  code: null, data: {}, errors: [], advice: [], not_run: [], waived: [], journal_id: null };

test("envelope: valid", () => assert.equal(loadValidator("envelope")(envelope).valid, true));
test("envelope: ok true with errors is invalid", () => {
  const bad = { ...envelope, errors: [{ rule: "HARD-X", code: "HARD", item: "s01", message: "m" }] };
  assert.equal(loadValidator("envelope")(bad).valid, false);
});

const patch = { stage: "previz", author: "previz-designer", base_story_rev: 4, brief_hash: "a".repeat(64),
  inputs: { bible: {}, style: { camera: "b".repeat(64) }, units: {}, clock: {} },
  ops: [{ shot: "s02", set: { duration: "5.2s", camera: "push-in" }, reasons: { camera: "style.md#camera" } }] };

test("patch: valid previz", () => assert.equal(loadValidator("patch")(patch).valid, true));
test("patch: previz may not set characters", () => {
  const bad = structuredClone(patch); bad.ops[0].set.characters = ["mara"];
  assert.equal(loadValidator("patch")(bad).valid, false);
});
test("patch: create_shot only in storyboard", () => {
  const bad = structuredClone(patch); bad.ops = [{ create_shot: { id: "s09", after: "s08", title: "t", narrative: "n", set: {} } }];
  assert.equal(loadValidator("patch")(bad).valid, false);
});
test("patch: missing brief_hash invalid", () => {
  const bad = structuredClone(patch); delete bad.brief_hash;
  assert.equal(loadValidator("patch")(bad).valid, false);
});

const waivers = { waivers: [{ id: "w1", rule: "HARD-SAFE-BAND", scope: ["s03"], status: "active",
  reason: "checked on phone", consequence: "band unverified by tool", quote: "ya, waive s03",
  manual_check: "phone", scope_hashes: { s03: "c".repeat(64) }, granted_at: "2026-10-31T12:00:00Z" }] };
test("waivers: valid", () => assert.equal(loadValidator("waivers")(waivers).valid, true));
test("waivers: scope all rejected", () => {
  const bad = structuredClone(waivers); bad.waivers[0].scope = ["all"];
  assert.equal(loadValidator("waivers")(bad).valid, false);
});
test("waivers: active without quote rejected", () => {
  const bad = structuredClone(waivers); delete bad.waivers[0].quote;
  assert.equal(loadValidator("waivers")(bad).valid, false);
});

test("capabilities: unknown status rejected", () => {
  const v = loadValidator("capabilities");
  assert.equal(v({ version: "0.1.0", contract: 1, commands: { qc: { status: "implemented" } } }).valid, true);
  assert.equal(v({ version: "0.1.0", contract: 1, commands: { qc: { status: "maybe" } } }).valid, false);
});

const project = { slug: "keeper", created: "2026-10-31", contract: 1,
  g0: { status: "approved", format: "portrait", width: 1080, height: 1920, fps: 30, audio_mode: "narrated",
        language: "en", duration_s: { min: 12, max: 15 }, platform: "generic", silence: null },
  stages: {}, items: {}, blocked: [] };
test("project: fps must be 30", () => {
  const v = loadValidator("project");
  assert.equal(v(project).valid, true);
  const bad = structuredClone(project); bad.g0.fps = 24;
  assert.equal(v(bad).valid, false);
});

test("manifest: third-party audio needs licence fields", () => {
  const v = loadValidator("manifest");
  const ok = { assets: [{ id: "music-01", kind: "music", v: 1, path: "assets/music/music-01.v1.mp3",
    sha256: "d".repeat(64), status: "approved", license: "CC-BY-4.0", source: "https://example.org/t", credit: "Artist" }] };
  assert.equal(v(ok).valid, true);
  const bad = structuredClone(ok); delete bad.assets[0].credit;
  assert.equal(v(bad).valid, false);
});

test("brief-manifest: stage maps to imagine/project/hyperframes lists", () => {
  const v = loadValidator("brief-manifest");
  assert.equal(v({ "audit-previz": { project: ["bible.yaml", "style.md"], imagine: ["plan/audit-checklist.md"] } }).valid, true);
  assert.equal(v({ "audit-previz": { imagine: ["plan/audit-checklist.md"] } }).valid, false);
});
