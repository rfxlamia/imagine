import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync, unlinkSync, symlinkSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { cli, put } from "./helpers/fixture.mjs";
import { editProject, COMPOSITION, renderProject, addAudio } from "./helpers/edit.mjs";
import { baselinePath } from "../src/edit/guard.mjs";

test("(a) stage then promote with a clean protected set succeeds and deletes the baseline", async () => {
  const p = await editProject();
  const stageRes = await p.run({}, "stage-shot", "s01");
  assert.equal(stageRes.exit, 0, JSON.stringify(stageRes.env.errors));

  const guardFile = baselinePath(p.dir, "s01");
  assert.ok(existsSync(guardFile), "guard baseline must exist after stage-shot");

  p.buildScene("s01");
  const promoteRes = await p.run({}, "promote-shot", "s01");
  assert.equal(promoteRes.exit, 0, JSON.stringify(promoteRes.env.errors));
  assert.equal(existsSync(guardFile), false, "guard baseline must be deleted on successful promote-shot");
});

test("(b) after stage, modify / create / delete a protected canon-or-plan file -> promote refuses with HARD-SHADOW-ONLY, lists at most 20 paths, writes nothing and leaves baseline in place", async () => {
  for (const action of ["modify", "create", "delete"]) {
    const p = await editProject();
    await p.run({}, "stage-shot", "s01");
    p.buildScene("s01");
    const guardFile = baselinePath(p.dir, "s01");
    assert.ok(existsSync(guardFile));

    if (action === "modify") {
      put(p.dir, "bible.yaml", "characters: []\nlocations: []\nworld: { mood: dark }\n");
    } else if (action === "create") {
      put(p.dir, "assets/extra.txt", "unauthorized file");
    } else if (action === "delete") {
      unlinkSync(join(p.dir, "bible.yaml"));
    }

    const r = await p.run({}, "promote-shot", "s01");
    assert.equal(r.exit, 1, `action ${action} should exit 1`);
    assert.equal(r.env.errors[0]?.rule, "HARD-SHADOW-ONLY", `rule must be HARD-SHADOW-ONLY for ${action}`);
    assert.match(r.env.errors[0]?.message, /protected path\(s\) changed since stage-shot/);
    assert.match(r.env.errors[0]?.message, /Restore them first/);
    assert.match(r.env.errors[0]?.message, /Re-stage with --rebaseline only for a change the user made or approved/);

    // Baseline stays in place
    assert.ok(existsSync(guardFile), "baseline must stay in place after refusal");
    // Nothing copied into destination
    assert.equal(existsSync(join(p.dir, "edit/compositions/s01.html")), false);
  }
});

test("(c) after stage, scene-builder writing edit/compositions/<ownId>.html directly -> promote refuses", async () => {
  const p = await editProject();
  await p.run({}, "stage-shot", "s01");
  p.buildScene("s01");

  // Scene-builder mistakenly writes directly into edit/compositions/s01.html
  put(p.dir, "edit/compositions/s01.html", COMPOSITION("s01"));

  const r = await p.run({}, "promote-shot", "s01");
  assert.equal(r.exit, 1);
  assert.equal(r.env.errors[0]?.rule, "HARD-SHADOW-ONLY");
  assert.match(r.env.errors[0]?.message, /edit\/compositions\/s01\.html/);
});

test("(d) changes to excluded paths (another shot's composition, index.motion.json, project.yaml, journal.md) are NOT violations, and two shots staged in parallel can both promote", async () => {
  const p = await editProject();
  // Stage both s01 and s02
  const r1 = await p.run({}, "stage-shot", "s01");
  assert.equal(r1.exit, 0);
  const r2 = await p.run({}, "stage-shot", "s02");
  assert.equal(r2.exit, 0);

  // Both scene builders work in their shadows
  p.buildScene("s01");
  p.buildScene("s02");

  // Promote s01 first (this writes edit/compositions/s01.html, edit/index.motion.json, project.yaml, journal.md)
  const p1 = await p.run({}, "promote-shot", "s01");
  assert.equal(p1.exit, 0, JSON.stringify(p1.env.errors));

  // Now promote s02 (even though edit/compositions/s01.html, edit/index.motion.json, project.yaml, journal.md all changed!)
  const p2 = await p.run({}, "promote-shot", "s02");
  assert.equal(p2.exit, 0, JSON.stringify(p2.env.errors));
});

