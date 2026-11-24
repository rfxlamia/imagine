import test from "node:test";
import assert from "node:assert/strict";
import { deriveAll } from "../src/derive.mjs";
import { createContext } from "../src/sources.mjs";
import { shotReadiness } from "../src/readiness.mjs";
import { editPreconditions, readinessOpts, shotAssetItemIds } from "../src/edit/shots.mjs";
import { asset, getProject, put, setManifest, shot, snapshot } from "./helpers/fixture.mjs";
import { addAudio, editProject } from "./helpers/edit.mjs";
// Requirements 2.2, 8.2-8.5 via the per-shot flow: s01 is built while s02 and s03 are still generating.
// Stubbed: s02/s03 "generating" is a manifest entry with status pending (and no file for s03); no image backend runs.
// Real: stage derivation, per-shot readiness, editPreconditions and export-hf.
async function project() {
  const shots = [
    shot("s01", { scene: "stairs", duration_est: "6s", duration: "6s", voiceover: "[L01, L02@2.5]", characters: "[mara]", location: "lighthouse", assets: "[bg:img:1536x1024]", framing: "wide" }, "Stairs", "She climbs."),
    shot("s02", { scene: "lamp", duration_est: "5s", duration: "5s", voiceover: "[L03]", assets: "[late:img:1536x1024]" }, "Lamp"),
    shot("s03", { scene: "sea", duration_est: "4s", duration: "4s", assets: "[later:img:1536x1024]" }, "Sea"),
  ];
  const p = await editProject({ shots });
  await addAudio(p, { music: false });
  put(p.dir, "assets/img/late.v1.png", "still generating");
  setManifest(p.dir, (m) => {
    m.assets.push(asset("late", "img", 1, { path: "assets/img/late.v1.png", status: "pending" }));
    m.assets.push(asset("later", "img", 1, { path: "assets/img/later.v1.png", status: "pending" }));
  });
  await snapshot(p.dir, "asset:late.v1", [], { status: "proposed", kind: "asset" });
  await snapshot(p.dir, "asset:later.v1", [], { status: "proposed", kind: "asset" });
  return p;
}
test("s01 becomes ready and exports while s02 and s03 are still generating", async () => {
  const p = await project();
  const sctx = createContext(p.dir);
  const derived = deriveAll(sctx);
  const [s01, s02, s03] = sctx.story.shots;
  // s01 is ready; its siblings are not.
  assert.equal(shotReadiness(derived, s01, shotAssetItemIds(sctx, s01), readinessOpts(sctx)), "ready");
  assert.deepEqual(editPreconditions(p.dir, derived, s01, sctx).errors, []);
  for (const s of [s02, s03]) {
    const { errors } = editPreconditions(p.dir, derived, s, sctx);
    assert.ok(errors.length > 0, s.id);
    assert.ok(errors.some((e) => e.message.includes(`shot ${s.id}`)), s.id);
  }
  // Building s01 (export-hf) touches only s01's dependencies.
  const before = JSON.stringify(Object.fromEntries(Object.entries(getProject(p.dir).items).filter(([k]) => /late/.test(k))));
  const r = await p.run({}, "export-hf", "s01");
  assert.equal(r.exit, 0, JSON.stringify(r.env.errors));
  assert.deepEqual(r.env.data.shots, ["s01"]);
  const after = JSON.stringify(Object.fromEntries(Object.entries(getProject(p.dir).items).filter(([k]) => /late/.test(k))));
  assert.equal(after, before);
});
test("s02 becomes ready once its asset is approved while s03 is still generating", async () => {
  const p = await project();
  setManifest(p.dir, (m) => { m.assets.find((a) => a.id === "late").status = "approved"; });
  await snapshot(p.dir, "asset:late.v1", [], { status: "approved", kind: "asset" });
  const sctx = createContext(p.dir);
  const derived = deriveAll(sctx);
  const [s01, s02, s03] = sctx.story.shots;
  assert.deepEqual(editPreconditions(p.dir, derived, s01, sctx).errors, []);
  assert.deepEqual(editPreconditions(p.dir, derived, s02, sctx).errors, []);
  assert.ok(editPreconditions(p.dir, derived, s03, sctx).errors.length > 0);
});
