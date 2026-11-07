// test/img-native-sheet.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { cli, cliWith, getManifest, put } from "./helpers/fixture.mjs";
import { sheetProject, ROOSTER_PLAN } from "./helpers/img.mjs";
import { hasFfmpeg } from "./helpers/media.mjs";

const t = hasFfmpeg ? test : test.skip;
const plan = (n, background = "transparent") => ({ assets: ROOSTER_PLAN.assets.filter((a) => a.kind === "ref" || ROOSTER_PLAN.assets.filter((x) => x.sheet).indexOf(a) < n)
  .map((a) => (a.sheet ? { ...a, ...(background ? { background } : {}) } : a)) });
const refApproved = async (p) => {
  assert.equal((await p.run({}, "img", "--ref", "rooster-ref")).exit, 0);
  assert.equal((await cli(p.cwd, "gate", "G5r", "approve", "--quote", "refs ok")).exit, 0);
};
const env = (mode, extra = {}) => ({ FAKE_CODEX_MODES: mode, FAKE_CODEX_SIZE: "1200x1200", ...extra });
const removerCalls = (p) => p.npxCalls().filter((c) => c.argv.includes("remove-background")).length;
const alphaOf = (file) => {
  const r = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-vf", "format=rgba,alphaextract", "-f", "rawvideo", "-"], { maxBuffer: 1 << 28 });
  return r.stdout;
};
const gen = (p, ids = "rooster-stand") => p.run(env("native"), "img", "--batch", ids);

for (const n of [2, 3, 4]) {
  t(`native sheet of ${n}: no remover, alpha kept, provenance recorded`, async () => {
    const p = await sheetProject(plan(n));
    await refApproved(p);
    const res = await p.run(env("native"), "img", "--batch", "rooster-stand");
    assert.equal(res.exit, 0, JSON.stringify(res.env.errors));
    assert.equal(removerCalls(p), 0);
    const entries = getManifest(p.dir).assets.filter((a) => a.kind === "img");
    assert.equal(entries.length, n);
    for (const e of entries) {
      assert.equal(e.cutout_method, "native");
      assert.equal(e.transparent_requested, true);
      assert.equal(e.transparent_flag, true);
      assert.deepEqual(e.integrity_flags, []);
      assert.match(e.codex_version, /codex-cli/);
      assert.ok(e.alpha_metrics.transparent > 0.2);
      assert.ok(existsSync(join(p.dir, e.review_composite)));
      const a = alphaOf(join(p.dir, e.path));
      assert.ok(a.includes(0) && a.includes(252), "committed PNG keeps real alpha");
    }
  });
}

t("opaque sheet falls back per cell to the remover and is flagged, without regenerating", async () => {
  const p = await sheetProject(plan(2));
  await refApproved(p);
  const res = await p.run(env("ok"), "img", "--batch", "rooster-stand");
  assert.equal(res.exit, 0, JSON.stringify(res.env.errors));
  assert.equal(removerCalls(p), 2);
  assert.equal(p.calls().length, 2, "one ref generation plus one sheet, no regeneration");
  for (const e of getManifest(p.dir).assets.filter((a) => a.kind === "img")) {
    assert.equal(e.cutout_method, "hyperframes-fallback");
    assert.ok(e.integrity_flags.includes("hyperframes_fallback"));
    assert.equal(e.transparent_flag, false);
  }
});

t("suspect cells spend retries, then BLOCK naming the cell and reason per attempt", async () => {
  const p = await sheetProject(plan(2));
  await refApproved(p);
  const res = await p.run(env("native-edge"), "img", "--batch", "rooster-stand");
  assert.notEqual(res.exit, 0);
  const msg = JSON.stringify(res.env.errors);
  assert.match(msg, /PROC-IMG-RETRY/);
  assert.match(msg, /attempt 1: cell 1 \(rooster-stand\) edge/);
  assert.match(msg, /attempt 3: cell 1 \(rooster-stand\) edge/);
  assert.equal(p.calls().length, 1 + 3);
  assert.equal(removerCalls(p), 0);
});

