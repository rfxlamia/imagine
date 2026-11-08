import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  snapshotProtected,
  diffSnapshot,
  baselinePath,
  EXCLUSIONS,
  isExcluded,
  canonicalDigest,
} from "../src/edit/guard.mjs";

function makeTempProject() {
  const dir = mkdtempSync(join(tmpdir(), "imagine-guard-test-"));
  // Create a minimal project structure
  mkdirSync(join(dir, "script"), { recursive: true });
  mkdirSync(join(dir, "assets"), { recursive: true });
  mkdirSync(join(dir, "edit/compositions"), { recursive: true });
  mkdirSync(join(dir, "stage/edit/s01"), { recursive: true });
  mkdirSync(join(dir, "stage/guard"), { recursive: true });
  mkdirSync(join(dir, "tmp/scratch-vo"), { recursive: true });

  writeFileSync(join(dir, "project.yaml"), "contract: 1\n");
  writeFileSync(join(dir, "journal.md"), "# Journal\n");
  writeFileSync(join(dir, "STORY.md"), "---\nimagine_rev: 1\n---\n");
  writeFileSync(join(dir, "bible.yaml"), "characters: []\n");
  writeFileSync(join(dir, "assets/manifest.yaml"), "assets: []\n");
  writeFileSync(join(dir, "tmp/scratch-vo/L01.wav"), "scratch-audio-data");

  return dir;
}

test("baselinePath returns stage/guard/<id>.json", () => {
  const p = baselinePath("/mock/project", "s01");
  assert.equal(p, join("/mock/project", "stage/guard/s01.json"));
});

test("EXCLUSIONS is an exported array of documented exclusion rules", () => {
  assert.ok(Array.isArray(EXCLUSIONS));
  assert.ok(EXCLUSIONS.length > 0);
  for (const entry of EXCLUSIONS) {
    assert.ok(entry.name, "each exclusion has a name");
    assert.ok(entry.description, "each exclusion has a description");
  }
});

test("clean tree -> empty diff", async (t) => {
  const dir = makeTempProject();
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  const snap1 = await snapshotProtected(dir, "s01");
  const snap2 = await snapshotProtected(dir, "s01");
  const diff = diffSnapshot(snap1, snap2);

  assert.deepEqual(diff, { modified: [], created: [], deleted: [] });
});

test("modifying a protected file is detected in modified", async (t) => {
  const dir = makeTempProject();
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  const before = await snapshotProtected(dir, "s01");
  writeFileSync(join(dir, "STORY.md"), "---\nimagine_rev: 2\n---\n");
  const after = await snapshotProtected(dir, "s01");
  const diff = diffSnapshot(before, after);

  assert.deepEqual(diff.modified, ["STORY.md"]);
  assert.deepEqual(diff.created, []);
  assert.deepEqual(diff.deleted, []);
});

test("creating a protected file is detected in created", async (t) => {
  const dir = makeTempProject();
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  const before = await snapshotProtected(dir, "s01");
  writeFileSync(join(dir, "assets/new_asset.png"), "pngbytes");
  const after = await snapshotProtected(dir, "s01");
  const diff = diffSnapshot(before, after);

  assert.deepEqual(diff.created, ["assets/new_asset.png"]);
  assert.deepEqual(diff.modified, []);
  assert.deepEqual(diff.deleted, []);
});

test("deleting a protected file is detected in deleted", async (t) => {
  const dir = makeTempProject();
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  const before = await snapshotProtected(dir, "s01");
  unlinkSync(join(dir, "bible.yaml"));
  const after = await snapshotProtected(dir, "s01");
  const diff = diffSnapshot(before, after);

  assert.deepEqual(diff.deleted, ["bible.yaml"]);
  assert.deepEqual(diff.modified, []);
  assert.deepEqual(diff.created, []);
});

test("modifying protected derivation input tmp/scratch-vo/** is detected", async (t) => {
  const dir = makeTempProject();
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  const before = await snapshotProtected(dir, "s01");
  writeFileSync(join(dir, "tmp/scratch-vo/L01.wav"), "modified-scratch");
  const after = await snapshotProtected(dir, "s01");
  const diff = diffSnapshot(before, after);

  assert.deepEqual(diff.modified, ["tmp/scratch-vo/L01.wav"]);
});

