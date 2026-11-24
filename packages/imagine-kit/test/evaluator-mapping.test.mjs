import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import fc from "fast-check";
import { createContinuityEvaluator, findingToError, mapReviewResponse } from "../src/evaluators.mjs";
import { CHECKPOINTS, runCheckpoint } from "../src/checkpoints.mjs";
import { createContext } from "../src/sources.mjs";
import { deriveAll } from "../src/derive.mjs";
import { inputsFrom, validateStory } from "../src/story/validate.mjs";
import { checkAssets } from "../src/edit/assets-check.mjs";
import { renderPreflight } from "../src/edit/preflight.mjs";
import { lintProject, staticSceneChecks } from "../src/edit/composition.mjs";
import { makeProject, seedCanon, seedMinimalStory, put } from "./helpers/fixture.mjs";
import { COMPOSITION } from "./helpers/edit.mjs";

const NOW = new Date("2026-11-01T10:00:00Z");
const FAKE_NPX = fileURLToPath(new URL("./fakes/npx.mjs", import.meta.url));
const id = fc.stringMatching(/^s[0-9]{2}$/);
const attr = fc.stringMatching(/^[a-z][a-z-]{2,12}$/);
const finding = fc.record({ severity: fc.constantFrom("P0", "P1", "P2"), shots: fc.array(id, { minLength: 1, maxLength: 5 }), attribute: attr, observed: fc.constant("differs"), change: fc.constant("align it") });

test("Property 21: continuity-finding mapping preserves shots and attribute", () => {
  // **Validates: Requirements 10.6**
  fc.assert(fc.property(fc.array(finding, { minLength: 1, maxLength: 4 }), (findings) => {
    const out = mapReviewResponse("visual-continuity", "continuity-reviewer", { outcome: "needs_changes", findings, inspected: ["assets/img/a.v1.png"] });
    assert.equal(out.result, "failed");
    assert.equal(out.errors.length, findings.length);
    findings.forEach((f, i) => {
      const shots = [...new Set(f.shots)].sort();
      const e = out.errors[i];
      assert.equal(e.item, shots.join(","));
      assert.ok(e.message.includes(`"${f.attribute}"`));
      for (const s of shots) {
        assert.ok(e.message.includes(s));
        assert.ok(out.outputRefs.includes(`shot:${s}`));
      }
      assert.ok(out.outputRefs.includes(`attribute:${f.attribute}`));
      assert.deepEqual(e, findingToError("visual-continuity", f));
    });
  }), { numRuns: 100 });
});

test("a bare no-findings response is not_run, never passed", () => {
  for (const resp of [{ outcome: "no_findings_observed", findings: [], inspected: ["a.png"] }, { outcome: "blocked" }, null]) {
    const out = mapReviewResponse("visual-continuity", "continuity-reviewer", resp);
    assert.equal(out.result, "not_run");
    assert.deepEqual(out.unevaluated, ["visual-continuity"]);
  }
});

test("continuity evaluator forwards a dispatched finding as a failing result with shots and attribute", async () => {
  const dispatch = async () => ({ outcome: "needs_changes", inspected: ["a.png"], findings: [{ severity: "P1", shots: ["s02", "s01"], attribute: "hair-colour", observed: "red vs brown", change: "use brown" }] });
  const out = await createContinuityEvaluator({ dispatch })({ dir: "/x", sctx: null, check: { id: "visual-continuity" } });
  assert.equal(out.result, "failed");
  assert.equal(out.errors[0].item, "s01,s02");
  assert.match(out.errors[0].message, /hair-colour/);
});

// ------------------------------------------------------------- Check wiring
const check = (r, checkId) => r.checks.find((c) => c.checkId === checkId);
async function storyProject() {
  const { dir } = await makeProject();
  seedCanon(dir);
  await seedMinimalStory(dir);
  return dir;
}