t("remover crash on a fallback cell blocks immediately and commits nothing", async () => {
  const p = await sheetProject(plan(2));
  await refApproved(p);
  const res = await p.run(env("ok", { FAKE_NPX_RB_MODE: "fail" }), "img", "--batch", "rooster-stand");
  assert.notEqual(res.exit, 0);
  assert.match(JSON.stringify(res.env.errors), /PROC-CUTOUT-FALLBACK/);
  assert.equal(getManifest(p.dir).assets.filter((a) => a.kind === "img").length, 0);
});

t("fallback output with a hard failure (edge) is BLOCKED, not committed", async () => {
  const p = await sheetProject(plan(2));
  await refApproved(p);
  const res = await p.run(env("ok", { FAKE_NPX_RB_MODE: "edge" }), "img", "--batch", "rooster-stand");
  assert.notEqual(res.exit, 0);
  assert.match(JSON.stringify(res.env.errors), /BLOCKED|PROC-CUTOUT-FALLBACK/);
  assert.equal(getManifest(p.dir).assets.filter((a) => a.kind === "img").length, 0);
});

t("legacy plan (no background) still runs the remover on every cell and records no cutout fields", async () => {
  const p = await sheetProject(plan(2, null));
  await refApproved(p);
  const res = await p.run(env("ok"), "img", "--batch", "rooster-stand");
  assert.equal(res.exit, 0, JSON.stringify(res.env.errors));
  assert.equal(removerCalls(p), 2);
  for (const c of p.npxCalls().filter((x) => x.argv.includes("remove-background"))) {
    assert.deepEqual(c.argv.slice(0, 3), ["--yes", "hyperframes@0.8.223", "remove-background"], "legacy remover argv prefix");
    assert.match(c.argv[3], /cell-\d\.png$/);
    assert.equal(c.argv[4], "-o");
    assert.match(c.argv[5], /cut-\d\.png$/);
    assert.equal(c.telemetry_off, "1");
  }
  for (const e of getManifest(p.dir).assets.filter((a) => a.kind === "img")) assert.equal(e.cutout_method, undefined);
});

t("redo of one pose goes through the native flow as a 1x1 sheet", async () => {
  const p = await sheetProject(plan(2));
  await refApproved(p);
  assert.equal((await p.run(env("native"), "img", "--batch", "rooster-stand")).exit, 0);
  const res = await p.run(env("native", { FAKE_CODEX_SIZE: "600x600" }), "img", "--batch", "rooster-crow", "--redo", "rooster-crow", "--note", "arm cut off");
  assert.equal(res.exit, 0, JSON.stringify(res.env.errors));
  const crow = getManifest(p.dir).assets.filter((a) => a.id === "rooster-crow");
  assert.deepEqual(crow.map((a) => a.v), [1, 2]);
  assert.equal(crow[1].cutout_method, "native");
  assert.equal(removerCalls(p), 0);
});

t("a black figure on a transparent sheet is not mistaken for a blank image", async () => {
  const p = await sheetProject(plan(2));
  await refApproved(p);
  const res = await p.run(env("native-dark"), "img", "--batch", "rooster-stand");
  assert.equal(res.exit, 0, JSON.stringify(res.env.errors));
  assert.equal(p.calls().length, 2, "one ref generation plus one sheet, no retry");
  assert.equal(getManifest(p.dir).assets.find((a) => a.id === "rooster-stand").cutout_method, "native");
});

