import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cli, getManifest, getProject } from "./helpers/fixture.mjs";
import { sheetProject, ROOSTER_PLAN } from "./helpers/img.mjs";
import { hasFfmpeg } from "./helpers/media.mjs";
import { sha256File } from "../src/hash.mjs";
import { loadPlan } from "../src/img/plan.mjs";
import { checkCellAlpha, sheetLayout } from "../src/img/sheet.mjs";

const t = hasFfmpeg ? test : test.skip;
const generateAndApproveRef = async (p, refId = "rooster-ref") => {
  const gen = await p.run({}, "img", "--ref", refId);
  assert.equal(gen.exit, 0, JSON.stringify(gen.env.errors));
  assert.equal((await cli(p.cwd, "gate", "G5r", "approve", "--quote", "refs ok")).exit, 0);
};

// 1. Plan validation
test("PROC-POSE-SHEET: plan validation rejects invalid sheet definitions with HARD_NOT_RUN", async () => {
  // group of 1
  const plan1 = {
    assets: [
      { id: "ref1", kind: "ref", prompt: "ref", framing: "full", size: "600x600" },
      { id: "p1", kind: "img", sheet: "grp", prompt: "p1", framing: "full", size: "600x600", refs: ["ref1"], required_px: { w: 500, h: 500 } },
    ],
  };
  const p1 = await sheetProject(plan1);
  assert.throws(() => loadPlan(p1.dir), (err) => err.code === "HARD_NOT_RUN" && err.rule === "PROC-POSE-SHEET");

  // group of 5
  const plan5 = {
    assets: [
      { id: "ref1", kind: "ref", prompt: "ref", framing: "full", size: "600x600" },
      { id: "p1", kind: "img", sheet: "grp", prompt: "p1", framing: "full", size: "600x600", refs: ["ref1"], required_px: { w: 500, h: 500 } },
      { id: "p2", kind: "img", sheet: "grp", prompt: "p2", framing: "full", size: "600x600", refs: ["ref1"], required_px: { w: 500, h: 500 } },
      { id: "p3", kind: "img", sheet: "grp", prompt: "p3", framing: "full", size: "600x600", refs: ["ref1"], required_px: { w: 500, h: 500 } },
      { id: "p4", kind: "img", sheet: "grp", prompt: "p4", framing: "full", size: "600x600", refs: ["ref1"], required_px: { w: 500, h: 500 } },
      { id: "p5", kind: "img", sheet: "grp", prompt: "p5", framing: "full", size: "600x600", refs: ["ref1"], required_px: { w: 500, h: 500 } },
    ],
  };
  const p5 = await sheetProject(plan5);
  assert.throws(() => loadPlan(p5.dir), (err) => err.code === "HARD_NOT_RUN" && err.rule === "PROC-POSE-SHEET");

  // mismatched refs
  const planRefsMismatch = {
    assets: [
      { id: "ref1", kind: "ref", prompt: "ref", framing: "full", size: "600x600" },
      { id: "ref2", kind: "ref", prompt: "ref2", framing: "full", size: "600x600" },
      { id: "p1", kind: "img", sheet: "grp", prompt: "p1", framing: "full", size: "600x600", refs: ["ref1"], required_px: { w: 500, h: 500 } },
      { id: "p2", kind: "img", sheet: "grp", prompt: "p2", framing: "full", size: "600x600", refs: ["ref2"], required_px: { w: 500, h: 500 } },
    ],
  };
  const pMismatch = await sheetProject(planRefsMismatch);
  assert.throws(() => loadPlan(pMismatch.dir), (err) => err.code === "HARD_NOT_RUN" && err.rule === "PROC-POSE-SHEET");

  // empty refs
  const planEmptyRefs = {
    assets: [
      { id: "p1", kind: "img", sheet: "grp", prompt: "p1", framing: "full", size: "600x600", refs: [], required_px: { w: 500, h: 500 } },
      { id: "p2", kind: "img", sheet: "grp", prompt: "p2", framing: "full", size: "600x600", refs: [], required_px: { w: 500, h: 500 } },
    ],
  };
  const pEmpty = await sheetProject(planEmptyRefs);
  assert.throws(() => loadPlan(pEmpty.dir), (err) => err.code === "HARD_NOT_RUN" && err.rule === "PROC-POSE-SHEET");

  // mismatched size
  const planMismatchedSize = {
    assets: [
      { id: "ref1", kind: "ref", prompt: "ref", framing: "full", size: "600x600" },
      { id: "p1", kind: "img", sheet: "grp", prompt: "p1", framing: "full", size: "600x600", refs: ["ref1"], required_px: { w: 500, h: 500 } },
      { id: "p2", kind: "img", sheet: "grp", prompt: "p2", framing: "full", size: "800x800", refs: ["ref1"], required_px: { w: 500, h: 500 } },
    ],
  };
  const pSize = await sheetProject(planMismatchedSize);
  assert.throws(() => loadPlan(pSize.dir), (err) => err.code === "HARD_NOT_RUN" && err.rule === "PROC-POSE-SHEET");

  // kind: ref with sheet
  const planRefWithSheet = {
    assets: [
      { id: "ref1", kind: "ref", sheet: "grp", prompt: "ref", framing: "full", size: "600x600" },
      { id: "p1", kind: "img", sheet: "grp", prompt: "p1", framing: "full", size: "600x600", refs: ["ref1"], required_px: { w: 500, h: 500 } },
    ],
  };
  const pRefSheet = await sheetProject(planRefWithSheet);
  assert.throws(() => loadPlan(pRefSheet.dir), (err) => err.code === "HARD_NOT_RUN" && err.rule === "PROC-POSE-SHEET");
});

