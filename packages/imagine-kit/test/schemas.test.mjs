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
test("patch: brief_hash is optional but must be a hash when present", () => {
  const v = loadValidator("patch");
  const ok = structuredClone(patch); delete ok.brief_hash;
  assert.equal(v(ok).valid, true);
  const bad = structuredClone(patch); bad.brief_hash = "not-a-hash";
  assert.equal(v(bad).valid, false);
});
test("patch: input maps hold hashes; clock holds label:hash", () => {
  const v = loadValidator("patch");
  const bad = structuredClone(patch); bad.inputs.bible = { "characters.mara": "nothash" };
  assert.equal(v(bad).valid, false);
  const clockOk = structuredClone(patch); clockOk.inputs.clock = { L02: `vo.v1:${"c".repeat(64)}` };
  assert.equal(v(clockOk).valid, true);
  const clockBad = structuredClone(patch); clockBad.inputs.clock = { L02: "c".repeat(64) };
  assert.equal(v(clockBad).valid, false);
});
test("patch: create_shot may carry reasons", () => {
  const sb = { stage: "storyboard", author: "storyboard-artist", base_story_rev: 0, inputs: {},
    ops: [{ create_shot: { id: "s01", after: null, title: "t", narrative: "n", set: {}, reasons: { scene: "why" } } }] };
  assert.equal(loadValidator("patch")(sb).valid, true);
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

const project = { title: "Keeper", slug: "keeper", created: "2026-10-31", contract: 1,
  g0: { status: "approved", format: "portrait", width: 1080, height: 1920, fps: 30, audio_mode: "narrated",
        language: "en", duration_s: { min: 12, max: 15 }, platform: "generic", silence: null },
  stages: {}, items: {}, blocked: [] };
test("project: fps must be 30", () => {
  const v = loadValidator("project");
  assert.equal(v(project).valid, true);
  const bad = structuredClone(project); bad.g0.fps = 24;
  assert.equal(v(bad).valid, false);
});
test("envelope: ok is coupled to code", () => {
  const v = loadValidator("envelope");
  assert.equal(v({ ...envelope, ok: true, code: "HARD" }).valid, false);
  assert.equal(v({ ...envelope, ok: false, code: null }).valid, false);
  assert.equal(v({ ...envelope, ok: false, code: "NEEDS_USER" }).valid, true);
});
test("project: title required, items validated, stale never stored", () => {
  const v = loadValidator("project");
  const base = { ...structuredClone(project), title: "Keeper" };
  assert.equal(v(base).valid, true);
  const noTitle = structuredClone(base); delete noTitle.title;
  assert.equal(v(noTitle).valid, false);
  const item = { kind: "unit", status: "approved", gate: "G1",
    decision: { decision: "approve", quote: "yes", at: "2026-11-01T10:00:00.000Z" },
    inputs: { "unit:L01": "a".repeat(64), "g4": "item" } };
  assert.equal(v({ ...base, items: { "unit:L01": item } }).valid, true);
  assert.equal(v({ ...base, items: { "unit:L01": { ...item, status: "stale" } } }).valid, false);
  assert.equal(v({ ...base, items: { "unit:L01": { ...item, decision: { ...item.decision, quote: "  " } } } }).valid, false);
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

test("manifest: cutout provenance fields are optional and closed-list validated", async () => {
  const validate = loadValidator("manifest");   // loadValidator is already imported at the top of this file
  const entry = { id: "pose", kind: "img", v: 1, path: "assets/img/pose.v1.png", sha256: "0".repeat(64), status: "pending" };
  assert.equal(validate({ assets: [entry] }).valid, true);
  const full = { ...entry, cutout_method: "native", transparent_requested: true, transparent_flag: null, alpha_metrics: { transparent: 0.8 },
    integrity_flags: ["hyperframes_fallback", "foreground_loss", "edge_near", "fragmented", "ghosting"], review_composite: "assets/composites/pose.v1.png", codex_version: "codex-cli 0.166.0" };
  assert.equal(validate({ assets: [full] }).valid, true);
  assert.equal(validate({ assets: [{ ...entry, transparent_flag: false }] }).valid, true);
  assert.equal(validate({ assets: [{ ...entry, cutout_method: "magic" }] }).valid, false);
  assert.equal(validate({ assets: [{ ...entry, integrity_flags: ["mystery"] }] }).valid, false);
  assert.equal(validate({ assets: [{ ...entry, review_composite: "../escape.png" }] }).valid, false);
});