t("transparent_flag is provenance only: true, false and null yield the same verdict and flags", async () => {
  const seen = [];
  for (const extra of [{}, { FAKE_CODEX_FLAG: "false" }, { FAKE_CODEX_NO_SAVED: "1" }]) {
    const p = await sheetProject(plan(2));
    await refApproved(p);
    const res = await p.run(env("native", extra), "img", "--batch", "rooster-stand");
    assert.equal(res.exit, 0, JSON.stringify(res.env.errors));
    const e = getManifest(p.dir).assets.find((a) => a.id === "rooster-stand");
    seen.push({ flag: e.transparent_flag, method: e.cutout_method, flags: e.integrity_flags, removed: removerCalls(p) });
  }
  assert.deepEqual(seen.map((x) => x.flag), [true, false, null]);
  for (const x of seen) assert.deepEqual({ method: x.method, flags: x.flags, removed: x.removed }, { method: "native", flags: [], removed: 0 });
});

t("no bound session item records a null flag, never a guess", async () => {
  const p = await sheetProject(plan(2));
  await refApproved(p);
  const res = await p.run(env("native", { FAKE_CODEX_NO_SAVED: "1" }), "img", "--batch", "rooster-stand");
  assert.equal(res.exit, 0, JSON.stringify(res.env.errors));
  assert.equal(getManifest(p.dir).assets.find((a) => a.id === "rooster-stand").transparent_flag, null);
});

// ffmpeg wrapper that fails only the review-composite call, to leave out.png and meta.json behind like a crash would.
const flakyFfmpeg = () => {
  const f = join(mkdtempSync(join(tmpdir(), "flaky-ffmpeg-")), "ffmpeg.mjs");
  writeFileSync(f, `import { spawnSync } from "node:child_process";
if (process.argv.includes("-filter_complex") && process.env.FAKE_FFMPEG_FAIL_COMPOSITE) process.exit(1);
process.exit(spawnSync("ffmpeg", process.argv.slice(2), { stdio: "inherit" }).status ?? 1);
`);
  return [process.execPath, f];
};
const runWithFfmpeg = (p, e, ...args) => { const c = p.ctxFor(e); c.tools.ffmpeg = flakyFfmpeg(); return cliWith(p.cwd, c, ...args); };

t("adoption reads generation facts from meta.json after the session log is gone, and does not regenerate", async () => {
  const p = await sheetProject(plan(2));
  await refApproved(p);
  const crashed = await runWithFfmpeg(p, env("native", { FAKE_FFMPEG_FAIL_COMPOSITE: "1" }), "img", "--batch", "rooster-stand");
  assert.notEqual(crashed.exit, 0);
  const callsAfterCrash = p.calls().length;
  rmSync(join(p.home, "sessions"), { recursive: true, force: true });
  const again = await runWithFfmpeg(p, env("native"), "img", "--batch", "rooster-stand");
  assert.equal(again.exit, 0, JSON.stringify(again.env.errors));
  assert.equal(p.calls().length, callsAfterCrash, "adopted, not regenerated");
  const e = getManifest(p.dir).assets.find((a) => a.id === "rooster-stand");
  assert.equal(e.transparent_flag, true, "flag came from meta.json");
  assert.equal(e.cutout_method, "native", "verdict recomputed from pixels after adoption");
});

t("a sheet made under another background intent is never adopted", async () => {
  const p = await sheetProject(plan(2));
  await refApproved(p);
  const crashed = await runWithFfmpeg(p, env("native", { FAKE_FFMPEG_FAIL_COMPOSITE: "1" }), "img", "--batch", "rooster-stand");
  assert.notEqual(crashed.exit, 0);
  const before = p.calls().length;
  // Switch the plan to legacy intent and re-approve G4 (copy the G4 re-approval setup from test/img.test.mjs if more is needed).
  put(p.dir, "assets/plan.yaml", YAML.stringify(plan(2, null)));
  assert.equal((await cli(p.cwd, "gate", "G4", "approve", "--quote", "intent changed")).exit, 0);
  const res = await p.run(env("ok"), "img", "--batch", "rooster-stand");
  assert.equal(res.exit, 0, JSON.stringify(res.env.errors));
  assert.equal(p.calls().length, before + 1, "regenerated under the new intent");
});