// 2. Happy path
t("PROC-POSE-SHEET: happy path generates 4 cutout assets from 1 sheet image", async () => {
  const p = await sheetProject();
  await generateAndApproveRef(p);
  const callsBefore = p.calls().length;
  const r = await p.run({ FAKE_CODEX_SIZE: "1200x1200" }, "img", "--batch", "rooster-crow");
  assert.equal(r.exit, 0, JSON.stringify(r.env.errors));
  const sheetCalls = p.calls().slice(callsBefore);
  assert.equal(sheetCalls.length, 1);
  const codexCall = sheetCalls[0];
  const promptArg = codexCall.argv.at(-1);
  assert.match(promptArg, /2 columns and 2 rows/);
  assert.match(promptArg, /CELL 1:/);
  assert.match(promptArg, /CELL 4:/);

  const manifest = getManifest(p.dir);
  const entries = manifest.assets.filter((a) => a.kind === "img");
  assert.equal(entries.length, 4);
  const memberIds = ["rooster-stand", "rooster-crow", "rooster-sleep", "rooster-run"];
  for (let i = 0; i < 4; i++) {
    const entry = entries[i];
    assert.equal(entry.id, memberIds[i]);
    assert.equal(entry.status, "pending");
    assert.equal(entry.cell, i + 1);
    assert.equal(entry.w, 600);
    assert.equal(entry.h, 600);
    const absPath = join(p.dir, entry.path);
    assert.ok(existsSync(absPath));
    assert.equal(entry.sha256, sha256File(absPath));
    assert.ok(entry.sheet);
    const sheetPath = join(p.dir, entry.sheet);
    assert.ok(existsSync(sheetPath));
    assert.equal(entry.sheet_sha256, sha256File(sheetPath));
  }
  const npxCalls = p.npxCalls();
  assert.equal(npxCalls.length, 4);
  for (const call of npxCalls) {
    assert.ok(call.argv.includes("remove-background"));
    assert.equal(call.telemetry_off, "1");
  }
  for (const entry of entries) {
    const buf = readFileSync(join(p.dir, entry.path));
    assert.equal(buf[25], 6); // RGBA
  }
});

// 3. Idempotent
t("PROC-RESUME-IDEMPOTENT: running the same sheet batch again makes no calls and returns existing assets", async () => {
  const p = await sheetProject();
  await generateAndApproveRef(p);
  const callsBefore = p.calls().length;
  const r1 = await p.run({ FAKE_CODEX_SIZE: "1200x1200" }, "img", "--batch", "rooster-crow");
  assert.equal(r1.exit, 0);
  assert.equal(p.calls().slice(callsBefore).length, 1);
  assert.equal(p.npxCalls().length, 4);

  const r2 = await p.run({ FAKE_CODEX_SIZE: "1200x1200" }, "img", "--batch", "rooster-crow");
  assert.equal(r2.exit, 0);
  assert.equal(p.calls().slice(callsBefore).length, 1, "no new codex call");
  assert.equal(p.npxCalls().length, 4, "no new npx call");
  assert.equal(r2.env.data.assets.length, 4);
  assert.deepEqual(r2.env.data.assets.map((a) => a.id), ["rooster-stand", "rooster-crow", "rooster-sleep", "rooster-run"]);
  assert.deepEqual(r2.env.data.assets.map((a) => a.sha256), r1.env.data.assets.map((a) => a.sha256));
});

