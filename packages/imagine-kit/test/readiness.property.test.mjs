import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import fc from "fast-check";
import { shotReadiness } from "../src/readiness.mjs";
import { dependencyErrors, editPreconditions, readinessOpts, shotAssetItemIds } from "../src/edit/shots.mjs";
import { deriveAll } from "../src/derive.mjs";
import { createContext } from "../src/sources.mjs";
import { asset, getProject, put, setManifest, shot, snapshot } from "./helpers/fixture.mjs";
import { addAudio, editProject } from "./helpers/edit.mjs";

const SATISFIED = ["approved", "passed"];
const OTHER = ["pending", "validating", "repairing", "needs_input", "proposed", "stale", "failed", "missing"];
const depState = fc.constantFrom(...SATISFIED, ...OTHER);

// A derived row (or no row) that dependencyState maps back to `state`.
function rowFor(id, state) {
  if (state === "missing") return null;
  if (state === "approved") return { id, status: "approved", state: "pending" };
  if (state === "passed") return { id, status: "proposed", state: "passed" };
  if (state === "stale") return { id, status: "stale", state: "pending" };
  if (state === "failed") return { id, status: "proposed", state: "failed" };
  return { id, status: "proposed", state };
}
const derivedFrom = (states) => ({ items: Object.entries(states).map(([id, s]) => rowFor(id, s)).filter(Boolean) });

// Dependencies get distinct ids "d0".."dN" with a state each.
const deps = (min = 0, max = 8) => fc.array(depState, { minLength: min, maxLength: max }).map((l) => Object.fromEntries(l.map((s, i) => [`d${i}`, s])));
const fakeCtx = (silence = null, audioKinds = []) => ({
  project: { g0: silence ? { silence } : {}, items: {} },
  manifest: { assets: audioKinds.map((kind, i) => asset(`a${i}`, kind, 1, { status: "approved" })) },
});
const SHOT = { id: "s01", keys: {} };

// Feature: autonomous-quality-gates, Property 15: Shot readiness is derived from dependency states
// **Validates: Requirements 8.1, 8.2**
test("Property 15: ready iff every dependency is approved/passed, blocked if any failed, else pending", () => {
  fc.assert(fc.property(deps(), (states) => {
    const ids = Object.keys(states);
    const got = shotReadiness(derivedFrom(states), SHOT, ids);
    const vals = Object.values(states);
    const expected = vals.some((s) => s === "failed") ? "blocked" : vals.every((s) => SATISFIED.includes(s)) ? "ready" : "pending";
    assert.equal(got, expected);
  }), { numRuns: 200 });
});

// Feature: autonomous-quality-gates, Property 16: Per-shot readiness is independent of sibling shots
// **Validates: Requirements 8.3, 8.4, 8.5**
test("Property 16: shot A readiness and dependency errors ignore shot B's dependency states", () => {
  fc.assert(fc.property(fc.array(fc.constantFrom(...SATISFIED), { minLength: 0, maxLength: 5 }), deps(1, 6), (aStates, bStates) => {
    const a = Object.fromEntries(aStates.map((s, i) => [`a${i}`, s]));
    const b = Object.fromEntries(Object.entries(bStates).map(([k, s]) => [`b${k}`, s]));
    const derived = derivedFrom({ ...a, ...b });
    const sctx = fakeCtx();
    assert.equal(shotReadiness(derived, { id: "sA", keys: {} }, Object.keys(a), readinessOpts(sctx)), "ready");
    assert.deepEqual(dependencyErrors(derived, sctx, { id: "sA", keys: {} }, Object.keys(a)), []);
    // the same result when B is entirely satisfied
    const clean = derivedFrom({ ...a, ...Object.fromEntries(Object.keys(b).map((k) => [k, "approved"])) });
    assert.equal(shotReadiness(clean, { id: "sA", keys: {} }, Object.keys(a), readinessOpts(sctx)), shotReadiness(derived, { id: "sA", keys: {} }, Object.keys(a), readinessOpts(sctx)));
  }), { numRuns: 100 });
});

// Feature: autonomous-quality-gates, Property 17: Readiness errors name the exact blocking dependency and its state
// **Validates: Requirements 8.6, 8.7**
test("Property 17: one error per blocking dependency naming the shot, the dependency and its state (stale named as stale)", () => {
  fc.assert(fc.property(deps(1, 8), (states) => {
    const ids = Object.keys(states);
    const errors = dependencyErrors(derivedFrom(states), fakeCtx(), SHOT, ids);
    const blocking = ids.filter((id) => !SATISFIED.includes(states[id]));
    assert.deepEqual(errors.map((e) => e.item), blocking);
    for (const e of errors) {
      const state = states[e.item];
      assert.ok(e.message.includes(`shot ${SHOT.id}`), e.message);
      assert.ok(e.message.includes(e.item), e.message);
      if (state === "stale") assert.match(e.message, /is stale/);
      else assert.ok(e.message.endsWith(`${e.item} is ${state}`), e.message);
    }
  }), { numRuns: 200 });
});