test("each exclusion class is NOT a violation", async (t) => {
  const dir = makeTempProject();
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  const before = await snapshotProtected(dir, "s01");

  // 1. state file (project.yaml)
  writeFileSync(join(dir, "project.yaml"), "contract: 2\nupdated: true\n");

  // 2. journal file (journal.md)
  writeFileSync(join(dir, "journal.md"), "# Journal\n- new entry\n");

  // 3. lock directory / file (.lock)
  mkdirSync(join(dir, ".lock"), { recursive: true });
  writeFileSync(join(dir, ".lock/info"), "locked");

  // 4. stage/edit/** (another shot's shadow or current shot's shadow)
  mkdirSync(join(dir, "stage/edit/s01/compositions"), { recursive: true });
  writeFileSync(join(dir, "stage/edit/s01/compositions/s01.html"), "<template>shadow</template>");
  mkdirSync(join(dir, "stage/edit/s02"), { recursive: true });
  writeFileSync(join(dir, "stage/edit/s02/SHOT.md"), "# shot s02");

  // 5. stage/guard/** (guard baselines)
  writeFileSync(join(dir, "stage/guard/s01.json"), '{"shot":"s01"}');
  writeFileSync(join(dir, "stage/guard/s02.json"), '{"shot":"s02"}');

  // 6. edit/compositions/<otherId>.html
  writeFileSync(join(dir, "edit/compositions/s02.html"), "<template>s02</template>");

  // 7. edit/index.motion.json
  writeFileSync(join(dir, "edit/index.motion.json"), '{"version":1,"assertions":[]}');

  // 8. tmp/** other than scratch-vo
  mkdirSync(join(dir, "tmp/render"), { recursive: true });
  writeFileSync(join(dir, "tmp/render/work.mp4"), "renderdata");
  mkdirSync(join(dir, "tmp/audition"), { recursive: true });
  writeFileSync(join(dir, "tmp/audition/L01-take.wav"), "auditiondata");

  // 9. junk files (.DS_Store, Thumbs.db, editor swap/backup, writeAtomic temp)
  writeFileSync(join(dir, ".DS_Store"), "junk");
  writeFileSync(join(dir, "assets/.DS_Store"), "junk");
  writeFileSync(join(dir, "Thumbs.db"), "junk");
  writeFileSync(join(dir, "STORY.md~"), "backup");
  writeFileSync(join(dir, ".STORY.md.swp"), "swap");
  writeFileSync(join(dir, ".project.yaml.tmp-12345-abcdef12"), "atomic-temp");
  writeFileSync(join(dir, "assets/.manifest.yaml.tmp-999-0123456789ab"), "atomic-temp-commit");

  // 10. VCS dirs (.git, .hg, .svn)
  mkdirSync(join(dir, ".git/objects"), { recursive: true });
  writeFileSync(join(dir, ".git/HEAD"), "ref: refs/heads/main");

  // 11. generated dirs (node_modules, post, review/qc.json and review/*.draft.mp4)
  mkdirSync(join(dir, "node_modules/fake-pkg"), { recursive: true });
  writeFileSync(join(dir, "node_modules/fake-pkg/index.js"), "module.exports={}");
  mkdirSync(join(dir, "post"), { recursive: true });
  writeFileSync(join(dir, "post/keeper.v1.mp4"), "final-render-data");
  mkdirSync(join(dir, "review"), { recursive: true });
  writeFileSync(join(dir, "review/qc.json"), "{}");
  writeFileSync(join(dir, "review/keeper.draft.mp4"), "draft-video");

  const after = await snapshotProtected(dir, "s01");
  const diff = diffSnapshot(before, after);

  assert.deepEqual(diff, { modified: [], created: [], deleted: [] });
});

test("own-shot composition appearing in edit/compositions/ IS a violation (created)", async (t) => {
  const dir = makeTempProject();
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  const before = await snapshotProtected(dir, "s01");
  assert.equal(before.files["edit/compositions/s01.html"], "absent");

  writeFileSync(join(dir, "edit/compositions/s01.html"), "<template>scene-builder-sneak</template>");
  const after = await snapshotProtected(dir, "s01");
  assert.notEqual(after.files["edit/compositions/s01.html"], "absent");

  const diff = diffSnapshot(before, after);
  assert.deepEqual(diff.created, ["edit/compositions/s01.html"]);
  assert.deepEqual(diff.modified, []);
  assert.deepEqual(diff.deleted, []);
});

test("own-shot composition changing in edit/compositions/ IS a violation (modified)", async (t) => {
  const dir = makeTempProject();
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  writeFileSync(join(dir, "edit/compositions/s01.html"), "<template>v1</template>");
  const before = await snapshotProtected(dir, "s01");
  assert.notEqual(before.files["edit/compositions/s01.html"], "absent");

  writeFileSync(join(dir, "edit/compositions/s01.html"), "<template>v2</template>");
  const after = await snapshotProtected(dir, "s01");
  const diff = diffSnapshot(before, after);

  assert.deepEqual(diff.modified, ["edit/compositions/s01.html"]);
  assert.deepEqual(diff.created, []);
  assert.deepEqual(diff.deleted, []);
});