// 4. Layout
t("PROC-POSE-SHEET layout: 2-member and 3-member groups format prompt and cells correctly", async () => {
  const plan2 = {
    assets: [
      { id: "duck-ref", kind: "ref", prompt: "A duck", framing: "full body", size: "600x600" },
      { id: "duck-swim", kind: "img", sheet: "duck", prompt: "Duck swimming", framing: "full body", size: "600x600", refs: ["duck-ref"], required_px: { w: 500, h: 500 } },
      { id: "duck-fly", kind: "img", sheet: "duck", prompt: "Duck flying", framing: "full body", size: "600x600", refs: ["duck-ref"], required_px: { w: 500, h: 500 } },
    ],
  };
  const p2 = await sheetProject(plan2);
  await generateAndApproveRef(p2, "duck-ref");
  const callsBefore2 = p2.calls().length;
  const r2 = await p2.run({ FAKE_CODEX_SIZE: "1200x600" }, "img", "--batch", "duck-swim");
  assert.equal(r2.exit, 0, JSON.stringify(r2.env.errors));
  assert.match(p2.calls().slice(callsBefore2)[0].argv.at(-1), /2 columns and 1 rows/);
  const entries2 = getManifest(p2.dir).assets.filter((a) => a.kind === "img");
  assert.equal(entries2.length, 2);
  assert.equal(entries2[0].w, 600);
  assert.equal(entries2[0].h, 600);

  const plan3 = {
    assets: [
      { id: "cat-ref", kind: "ref", prompt: "A cat", framing: "full body", size: "600x600" },
      { id: "cat-sit", kind: "img", sheet: "cat", prompt: "Cat sitting", framing: "full body", size: "600x600", refs: ["cat-ref"], required_px: { w: 500, h: 500 } },
      { id: "cat-walk", kind: "img", sheet: "cat", prompt: "Cat walking", framing: "full body", size: "600x600", refs: ["cat-ref"], required_px: { w: 500, h: 500 } },
      { id: "cat-sleep", kind: "img", sheet: "cat", prompt: "Cat sleeping", framing: "full body", size: "600x600", refs: ["cat-ref"], required_px: { w: 500, h: 500 } },
    ],
  };
  const p3 = await sheetProject(plan3);
  await generateAndApproveRef(p3, "cat-ref");
  const callsBefore3 = p3.calls().length;
  const r3 = await p3.run({ FAKE_CODEX_SIZE: "1200x1200" }, "img", "--batch", "cat-sit");
  assert.equal(r3.exit, 0, JSON.stringify(r3.env.errors));
  const prompt3 = p3.calls().slice(callsBefore3)[0].argv.at(-1);
  assert.match(prompt3, /2 columns and 2 rows/);
  assert.match(prompt3, /CELL 4: leave this cell empty background\./);
  const entries3 = getManifest(p3.dir).assets.filter((a) => a.kind === "img");
  assert.equal(entries3.length, 3);
});

// 5. Redo
t("GATE-PER-ITEM redo: redo on a sheet member regenerates only that member as 1x1 sheet", async () => {
  const p = await sheetProject();
  await generateAndApproveRef(p);
  await p.run({ FAKE_CODEX_SIZE: "1200x1200" }, "img", "--batch", "rooster-crow");
  const g5b = await cli(p.cwd, "gate", "G5b", "approve", "--quote", "all ok", "--scope", "asset:rooster-stand.v1,asset:rooster-crow.v1,asset:rooster-sleep.v1,asset:rooster-run.v1");
  assert.equal(g5b.exit, 0, JSON.stringify(g5b.env.errors));

  const callsBefore = p.calls().length;
  const redoRes = await p.run({ FAKE_CODEX_SIZE: "600x600" }, "img", "--batch", "rooster-crow", "--redo", "rooster-crow", "--note", "beak");
  assert.equal(redoRes.exit, 0, JSON.stringify(redoRes.env.errors));
  assert.equal(p.calls().length, callsBefore + 1);
  const redoPrompt = p.calls().at(-1).argv.at(-1);
  assert.match(redoPrompt, /1 columns and 1 rows/);

  const manifest = getManifest(p.dir);
  const crowV2 = manifest.assets.find((a) => a.id === "rooster-crow" && a.v === 2);
  assert.ok(crowV2);
  assert.equal(crowV2.status, "pending");
  assert.equal(crowV2.note, "beak");

  for (const id of ["rooster-stand", "rooster-sleep", "rooster-run"]) {
    const asset = manifest.assets.find((a) => a.id === id);
    assert.equal(asset.v, 1);
    assert.equal(asset.status, "approved");
  }
});