// Feature: autonomous-quality-gates, Property 19: Intentional silence satisfies every shot's audio dependency
// **Validates: Requirements 8.9**
test("Property 19: intentional silence with zero audio assets treats the audio dependency as passed", () => {
  const audioId = fc.constantFrom("g5a", "audio:vo", "audio:music");
  fc.assert(fc.property(fc.array(audioId, { minLength: 1, maxLength: 3 }), fc.array(fc.constantFrom(...OTHER), { minLength: 3, maxLength: 3 }), (audio, st) => {
    const unique = [...new Set(audio)];
    const states = Object.fromEntries(unique.map((id, i) => [id, st[i % st.length]]));
    states.img = "approved";
    const derived = derivedFrom(states);
    const ids = Object.keys(states);
    const silent = readinessOpts(fakeCtx("intentional", ["img"]));
    assert.equal(shotReadiness(derived, SHOT, ids, silent), "ready");
    assert.deepEqual(dependencyErrors(derived, fakeCtx("intentional", ["img"]), SHOT, ids), []);
    // Without the waiver the audio dependency's own state decides.
    assert.notEqual(shotReadiness(derived, SHOT, ids, readinessOpts(fakeCtx(null, ["img"]))), "ready");
    assert.notEqual(shotReadiness(derived, SHOT, ids, readinessOpts(fakeCtx("intentional", ["img", "vo"]))), "ready");
  }), { numRuns: 100 });
});

// Real project: s01 declares bg, s02 declares `late`. Properties 16, 17 and 18 across the real stage-shot precondition and export-hf.
async function siblingProject(variant) {
  const shots = [
    shot("s01", { scene: "stairs", duration_est: "6s", duration: "6s", voiceover: "[L01, L02@2.5]", assets: "[bg:img:1536x1024]", framing: "wide" }, "Stairs", "She climbs."),
    shot("s02", { scene: "lamp", duration_est: "7s", duration: "7s", voiceover: "[L03]", assets: "[late:img:1536x1024]" }, "Lamp"),
  ];
  const p = await editProject({ shots });
  await addAudio(p, { music: false });
  if (variant.inManifest) {
    put(p.dir, "assets/img/late.v1.png", "late bytes");
    setManifest(p.dir, (m) => { m.assets.push(asset("late", "img", 1, { path: "assets/img/late.v1.png", status: variant.status })); });
    if (variant.record) await snapshot(p.dir, "asset:late.v1", [], { status: "proposed", kind: "asset" });
  }
  return p;
}
const variants = fc.record({
  inManifest: fc.boolean(),
  status: fc.constantFrom("pending", "rejected"),
  record: fc.boolean(),
});
function tree(dir, rel, out = {}) {
  const abs = join(dir, rel);
  if (!existsSync(abs)) return out;
  for (const name of readdirSync(abs).sort()) {
    const r = `${rel}/${name}`;
    if (statSync(join(dir, r)).isDirectory()) tree(dir, r, out);
    else out[r] = readFileSync(join(dir, r)).toString("base64");
  }
  return out;
}

test("Properties 16-18: a ready shot is unaffected by a blocked sibling; errors name the sibling's dependency; export leaves the sibling alone", async () => {
  await fc.assert(fc.asyncProperty(variants, async (variant) => {
    const p = await siblingProject(variant);
    const sctx = createContext(p.dir);
    const derived = deriveAll(sctx);
    const [s01, s02] = sctx.story.shots;
    // Property 16: s01 is ready and stage-shot's precondition passes whatever s02's assets look like.
    assert.equal(shotReadiness(derived, s01, shotAssetItemIds(sctx, s01), readinessOpts(sctx)), "ready");
    assert.deepEqual(editPreconditions(p.dir, derived, s01, sctx).errors, []);
    // Property 17: when s02 declares a version that exists, its precondition error names shot, dependency and state.
    const s02Deps = shotAssetItemIds(sctx, s02);
    if (s02Deps.length) {
      const { errors } = editPreconditions(p.dir, derived, s02, sctx);
      const dep = s02Deps[0];
      const hit = errors.find((e) => e.item === dep);
      assert.ok(hit, JSON.stringify(errors));
      assert.ok(hit.message.includes("shot s02") && hit.message.includes(dep), hit.message);
      const row = derived.items.find((i) => i.id === dep);
      const state = row ? (row.stale || row.status === "stale" ? "stale" : row.state === "failed" ? "failed" : row.state ?? row.status) : "missing";
      assert.match(hit.message, new RegExp(` is ${state}\\b`));
    }
    // Property 18: exporting s01 leaves everything that belongs to s02's dependencies unchanged.
    const before = { files: tree(p.dir, "assets"), late: getProject(p.dir).items["asset:late.v1"], s02: Object.fromEntries(Object.entries(getProject(p.dir).items).filter(([k]) => k.startsWith("shot:s02"))) };
    const r = await p.run({}, "export-hf", "s01");
    assert.equal(r.exit, 0, JSON.stringify(r.env.errors));
    assert.deepEqual(r.env.data.shots, ["s01"]);
    assert.ok(r.env.data.assets.every((a) => a.id === "bg"));
    const after = { files: tree(p.dir, "assets"), late: getProject(p.dir).items["asset:late.v1"], s02: Object.fromEntries(Object.entries(getProject(p.dir).items).filter(([k]) => k.startsWith("shot:s02"))) };
    assert.deepEqual(after, before);
    assert.deepEqual(Object.keys(tree(p.dir, "edit/assets")).filter((f) => /late/.test(f)), []);
  }), { numRuns: 6 });
});