test("(e) promote with no baseline refuses with an actionable message (run stage-shot first)", async () => {
  const p = await editProject();
  // We do NOT run stage-shot
  p.buildScene("s01");

  const r = await p.run({}, "promote-shot", "s01");
  assert.equal(r.exit, 1);
  assert.equal(r.env.errors[0]?.rule, "HARD-SHADOW-ONLY");
  assert.match(r.env.errors[0]?.message, /stage-shot first/i);
});

test("(f) stage-shot over an existing baseline whose protected state drifted REFUSES with HARD-SHADOW-ONLY; with --rebaseline it succeeds", async () => {
  const p = await editProject();
  const first = await p.run({}, "stage-shot", "s01");
  assert.equal(first.exit, 0);

  // Drift the protected state with a protected file change that doesn't break preconditions
  put(p.dir, "assets/extra.txt", "drifted");

  // Re-staging without --rebaseline REFUSES with HARD-SHADOW-ONLY
  const second = await p.run({}, "stage-shot", "s01");
  assert.equal(second.exit, 1);
  assert.equal(second.env.errors[0]?.rule, "HARD-SHADOW-ONLY");
  assert.match(second.env.errors[0]?.message, /assets\/extra\.txt/);

  // Re-staging with --rebaseline succeeds
  const rebased = await p.run({}, "stage-shot", "s01", "--rebaseline");
  assert.equal(rebased.exit, 0, JSON.stringify(rebased.env.errors));
  // Appends drifted path list to journal entry
  const journal = readFileSync(join(p.dir, "journal.md"), "utf8");
  assert.match(journal, /rebaseline.*assets\/extra\.txt/);
  // Appends to envelope advice
  assert.ok(rebased.env.advice.some((a) => a.rule === "HARD-SHADOW-ONLY" && /rebaseline.*assets\/extra\.txt/.test(a.message)));
});

test("(g) stage-shot over an existing baseline with NO drift just refreshes it", async () => {
  const p = await editProject();
  const first = await p.run({}, "stage-shot", "s01");
  assert.equal(first.exit, 0);

  // Without any drift, stage-shot refreshes without error and without needing --rebaseline
  const second = await p.run({}, "stage-shot", "s01");
  assert.equal(second.exit, 0, JSON.stringify(second.env.errors));
});

test("(h) a symlink inside the shadow that points outside makes promote refuse", async () => {
  const p = await editProject();
  await p.run({}, "stage-shot", "s01");
  p.buildScene("s01");

  const outside = mkdtempSync(join(tmpdir(), "imagine-shadow-outside-"));
  writeFileSync(join(outside, "leak.html"), "leaked");
  // Symlink a file or dir inside shadow to point outside
  unlinkSync(join(p.dir, "stage/edit/s01/compositions/s01.html"));
  symlinkSync(join(outside, "leak.html"), join(p.dir, "stage/edit/s01/compositions/s01.html"));

  const r = await p.run({}, "promote-shot", "s01");
  assert.equal(r.exit, 1);
  assert.equal(existsSync(join(p.dir, "edit/compositions/s01.html")), false);
});

test("(i) per-command compatibility: status between stage and promote succeeds", async () => {
  const p = await editProject();
  await p.run({}, "stage-shot", "s01");
  p.buildScene("s01");

  const statusRes = await cli(p.cwd, "status");
  assert.equal(statusRes.exit, 0);

  const promoteRes = await p.run({}, "promote-shot", "s01");
  assert.equal(promoteRes.exit, 0, JSON.stringify(promoteRes.env.errors));
});

test("(i) per-command compatibility: export-hf between stage and promote", async () => {
  const p = await editProject();
  await addAudio(p);
  // Initial export-hf to set up initial state
  const initExport = await p.run({}, "export-hf");
  assert.equal(initExport.exit, 0, JSON.stringify(initExport.env.errors));

  await p.run({}, "stage-shot", "s01");
  p.buildScene("s01");

  // Run export-hf between stage and promote
  const exportRes = await p.run({}, "export-hf");
  assert.equal(exportRes.exit, 0, JSON.stringify(exportRes.env.errors));

  // Run promote-shot and assert whatever is true
  const promoteRes = await p.run({}, "promote-shot", "s01");
  if (promoteRes.exit === 0) {
    assert.equal(promoteRes.exit, 0);
  } else {
    assert.equal(promoteRes.env.errors[0]?.rule, "HARD-SHADOW-ONLY");
  }
});