// 6. Cell checks (edge, empty, edge,ok)
t("HARD-SHEET-CELL, PROC-IMG-RETRY: edge and empty fail attempt and record blocked; edge,ok retries and succeeds", async () => {
  // Test edge
  {
    const p = await sheetProject();
    await generateAndApproveRef(p);
    const callsBefore = p.calls().length;
    const r = await p.run({ FAKE_CODEX_SIZE: "1200x1200", FAKE_NPX_RB_MODE: "edge" }, "img", "--batch", "rooster-crow");
    assert.notEqual(r.exit, 0);
    assert.equal(p.calls().slice(callsBefore).length, 3);
    assert.equal(r.env.errors[0].rule, "PROC-IMG-RETRY");
    assert.match(r.env.errors[0].message, /touches the cell edge/);
    const project = getProject(p.dir);
    assert.ok(project.blocked.some((b) => b.step === "img:sheet-rooster"));
  }
  // Test empty
  {
    const p = await sheetProject();
    await generateAndApproveRef(p);
    const callsBefore = p.calls().length;
    const r = await p.run({ FAKE_CODEX_SIZE: "1200x1200", FAKE_NPX_RB_MODE: "empty" }, "img", "--batch", "rooster-crow");
    assert.notEqual(r.exit, 0);
    assert.equal(p.calls().slice(callsBefore).length, 3);
    assert.equal(r.env.errors[0].rule, "PROC-IMG-RETRY");
    assert.match(r.env.errors[0].message, /is empty after background removal/);
    const project = getProject(p.dir);
    assert.ok(project.blocked.some((b) => b.step === "img:sheet-rooster"));
  }
  // Test edge,ok
  {
    const p = await sheetProject();
    await generateAndApproveRef(p);
    const callsBefore = p.calls().length;
    const r = await p.run({ FAKE_CODEX_SIZE: "1200x1200", FAKE_NPX_RB_MODE: "edge,ok" }, "img", "--batch", "rooster-crow");
    assert.equal(r.exit, 0, JSON.stringify(r.env.errors));
    assert.equal(p.calls().slice(callsBefore).length, 2);
    assert.equal(getManifest(p.dir).assets.filter((a) => a.kind === "img").length, 4);
  }
});

// 7. Cutout tool fallback
t("PROC-CUTOUT-FALLBACK: hyperframes failure blocks immediately without retrying codex", async () => {
  const p = await sheetProject();
  await generateAndApproveRef(p);
  const callsBefore = p.calls().length;
  const r = await p.run({ FAKE_CODEX_SIZE: "1200x1200", FAKE_NPX_RB_MODE: "fail" }, "img", "--batch", "rooster-crow");
  assert.notEqual(r.exit, 0);
  assert.equal(p.calls().slice(callsBefore).length, 1, "tool failure is not retried");
  assert.equal(r.env.errors[0].rule, "PROC-CUTOUT-FALLBACK");
  assert.match(r.env.errors[0].message, /hyperframes remove-background failed/);
  assert.equal(getManifest(p.dir).assets.filter((a) => a.kind === "img").length, 0);
});

// 8. Refs gate
t("HARD-REFS-APPROVED: sheet batch with unapproved ref exits with REFS_NOT_APPROVED and no codex call", async () => {
  const p = await sheetProject();
  const r = await p.run({}, "img", "--batch", "rooster-crow");
  assert.equal(r.exit, 6);
  assert.equal(r.env.code, "REFS_NOT_APPROVED");
  assert.equal(p.calls().length, 0);
});