test("directory symlink is not descended and hashed as symlink:<target>", async (t) => {
  const dir = makeTempProject();
  const outsideDir = mkdtempSync(join(tmpdir(), "imagine-outside-dir-"));
  writeFileSync(join(outsideDir, "secret.txt"), "outside content");
  t.after(() => {
    rmSync(dir, { recursive: true, force: true });
    rmSync(outsideDir, { recursive: true, force: true });
  });

  symlinkSync(outsideDir, join(dir, "assets/symlinked_dir"));

  const snap = await snapshotProtected(dir, "s01");
  assert.equal(snap.files["assets/symlinked_dir"], `symlink:${outsideDir}`);
  // Files inside the symlinked directory must NOT appear in the snapshot
  assert.equal(snap.files["assets/symlinked_dir/secret.txt"], undefined);
});

test("a new symlink is detected as created", async (t) => {
  const dir = makeTempProject();
  const targetFile = join(tmpdir(), "imagine-symlink-target.txt");
  writeFileSync(targetFile, "target");
  t.after(() => {
    rmSync(dir, { recursive: true, force: true });
    try { unlinkSync(targetFile); } catch {}
  });

  const before = await snapshotProtected(dir, "s01");
  symlinkSync(targetFile, join(dir, "assets/link_to_target"));
  const after = await snapshotProtected(dir, "s01");
  const diff = diffSnapshot(before, after);

  assert.deepEqual(diff.created, ["assets/link_to_target"]);
  assert.equal(after.files["assets/link_to_target"], `symlink:${targetFile}`);
});

test("deterministic ordering of files in snapshot and diff", async (t) => {
  const dir = makeTempProject();
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  writeFileSync(join(dir, "assets/z.txt"), "z");
  writeFileSync(join(dir, "assets/a.txt"), "a");
  writeFileSync(join(dir, "assets/m.txt"), "m");

  const snap = await snapshotProtected(dir, "s01");
  const keys = Object.keys(snap.files);
  const sortedKeys = [...keys].sort();
  assert.deepEqual(keys, sortedKeys, "files keys must be strictly sorted");

  // Create multiple files out of alphabetical order
  const before = snap;
  writeFileSync(join(dir, "assets/y_new.txt"), "y");
  writeFileSync(join(dir, "assets/b_new.txt"), "b");
  const after = await snapshotProtected(dir, "s01");
  const diff = diffSnapshot(before, after);

  assert.deepEqual(diff.created, ["assets/b_new.txt", "assets/y_new.txt"]);
});

test("Part A: review exclusions are strictly review/qc.json and single-level review/*.draft.mp4", () => {
  assert.equal(isExcluded("review/qc.json"), true, "review/qc.json must be excluded");
  assert.equal(isExcluded("review/slug.draft.mp4"), true, "review/slug.draft.mp4 must be excluded");
  assert.equal(isExcluded("review/another-film_01.draft.mp4"), true, "review/*.draft.mp4 must be excluded");

  // Protected paths under review/
  assert.equal(isExcluded("review/REVIEW.md"), false, "review/REVIEW.md MUST be protected");
  assert.equal(isExcluded("review/sub/x.draft.mp4"), false, "nested review/sub/*.draft.mp4 MUST be protected (single level only)");
  assert.equal(isExcluded("review/other.mp4"), false, "review/other.mp4 (not .draft.mp4) must be protected");
  assert.equal(isExcluded("review/notes.txt"), false, "review/notes.txt must be protected");
  assert.equal(isExcluded("review2/qc.json"), false, "review2/qc.json must not match review/qc.json");
});