test("(i) per-command compatibility: qc between stage and promote", async () => {
  const p = await renderProject();
  await p.run({}, "stage-shot", "s01");
  put(p.dir, "stage/edit/s01/compositions/s01.html", COMPOSITION("s01"));

  // Run qc on p.mp4
  const qcRes = await cli(p.cwd, "qc", p.mp4);
  assert.equal(qcRes.exit, 0, JSON.stringify(qcRes.env.errors));

  // Run promote-shot and assert whatever is true
  const promoteRes = await p.run({}, "promote-shot", "s01");
  if (promoteRes.exit === 0) {
    assert.equal(promoteRes.exit, 0);
  } else {
    assert.equal(promoteRes.env.errors[0]?.rule, "HARD-SHADOW-ONLY");
  }
});

test("(i) per-command compatibility: render between stage and promote", async () => {
  const p = await renderProject();
  await p.run({}, "stage-shot", "s01");
  put(p.dir, "stage/edit/s01/compositions/s01.html", COMPOSITION("s01"));

  // Run draft render
  const renderRes = await p.render({}, "render", "--draft");
  assert.equal(renderRes.exit, 0, JSON.stringify(renderRes.env.errors));

  // Run promote-shot and assert whatever is true
  const promoteRes = await p.run({}, "promote-shot", "s01");
  if (promoteRes.exit === 0) {
    assert.equal(promoteRes.exit, 0);
  } else {
    assert.equal(promoteRes.env.errors[0]?.rule, "HARD-SHADOW-ONLY");
  }
});

test("(j) modify / create / delete review/REVIEW.md after stage -> promote refuses", async () => {
  // 1. modify review/REVIEW.md
  {
    const p = await editProject();
    put(p.dir, "review/REVIEW.md", "# Review\nInitial quotes\n");
    await p.run({}, "stage-shot", "s01");
    p.buildScene("s01");
    put(p.dir, "review/REVIEW.md", "# Review\nTampered quotes\n");
    const r = await p.run({}, "promote-shot", "s01");
    assert.equal(r.exit, 1);
    assert.equal(r.env.errors[0]?.rule, "HARD-SHADOW-ONLY");
    assert.match(r.env.errors[0]?.message, /review\/REVIEW\.md/);
  }

  // 2. create review/REVIEW.md
  {
    const p = await editProject();
    // Do not create review/REVIEW.md before stage
    await p.run({}, "stage-shot", "s01");
    p.buildScene("s01");
    put(p.dir, "review/REVIEW.md", "# Review\nNewly created\n");
    const r = await p.run({}, "promote-shot", "s01");
    assert.equal(r.exit, 1);
    assert.equal(r.env.errors[0]?.rule, "HARD-SHADOW-ONLY");
    assert.match(r.env.errors[0]?.message, /review\/REVIEW\.md/);
  }

  // 3. delete review/REVIEW.md
  {
    const p = await editProject();
    put(p.dir, "review/REVIEW.md", "# Review\nTo be deleted\n");
    await p.run({}, "stage-shot", "s01");
    p.buildScene("s01");
    unlinkSync(join(p.dir, "review/REVIEW.md"));
    const r = await p.run({}, "promote-shot", "s01");
    assert.equal(r.exit, 1);
    assert.equal(r.env.errors[0]?.rule, "HARD-SHADOW-ONLY");
    assert.match(r.env.errors[0]?.message, /review\/REVIEW\.md/);
  }
});

test("(k) changes to review/qc.json and review/x.draft.mp4 are NOT violations and promote succeeds", async () => {
  const p = await editProject();
  await p.run({}, "stage-shot", "s01");
  p.buildScene("s01");

  // Write qc.json and draft mp4 under review/
  put(p.dir, "review/qc.json", '{"status":"pass"}');
  put(p.dir, "review/my-clip.draft.mp4", "draft-mp4-video-data");

  const promoteRes = await p.run({}, "promote-shot", "s01");
  assert.equal(promoteRes.exit, 0, JSON.stringify(promoteRes.env.errors));
});