// 9. Crash adoption
t("PROC-RESUME-IDEMPOTENT: interrupted run leaves usable sheet image which is adopted on resume", async () => {
  const p = await sheetProject();
  await generateAndApproveRef(p);
  const callsBefore = p.calls().length;
  const r1 = await p.run({ FAKE_CODEX_SIZE: "1200x1200", FAKE_NPX_RB_MODE: "fail" }, "img", "--batch", "rooster-crow");
  assert.notEqual(r1.exit, 0);
  assert.equal(p.calls().slice(callsBefore).length, 1);

  const r2 = await p.run({ FAKE_CODEX_SIZE: "1200x1200", FAKE_NPX_RB_MODE: "ok" }, "img", "--batch", "rooster-crow");
  assert.equal(r2.exit, 0, JSON.stringify(r2.env.errors));
  assert.equal(p.calls().slice(callsBefore).length, 1, "codex was not called again; adopted existing sheet image");
  assert.ok(r2.env.advice.some((a) => a.rule === "PROC-RESUME-IDEMPOTENT"));
  assert.equal(getManifest(p.dir).assets.filter((a) => a.kind === "img").length, 4);
});

// 10. Unit tests
test("sheetLayout calculates grid dimensions for n=1..4", () => {
  assert.deepEqual(sheetLayout(1), { cols: 1, rows: 1 });
  assert.deepEqual(sheetLayout(2), { cols: 2, rows: 1 });
  assert.deepEqual(sheetLayout(3), { cols: 2, rows: 2 });
  assert.deepEqual(sheetLayout(4), { cols: 2, rows: 2 });
});

test("checkCellAlpha analyzes fill and edge correctly", () => {
  const w = 10;
  const h = 10;
  const emptyBuf = Buffer.alloc(w * h, 0);
  const rEmpty = checkCellAlpha(emptyBuf, w, h);
  assert.equal(rEmpty.fill, 0);
  assert.equal(rEmpty.edge, 0);
  assert.match(rEmpty.problem, /is empty after background removal/);

  const okBuf = Buffer.alloc(w * h, 0);
  for (let y = 2; y < 8; y++) {
    for (let x = 2; x < 8; x++) {
      okBuf[y * w + x] = 255;
    }
  }
  const rOk = checkCellAlpha(okBuf, w, h);
  assert.equal(rOk.fill, 0.36);
  assert.equal(rOk.edge, 0);
  assert.equal(rOk.problem, null);

  const fullBuf = Buffer.alloc(w * h, 255);
  const rEdge = checkCellAlpha(fullBuf, w, h, { k: 2, id: "pose-b" });
  assert.equal(rEdge.fill, 1);
  assert.equal(rEdge.edge, 1);
  assert.match(rEdge.problem, /cell 2 \(pose-b\) touches the cell edge/);
});

// 11. Redo crash adoption isolation
t("PROC-RESUME-IDEMPOTENT, GATE-PER-ITEM: consecutive redos make separate codex calls and do not adopt prior redo sheet", async () => {
  const p = await sheetProject();
  await generateAndApproveRef(p);
  await p.run({ FAKE_CODEX_SIZE: "1200x1200" }, "img", "--batch", "rooster-crow");
  const g5b = await cli(p.cwd, "gate", "G5b", "approve", "--quote", "all ok", "--scope", "asset:rooster-stand.v1,asset:rooster-crow.v1,asset:rooster-sleep.v1,asset:rooster-run.v1");
  assert.equal(g5b.exit, 0);

  const callsBefore = p.calls().length;
  const r1 = await p.run({ FAKE_CODEX_SIZE: "600x600" }, "img", "--batch", "rooster-crow", "--redo", "rooster-crow", "--note", "note a");
  assert.equal(r1.exit, 0, JSON.stringify(r1.env.errors));
  assert.equal(p.calls().length, callsBefore + 1, "first redo makes a codex call");

  const r2 = await p.run({ FAKE_CODEX_SIZE: "600x600" }, "img", "--batch", "rooster-crow", "--redo", "rooster-crow", "--note", "note b");
  assert.equal(r2.exit, 0, JSON.stringify(r2.env.errors));
  assert.equal(p.calls().length, callsBefore + 2, "second redo makes another codex call");

  const manifest = getManifest(p.dir);
  const crowV2 = manifest.assets.find((a) => a.id === "rooster-crow" && a.v === 2);
  const crowV3 = manifest.assets.find((a) => a.id === "rooster-crow" && a.v === 3);
  assert.ok(crowV2, "rooster-crow v2 exists");
  assert.ok(crowV3, "rooster-crow v3 exists");
  assert.equal(crowV2.note, "note a");
  assert.equal(crowV3.note, "note b");
});