test("Q1 script-unit-coverage returns exactly the validateStory errors for HARD-STORY-UNIT-ONCE", async () => {
  const dir = await storyProject();
  writeFileSync(join(dir, "STORY.md"), readFileSync(join(dir, "STORY.md"), "utf8").replace(/L01/g, "L09"));
  const r = await runCheckpoint(dir, "Q1", { now: NOW });
  const sctx = createContext(dir);
  const previz = sctx.story.shots.length > 0 && sctx.story.shots.every((s) => s.keys.duration !== undefined);
  const legacy = validateStory(inputsFrom(sctx, previz ? "previz" : "storyboard")).errors.filter((e) => e.rule === "HARD-STORY-UNIT-ONCE");
  assert.ok(legacy.length > 0);
  assert.deepEqual(check(r, "script-unit-coverage").errors, legacy);
});

test("Q2 asset-ref-exists and audio-licence return the checkAssets errors for their legacy rules", async () => {
  const dir = await storyProject();
  const r = await runCheckpoint(dir, "Q2", { now: NOW });
  const sctx = createContext(dir);
  const legacy = checkAssets(dir, sctx, deriveAll(sctx)).errors;
  const pick = (rule) => legacy.filter((e) => e.rule === rule && !/has no approved version|is not approved at its gate|not accepted at G5b/.test(e.message));
  assert.deepEqual(check(r, "audio-licence").errors, pick("HARD-AUDIO-LICENCE"));
  const refErrors = check(r, "asset-ref-exists").errors.filter((e) => pick("HARD-ASSETS-APPROVED").some((l) => l.message === e.message));
  assert.deepEqual(refErrors, pick("HARD-ASSETS-APPROVED"));
});

test("Q3 scene-lint records the lint tool's findings unchanged", async () => {
  const dir = await storyProject();
  put(dir, "edit/index.html", "<html></html>");
  put(dir, "edit/compositions/s01.html", COMPOSITION("s01"));
  const ctx = { tools: { npx: [process.execPath, FAKE_NPX] }, env: { ...process.env, FAKE_NPX_MODE: "lint-error" } };
  const direct = await lintProject(ctx, join(dir, "edit"));
  const r = await runCheckpoint(dir, "Q3", { now: NOW, ctx });
  const c = check(r, "scene-lint");
  assert.equal(c.result, "failed");
  assert.ok(direct.errors.length > 0);
  const expected = [...staticSceneChecks(readFileSync(join(dir, "edit/compositions/s01.html"), "utf8"), "s01"), ...direct.errors];
  assert.deepEqual(c.errors, expected);
  assert.ok(c.errors.some((e) => e.message === "missing_timeline: no timeline" && e.cause === "register it"));
});

test("Q3 scene-lint passes when the lint tool reports no findings and not_run when its output is unusable", async () => {
  const dir = await storyProject();
  put(dir, "edit/index.html", "<html></html>");
  put(dir, "edit/compositions/s01.html", COMPOSITION("s01"));
  const mk = (mode) => ({ tools: { npx: [process.execPath, FAKE_NPX] }, env: { ...process.env, FAKE_NPX_MODE: mode } });
  assert.equal(check(await runCheckpoint(dir, "Q3", { now: NOW, ctx: mk("ok") }), "scene-lint").result, "passed");
  const bad = check(await runCheckpoint(dir, "Q3", { now: NOW, ctx: mk("no-json") }), "scene-lint");
  assert.equal(bad.result, "not_run");
  assert.equal(bad.errors[0].code, "HARD_NOT_RUN");
});

test("Q3 motion-assertions records the renderPreflight errors unchanged", async () => {
  const dir = await storyProject();
  put(dir, "edit/index.html", "<html><body></body></html>");
  const ids = createContext(dir).story.shots.map((s) => s.id);
  const legacy = renderPreflight(dir, ids);
  assert.ok(legacy.length > 0);
  const r = await runCheckpoint(dir, "Q3", { now: NOW });
  const c = check(r, "motion-assertions");
  assert.deepEqual(c.errors, legacy);
  assert.equal(c.result, "failed");
});

test("every Check names the legacy HARD rule it enforces", () => {
  for (const cp of Object.values(CHECKPOINTS)) for (const c of cp.checks) assert.match(c.rule, /^[A-Z][A-Z0-9-]+$/, c.id);
});