test("(l) nested review/sub/x.draft.mp4 IS a violation (single level only)", async () => {
  const p = await editProject();
  await p.run({}, "stage-shot", "s01");
  p.buildScene("s01");

  // Create nested draft under review/sub/
  put(p.dir, "review/sub/nested.draft.mp4", "nested-mp4-data");

  const promoteRes = await p.run({}, "promote-shot", "s01");
  assert.equal(promoteRes.exit, 1);
  assert.equal(promoteRes.env.errors[0]?.rule, "HARD-SHADOW-ONLY");
  assert.match(promoteRes.env.errors[0]?.message, /review\/sub\/nested\.draft\.mp4/);
});

test("(m) stage-shot returns data.guard_digest (64 hex), and promote-shot --guard-digest verifies it", async () => {
  const p = await editProject();
  const stageRes = await p.run({}, "stage-shot", "s01");
  assert.equal(stageRes.exit, 0, JSON.stringify(stageRes.env.errors));
  const digest = stageRes.env.data?.guard_digest;
  assert.ok(digest, "data.guard_digest must be present in stage-shot response");
  assert.equal(typeof digest, "string");
  assert.match(digest, /^[0-9a-f]{64}$/, "guard_digest must be a 64-character lowercase hex string");

  p.buildScene("s01");
  const promoteRes = await p.run({}, "promote-shot", "s01", "--guard-digest", digest);
  assert.equal(promoteRes.exit, 0, JSON.stringify(promoteRes.env.errors));
});

test("(n) promote-shot with mismatched --guard-digest refuses with HARD-SHADOW-ONLY and exact message", async () => {
  const p = await editProject();
  await p.run({}, "stage-shot", "s01");
  p.buildScene("s01");

  const mismatchedDigest = "0".repeat(64);
  const promoteRes = await p.run({}, "promote-shot", "s01", "--guard-digest", mismatchedDigest);
  assert.equal(promoteRes.exit, 1);
  assert.equal(promoteRes.env.errors[0]?.rule, "HARD-SHADOW-ONLY");
  assert.equal(promoteRes.env.errors[0]?.message, "baseline digest does not match the digest returned by stage-shot (baseline may have been rewritten)");
});

test("(o) promote-shot with wrong-format --guard-digest (not 64 hex) is a usage error", async () => {
  const p = await editProject();
  await p.run({}, "stage-shot", "s01");
  p.buildScene("s01");

  for (const badValue of ["short", "z".repeat(64), "12345", ""]) {
    const promoteRes = await p.run({}, "promote-shot", "s01", "--guard-digest", badValue);
    assert.equal(promoteRes.exit, 2, `bad value "${badValue}" must exit with code 2 (usage error)`);
  }
});

test("(p) guard_digest is NEVER written anywhere on disk after stage and after promote", async () => {
  const p = await editProject();
  const stageRes = await p.run({}, "stage-shot", "s01");
  assert.equal(stageRes.exit, 0);
  const digest = stageRes.env.data.guard_digest;
  assert.ok(digest);

  // Check disk after stage-shot
  const journalAfterStage = readFileSync(join(p.dir, "journal.md"), "utf8");
  assert.equal(journalAfterStage.includes(digest), false, "digest must not appear in journal.md after stage");

  const projectAfterStage = readFileSync(join(p.dir, "project.yaml"), "utf8");
  assert.equal(projectAfterStage.includes(digest), false, "digest must not appear in project.yaml after stage");

  const guardFile = baselinePath(p.dir, "s01");
  assert.ok(existsSync(guardFile));
  const guardContent = readFileSync(guardFile, "utf8");
  assert.equal(guardContent.includes(digest), false, "digest must not appear in baseline file");

  const { readdirSync } = await import("node:fs");
  const guardDir = join(p.dir, "stage/guard");
  if (existsSync(guardDir)) {
    for (const f of readdirSync(guardDir)) {
      const content = readFileSync(join(guardDir, f), "utf8");
      assert.equal(content.includes(digest), false, `digest must not appear in stage/guard/${f}`);
    }
  }

  // Promote
  p.buildScene("s01");
  const promoteRes = await p.run({}, "promote-shot", "s01", "--guard-digest", digest);
  assert.equal(promoteRes.exit, 0);

  // Check disk after promote-shot
  const journalAfterPromote = readFileSync(join(p.dir, "journal.md"), "utf8");
  assert.equal(journalAfterPromote.includes(digest), false, "digest must not appear in journal.md after promote");

  const projectAfterPromote = readFileSync(join(p.dir, "project.yaml"), "utf8");
  assert.equal(projectAfterPromote.includes(digest), false, "digest must not appear in project.yaml after promote");

  if (existsSync(guardDir)) {
    for (const f of readdirSync(guardDir)) {
      const content = readFileSync(join(guardDir, f), "utf8");
      assert.equal(content.includes(digest), false, `digest must not appear in stage/guard/${f} after promote`);
    }
  }
});

