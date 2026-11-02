import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sha256File } from "../src/hash.mjs";
import { commitAsset, placeFile, recordBlocked, safePath } from "../src/img/commit.mjs";
import { loadValidator } from "../src/schemas.mjs";
import { getManifest, getProject, makeProject, put } from "./helpers/fixture.mjs";

const ctx = { now: () => new Date("2026-11-01T10:00:00Z") };
const entry = (v) => ({ id: "bg", kind: "img", v, path: `assets/img/bg.v${v}.png`, status: "pending", sha256: "0".repeat(64) });

test("placeFile copies through a temp file and leaves no temp behind", async () => {
  const p = await makeProject();
  put(p.dir, "tmp/in.bin", "bytes");
  placeFile(join(p.dir, "tmp/in.bin"), join(p.dir, "assets/img/out.bin"));
  assert.equal(readFileSync(join(p.dir, "assets/img/out.bin"), "utf8"), "bytes");
  assert.deepEqual(readdirSync(join(p.dir, "assets/img")).filter((n) => n.includes(".tmp-")), []);
});

test("commitAsset places the file, records its real hash and appends a journal entry", async () => {
  const p = await makeProject();
  put(p.dir, "tmp/in.png", "png-bytes");
  const r = await commitAsset(ctx, p.dir, { entry: entry(1), source: join(p.dir, "tmp/in.png"), summary: { command: "img", text: "bg.v1" } });
  assert.equal(r.kept, false);
  assert.match(r.journal_id, /^j-\d{6}$/);
  const saved = getManifest(p.dir).assets[0];
  assert.equal(saved.sha256, sha256File(join(p.dir, "assets/img/bg.v1.png")));
  assert.notEqual(saved.sha256, "0".repeat(64));
});

test("PROC-VERSIONS-IMMUTABLE: a version that already exists is kept and never overwritten", async () => {
  const p = await makeProject();
  put(p.dir, "tmp/a.png", "first");
  put(p.dir, "tmp/b.png", "second");
  await commitAsset(ctx, p.dir, { entry: entry(1), source: join(p.dir, "tmp/a.png"), summary: { command: "img", text: "one" } });
  const again = await commitAsset(ctx, p.dir, { entry: entry(1), source: join(p.dir, "tmp/b.png"), summary: { command: "img", text: "two" } });
  assert.equal(again.kept, true);
  assert.equal(again.entry.sha256, sha256File(join(p.dir, "assets/img/bg.v1.png")));
  assert.equal(again.entry.path, "assets/img/bg.v1.png");
  assert.equal(readFileSync(join(p.dir, "assets/img/bg.v1.png"), "utf8"), "first");
  assert.equal(getManifest(p.dir).assets.length, 1);
});

test("recordBlocked replaces an entry for the same step and commitAsset clears it", async () => {
  const p = await makeProject();
  await recordBlocked(ctx, p.dir, { step: "img:bg.v1", command: "img --batch bg" });
  await recordBlocked(ctx, p.dir, { step: "img:bg.v1", command: "img --batch bg" });
  assert.equal(getProject(p.dir).blocked.length, 1);
  put(p.dir, "tmp/a.png", "x");
  await commitAsset(ctx, p.dir, { entry: entry(1), source: join(p.dir, "tmp/a.png"), clearBlocked: "img:bg.v1", summary: { command: "img", text: "bg" } });
  assert.deepEqual(getProject(p.dir).blocked, []);
  assert.equal(existsSync(join(p.dir, "assets/img/bg.v1.png")), true);
});

test("safePath keeps paths inside the project: no absolute, no .., no symlink that leaves", async () => {
  const p = await makeProject();
  const outside = mkdtempSync(join(tmpdir(), "imagine-outside-"));
  put(outside, "secret.png", "x");
  mkdirSync(join(p.dir, "assets/img"), { recursive: true });
  symlinkSync(join(outside, "secret.png"), join(p.dir, "assets/img/link.png"));
  symlinkSync(outside, join(p.dir, "assets/linked-dir"));
  assert.equal(safePath(p.dir, "assets/img/bg.v1.png"), join(p.dir, "assets/img/bg.v1.png"));
  assert.equal(safePath(p.dir, "../x.png"), null);
  assert.equal(safePath(p.dir, "assets/../../x.png"), null);
  assert.equal(safePath(p.dir, join(outside, "secret.png")), null);
  assert.equal(safePath(p.dir, "assets/img/link.png"), null);
  assert.equal(safePath(p.dir, "assets/linked-dir/new.png"), null);
});

test("safePath rejects dangling symlink escapes pointing outside the project", async () => {
  const p = await makeProject();
  const outside = mkdtempSync(join(tmpdir(), "imagine-outside-"));
  const outsideTarget = join(outside, "ghost.png");
  mkdirSync(join(p.dir, "assets/img"), { recursive: true });
  symlinkSync(outsideTarget, join(p.dir, "assets/img/dangling.png"));
  assert.equal(existsSync(outsideTarget), false);
  const resolved = safePath(p.dir, "assets/img/dangling.png");
  assert.equal(resolved, null);
  if (resolved) {
    writeFileSync(resolved, "escape");
  }
  assert.equal(existsSync(outsideTarget), false);
});

test("manifest schema: ids are plain names and paths stay under assets/ without .. segments", () => {
  const v = loadValidator("manifest");
  const row = (extra) => ({ assets: [{ id: "bg", kind: "img", v: 1, path: "assets/img/bg.v1.png", sha256: "a".repeat(64), status: "pending", ...extra }] });
  assert.equal(v(row({})).valid, true);
  for (const bad of [{ id: "../bg" }, { id: "a/b" }, { path: "../bg.png" }, { path: "assets/../../x.png" }, { path: "/etc/passwd" }, { path: "assets/img/noext" }]) {
    assert.equal(v(row(bad)).valid, false, JSON.stringify(bad));
  }
});

test("commitAsset refuses an entry whose path leaves the project and writes nothing", async () => {
  const p = await makeProject();
  put(p.dir, "tmp/in.png", "png-bytes");
  await assert.rejects(commitAsset(ctx, p.dir, { entry: { ...entry(1), path: "../escape.png" }, source: join(p.dir, "tmp/in.png"), summary: { command: "img", text: "x" } }), /outside the project/);
  assert.equal(getManifest(p.dir).assets.length, 0);
});

test("placeFile never follows a symlink planted at the old predictable temp name", async () => {
  const p = await makeProject();
  put(p.dir, "tmp/in.bin", "bytes");
  const victim = join(mkdtempSync(join(tmpdir(), "imagine-place-victim-")), "victim.bin");
  const planted = join(p.dir, "assets/img/out.bin.tmp-" + process.pid);
  symlinkSync(victim, planted);
  placeFile(join(p.dir, "tmp/in.bin"), join(p.dir, "assets/img/out.bin"));
  assert.equal(existsSync(victim), false, "the planted symlink target was never written");
  assert.equal(readFileSync(join(p.dir, "assets/img/out.bin"), "utf8"), "bytes");
  assert.equal(lstatSync(planted).isSymbolicLink(), true, "the planted entry is left untouched, not consumed");
});