test("Part A: representative and near-miss path tests for every exclusion entry", () => {
  // 1. stage-edit
  assert.equal(isExcluded("stage/edit/s01/scene.html"), true);
  assert.equal(isExcluded("stage/edit"), true);
  assert.equal(isExcluded("stage/edit2/x"), false, "near-miss stage/edit2/x must not match stage/edit");

  // 2. stage-guard
  assert.equal(isExcluded("stage/guard/s01.json"), true);
  assert.equal(isExcluded("stage/guard"), true);
  assert.equal(isExcluded("stage/guard2/x"), false, "near-miss stage/guard2/x must not match stage/guard");

  // 3. other-compositions
  assert.equal(isExcluded("edit/compositions/s02.html", "s01"), true);
  assert.equal(isExcluded("edit/compositions/s01.html", "s01"), false, "own shot composition is protected");
  assert.equal(isExcluded("edit/compositions-old/s02.html", "s01"), false, "near-miss edit/compositions-old must not match");

  // 4. root-motion
  assert.equal(isExcluded("edit/index.motion.json"), true);
  assert.equal(isExcluded("edit/index.motion.json.bak"), false, "near-miss must not match");
  assert.equal(isExcluded("edit/index.motion2.json"), false, "near-miss must not match");

  // 5. project-state
  assert.equal(isExcluded("project.yaml"), true);
  assert.equal(isExcluded("project.yaml.bak"), false, "near-miss must not match");
  assert.equal(isExcluded("sub/project.yaml"), false, "near-miss must not match");

  // 6. journal
  assert.equal(isExcluded("journal.md"), true);
  assert.equal(isExcluded("journal.md.old"), false, "near-miss must not match");
  assert.equal(isExcluded("sub/journal.md"), false, "near-miss must not match");

  // 7. lock
  assert.equal(isExcluded(".lock"), true);
  assert.equal(isExcluded(".lock/pid"), true);
  assert.equal(isExcluded(".lock2/pid"), false, "near-miss .lock2 must not match");

  // 8. tmp-except-scratch-vo
  assert.equal(isExcluded("tmp/work.mp4"), true);
  assert.equal(isExcluded("tmp/audition/test.wav"), true);
  assert.equal(isExcluded("tmp/scratch-vo/L01.wav"), false, "tmp/scratch-vo/** is derivation input and must be protected");
  assert.equal(isExcluded("tmp2/work.mp4"), false, "near-miss tmp2 must not match tmp");

  // 9. junk-patterns
  assert.equal(isExcluded(".DS_Store"), true);
  assert.equal(isExcluded("sub/.DS_Store"), true);
  assert.equal(isExcluded("Thumbs.db"), true);
  assert.equal(isExcluded("file.txt~"), true);
  assert.equal(isExcluded(".file.swp"), true);
  assert.equal(isExcluded("file.swp"), true);
  assert.equal(isExcluded(".project.yaml.tmp-1234-abcd"), true);
  assert.equal(isExcluded("DS_Store"), false, "near-miss without dot must not match");
  assert.equal(isExcluded("clean.txt"), false);

  // 10. vcs-dirs
  assert.equal(isExcluded(".git/HEAD"), true);
  assert.equal(isExcluded(".hg/dirstate"), true);
  assert.equal(isExcluded(".svn/entries"), true);
  assert.equal(isExcluded(".github/workflows/ci.yml"), false, "near-miss .github must not match .git");
  assert.equal(isExcluded("my.git/config"), false, "near-miss my.git must not match .git");

  // 11. node-modules
  assert.equal(isExcluded("node_modules/pkg/index.js"), true);
  assert.equal(isExcluded("node_modules_old/pkg/index.js"), false, "near-miss must not match node_modules");

  // 12. post
  assert.equal(isExcluded("post/final.v1.mp4"), true);
  assert.equal(isExcluded("post"), true);
  assert.equal(isExcluded("postit/x.mp4"), false, "near-miss postit/ must not match post/");
});

test("Part A: unverified guesses (renders, snapshots, .cache, .hyperframes) are REMOVED and thus protected", () => {
  assert.equal(isExcluded("renders/x.mp4"), false, "renders/ is not a verified kit writer");
  assert.equal(isExcluded("edit/renders/x.mp4"), false, "edit/renders/ is not a verified kit writer");
  assert.equal(isExcluded("snapshots/frame.png"), false, "snapshots/ is not a verified kit writer");
  assert.equal(isExcluded("edit/snapshots/frame.png"), false, "edit/snapshots/ is not a verified kit writer");
  assert.equal(isExcluded(".cache/data"), false, ".cache is not a verified kit writer");
  assert.equal(isExcluded(".hyperframes/cache"), false, ".hyperframes is not a verified kit writer");
});

test("Part B: canonicalDigest computes deterministic sha256 over canonical JSON of files map + shot id", () => {
  const doc1 = {
    shot: "s01",
    files: {
      "b.txt": "hash-b",
      "a.txt": "hash-a",
    },
  };
  const doc2 = {
    files: {
      "a.txt": "hash-a",
      "b.txt": "hash-b",
    },
    shot: "s01",
  };

  const digest1 = canonicalDigest(doc1);
  const digest2 = canonicalDigest(doc2);

  assert.equal(typeof digest1, "string");
  assert.match(digest1, /^[0-9a-f]{64}$/);
  assert.equal(digest1, digest2, "canonicalDigest must be order-independent");

  // Changing shot produces a different digest
  const docShotChanged = { shot: "s02", files: doc1.files };
  assert.notEqual(canonicalDigest(docShotChanged), digest1);

  // Changing files produces a different digest
  const docFilesChanged = { shot: "s01", files: { ...doc1.files, "c.txt": "hash-c" } };
  assert.notEqual(canonicalDigest(docFilesChanged), digest1);

  // Modifying a file hash produces a different digest
  const docHashChanged = { shot: "s01", files: { ...doc1.files, "a.txt": "hash-a-modified" } };
  assert.notEqual(canonicalDigest(docHashChanged), digest1);
});