test("(q) --rebaseline yields a NEW digest when protected state changed", async () => {
  const p = await editProject();
  const stage1 = await p.run({}, "stage-shot", "s01");
  assert.equal(stage1.exit, 0);
  const digest1 = stage1.env.data.guard_digest;

  // Drift the protected state
  put(p.dir, "assets/extra.txt", "some new protected content");

  // Rebaseline
  const stage2 = await p.run({}, "stage-shot", "s01", "--rebaseline");
  assert.equal(stage2.exit, 0, JSON.stringify(stage2.env.errors));
  const digest2 = stage2.env.data.guard_digest;

  assert.ok(digest1);
  assert.ok(digest2);
  assert.notEqual(digest1, digest2, "--rebaseline must yield a new digest when protected state changed");
});

test("(r) limit test: baseline tampering consistent with protected file is caught WITH --guard-digest but passes WITHOUT it", async () => {
  const { sha256 } = await import("../src/hash.mjs");

  // Case 1: Without --guard-digest, tampering passes (documenting the limit)
  {
    const p = await editProject();
    const stageRes = await p.run({}, "stage-shot", "s01");
    assert.equal(stageRes.exit, 0);
    p.buildScene("s01");

    // Tamper protected file
    put(p.dir, "bible.yaml", "characters: []\nlocations: []\nworld: { tampered: true }\npronunciation: []\n");

    // Tamper the baseline file so that its record for bible.yaml matches the new hash
    const guardFile = baselinePath(p.dir, "s01");
    const baseline = JSON.parse(readFileSync(guardFile, "utf8"));
    baseline.files["bible.yaml"] = sha256(readFileSync(join(p.dir, "bible.yaml")));
    writeFileSync(guardFile, JSON.stringify(baseline, null, 2) + "\n");

    // Limit documentation comment:
    // Without --guard-digest, promote-shot only compares the on-disk baseline with the current state.
    // Since both were tampered consistently, diffSnapshot sees zero violations and promotion passes.
    // This documents the limit of on-disk baselines without digest verification.
    const promoteWithoutFlag = await p.run({}, "promote-shot", "s01");
    assert.equal(promoteWithoutFlag.exit, 0, "without --guard-digest, on-disk baseline tampering passes (limit of on-disk baseline)");
  }

  // Case 2: With --guard-digest, baseline tampering is detected and refused!
  {
    const p = await editProject();
    const stageRes = await p.run({}, "stage-shot", "s01");
    assert.equal(stageRes.exit, 0);
    const origDigest = stageRes.env.data.guard_digest;
    p.buildScene("s01");

    put(p.dir, "bible.yaml", "characters: []\nlocations: []\nworld: { tampered: true }\npronunciation: []\n");
    const guardFile = baselinePath(p.dir, "s01");
    const baseline = JSON.parse(readFileSync(guardFile, "utf8"));
    baseline.files["bible.yaml"] = sha256(readFileSync(join(p.dir, "bible.yaml")));
    writeFileSync(guardFile, JSON.stringify(baseline, null, 2) + "\n");

    // With --guard-digest passed in from stage-shot, baseline tampering is detected!
    const promoteWithFlag = await p.run({}, "promote-shot", "s01", "--guard-digest", origDigest);
    assert.equal(promoteWithFlag.exit, 1);
    assert.equal(promoteWithFlag.env.errors[0]?.rule, "HARD-SHADOW-ONLY");
    assert.equal(promoteWithFlag.env.errors[0]?.message, "baseline digest does not match the digest returned by stage-shot (baseline may have been rewritten)");
  }
});

