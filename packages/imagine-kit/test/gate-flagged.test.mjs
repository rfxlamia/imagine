// test/gate-flagged.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { cli, getManifest } from "./helpers/fixture.mjs";
import { sheetProject, ROOSTER_PLAN } from "./helpers/img.mjs";
import { hasFfmpeg } from "./helpers/media.mjs";

const t = hasFfmpeg ? test : test.skip;
const plan = { assets: ROOSTER_PLAN.assets.filter((a, i) => a.kind === "ref" || i <= 2).map((a) => (a.sheet ? { ...a, background: "transparent" } : a)) };

async function flaggedProject() {
  const p = await sheetProject(plan);
  assert.equal((await p.run({}, "img", "--ref", "rooster-ref")).exit, 0);
  assert.equal((await cli(p.cwd, "gate", "G5r", "approve", "--quote", "refs ok")).exit, 0);
  // opaque sheet -> every pose is a fallback cutout -> flagged hyperframes_fallback
  assert.equal((await p.run({ FAKE_CODEX_MODES: "ok", FAKE_CODEX_SIZE: "1200x600" }, "img", "--batch", "rooster-stand")).exit, 0);
  return p;
}

t("unscoped G5b approve is refused while flagged items exist", async () => {
  const p = await flaggedProject();
  const res = await cli(p.cwd, "gate", "G5b", "approve", "--quote", "all good");
  assert.notEqual(res.exit, 0);
  const text = JSON.stringify(res.env.errors);
  assert.match(text, /rooster-stand\.v1/);
  assert.match(text, /hyperframes_fallback/);
});

t("scoped approve naming a flagged item is accepted and leaves the other flagged item pending", async () => {
  const p = await flaggedProject();
  const res = await cli(p.cwd, "gate", "G5b", "approve", "--scope", "rooster-stand.v1", "--quote", "looked at this composite");
  assert.equal(res.exit, 0, JSON.stringify(res.env.errors));
  const by = Object.fromEntries(getManifest(p.dir).assets.filter((a) => a.kind === "img").map((a) => [a.id, a.status]));
  assert.equal(by["rooster-stand"], "approved");
  assert.equal(by["rooster-crow"], "pending");
});

t("scoped approve naming every flagged item is accepted", async () => {
  const p = await flaggedProject();
  const ok = await cli(p.cwd, "gate", "G5b", "approve", "--scope", "rooster-stand.v1,rooster-crow.v1", "--quote", "looked at both composites");
  assert.equal(ok.exit, 0, JSON.stringify(ok.env.errors));
});

t("reject is never blocked by flagged items", async () => {
  const p = await flaggedProject();
  const rej = await cli(p.cwd, "gate", "G5b", "reject", "--quote", "redo");
  assert.equal(rej.exit, 0, JSON.stringify(rej.env.errors));
});

t("an unflagged project approves without --scope exactly as before", async () => {
  const p = await sheetProject(plan);
  assert.equal((await p.run({}, "img", "--ref", "rooster-ref")).exit, 0);
  assert.equal((await cli(p.cwd, "gate", "G5r", "approve", "--quote", "refs ok")).exit, 0);
  assert.equal((await p.run({ FAKE_CODEX_MODES: "native", FAKE_CODEX_SIZE: "1200x600" }, "img", "--batch", "rooster-stand")).exit, 0);
  const res = await cli(p.cwd, "gate", "G5b", "approve", "--quote", "all good");
  assert.equal(res.exit, 0, JSON.stringify(res.env.errors));
});
