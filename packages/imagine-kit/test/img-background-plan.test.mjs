import { test } from "node:test";
import assert from "node:assert/strict";
import YAML from "yaml";
import { put } from "./helpers/fixture.mjs";
import { imgProject, sheetProject, PLAN, ROOSTER_PLAN } from "./helpers/img.mjs";
import { loadPlan, resolveBackground } from "../src/img/plan.mjs";

const withBg = (plan, patch) => ({ assets: plan.assets.map((a) => ({ ...a, ...(patch(a) ?? {}) })) });
const members = (plan) => plan.assets.filter((a) => a.sheet);
const rejects = (dir, rule) => assert.throws(() => loadPlan(dir), (e) => e.code === "HARD_NOT_RUN" && e.rule === rule);

test("resolveBackground: absent field is legacy for sheet members and opaque otherwise", () => {
  assert.equal(resolveBackground({ kind: "img", sheet: "g" }), "legacy");
  assert.equal(resolveBackground({ kind: "img" }), "opaque");
  assert.equal(resolveBackground({ kind: "ref" }), "opaque");
  assert.equal(resolveBackground({ kind: "img", sheet: "g", background: "transparent" }), "transparent");
});

test("loadPlan accepts explicit transparent sheet and rejects invalid intents", async () => {
  const ok = withBg(ROOSTER_PLAN, (a) => (a.sheet ? { background: "transparent" } : null));
  assert.equal(loadPlan((await sheetProject(ok)).dir).length, ROOSTER_PLAN.assets.length);

  const opaqueMember = withBg(ROOSTER_PLAN, (a) => (a.sheet ? { background: "opaque" } : null));
  rejects((await sheetProject(opaqueMember)).dir, "PROC-POSE-SHEET");

  let first = true;
  const mixed = withBg(ROOSTER_PLAN, (a) => { if (!a.sheet) return null; const r = first ? { background: "transparent" } : null; first = false; return r; });
  rejects((await sheetProject(mixed)).dir, "PROC-POSE-SHEET");

  const refTransparent = withBg(ROOSTER_PLAN, (a) => (a.kind === "ref" ? { background: "transparent" } : null));
  rejects((await sheetProject(refTransparent)).dir, "HARD-ASSETS-APPROVED");

  const badValue = withBg(ROOSTER_PLAN, (a) => (a.sheet ? { background: "clear" } : null));
  rejects((await sheetProject(badValue)).dir, "HARD-ASSETS-APPROVED");
});

test("changing background after G4 approval is refused by img", async () => {
  const p = await imgProject();
  const edited = withBg(PLAN, (a) => (a.id === "hero" ? { background: "transparent" } : null));
  put(p.dir, "assets/plan.yaml", YAML.stringify(edited));
  const res = await p.run({}, "img", "--ref", "mara-ref");
  assert.notEqual(res.exit, 0);
  assert.match(JSON.stringify(res.env.errors), /(HARD-ASSETS-APPROVED|HARD-GATES-RECORDED)/);
});
