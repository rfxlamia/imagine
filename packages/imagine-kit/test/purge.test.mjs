import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cli, cliWith, makeProject, put, getProject } from "./helpers/fixture.mjs";

const file = (dir, rel, contents = "x") => put(dir, rel, contents);
const final = (dir) => file(dir, "post/final.mp4", "final");

test("HARD-PURGE-FINAL-EXISTS: purge requires a root post MP4, including when post contains only MOV", async () => {
  const { cwd, dir } = await makeProject();
  file(dir, "assets/img/a.png");
  let r = await cli(cwd, "purge");
  assert.equal(r.exit, 1);
  assert.equal(r.env.errors[0].rule, "HARD-PURGE-FINAL-EXISTS");
  assert.equal(existsSync(join(dir, "assets/img/a.png")), true);
  file(dir, "post/final.mov");
  r = await cli(cwd, "purge", "--apply", "--quote", "yes purge");
  assert.equal(r.exit, 1);
  assert.equal(r.env.errors[0].rule, "HARD-PURGE-FINAL-EXISTS");
});

test("PROC-PURGE-QUOTE: dry-run is read-only and apply requires a non-blank quote", async () => {
  const { cwd, dir } = await makeProject();
  final(dir);
  file(dir, "assets/img/a.png", "1234");
  const before = readFileSync(join(dir, "project.yaml"), "utf8");
  const dry = await cli(cwd, "purge");
  assert.equal(dry.exit, 0);
  assert.equal(dry.env.data.mode, "dry-run");
  assert.equal(dry.env.data.total_files, 1);
  assert.equal(dry.env.data.total_bytes, 4);
  assert.deepEqual(dry.env.data.by_dir, [{ dir: "assets/img", files: 1, bytes: 4 }]);
  assert.equal(existsSync(join(dir, "assets/img/a.png")), true);
  assert.equal(readFileSync(join(dir, "project.yaml"), "utf8"), before);
  const missing = await cli(cwd, "purge", "--apply");
  assert.equal(missing.exit, 7);
  assert.equal(missing.env.errors[0].rule, "PROC-PURGE-QUOTE");
  const blank = await cli(cwd, "purge", "--apply", "--quote", "  \n");
  assert.equal(blank.exit, 7);
  assert.equal(existsSync(join(dir, "assets/img/a.png")), true);
  const withoutApply = await cli(cwd, "purge", "--quote", "yes purge");
  assert.equal(withoutApply.exit, 2);
});

test("HARD-PURGE-FINAL-EXISTS: every file under root post survives while scoped media is removed", async () => {
  const { cwd, dir } = await makeProject();
  final(dir);
  file(dir, "post/final.draft.mp4");
  file(dir, "post/cover.png");
  file(dir, "post/notes.txt");
  file(dir, "assets/img/a.PNG", "123");
  file(dir, "assets/composites/b.JPEG", "1234");
  file(dir, "assets/sheets/c.jpg", "12");
  file(dir, "stage/edit/s01/post/x.mp4", "12345");
  file(dir, "stage/edit/s01/.hyperframes/artifacts/snapshots/a.png", "123456");
  file(dir, "assets/audio/a.wav");
  file(dir, "assets/a.yaml");
  file(dir, "assets/a.json");
  const r = await cli(cwd, "purge", "--apply", "--quote", "purge these files");
  assert.equal(r.exit, 0);
  for (const rel of ["post/final.mp4", "post/final.draft.mp4", "post/cover.png", "post/notes.txt", "assets/audio/a.wav", "assets/a.yaml", "assets/a.json"]) {
    assert.equal(existsSync(join(dir, rel)), true, `${rel} should survive`);
  }
  for (const rel of ["assets/img/a.PNG", "assets/composites/b.JPEG", "assets/sheets/c.jpg", "stage/edit/s01/post/x.mp4", "stage/edit/s01/.hyperframes/artifacts/snapshots/a.png"]) {
    assert.equal(existsSync(join(dir, rel)), false, `${rel} should be removed`);
  }
});

test("HARD-PURGED: symlinks are skipped and the project is recorded on every apply", async () => {
  const { cwd, dir } = await makeProject();
  final(dir);
  const outside = join(cwd, "outside.png");
  writeFileSync(outside, "outside");
  mkdirSync(join(dir, "assets/img"), { recursive: true });
  symlinkSync(outside, join(dir, "assets/img/link.png"));
  file(dir, "assets/img/inside.png", "inside");
  let r = await cli(cwd, "purge", "--apply", "--quote", "remove media");
  assert.equal(r.exit, 0);
  assert.deepEqual(r.env.data.skipped_symlinks, ["assets/img/link.png"]);
  assert.equal(existsSync(join(dir, "assets/img/link.png")), true);
  assert.equal(existsSync(outside), true);
  r = await cli(cwd, "purge", "--apply", "--quote", "remove media again");
  assert.equal(r.exit, 0);
  assert.equal(r.env.data.total_files, 0);
  const project = getProject(dir);
  assert.equal(project.purges.length, 2);
  assert.equal(project.purges[0].quote, "remove media");
  assert.equal(project.purges[0].files, 1);
  assert.equal(project.purges[1].files, 0);
  assert.match(readFileSync(join(dir, "journal.md"), "utf8"), /purge:/);
});

test("HARD-PURGED: purge record is saved before an unlink failure", async () => {
  const { cwd, dir } = await makeProject();
  final(dir);
  file(dir, "assets/img/a.png", "image");
  const r = await cliWith(cwd, { hooks: { beforePurgeUnlink() { throw new Error("simulated unlink failure"); } } },
    "purge", "--apply", "--quote", "remove media");
  assert.equal(r.exit, 1);
  assert.equal(getProject(dir).purges.length, 1);
  assert.equal(getProject(dir).purges[0].files, 1);
  assert.equal(existsSync(join(dir, "assets/img/a.png")), true);
});

test("HARD-PURGED: downstream generation commands refuse after purge while status exposes records", async () => {
  const { cwd, dir } = await makeProject();
  final(dir);
  file(dir, "assets/img/a.png");
  assert.equal((await cli(cwd, "purge", "--apply", "--quote", "purge")).exit, 0);
  const status = await cli(cwd, "status");
  assert.equal(status.exit, 0);
  assert.equal(status.env.data.purges.length, 1);
  for (const args of [["img", "--batch", "a"], ["render", "--draft"], ["export-hf"]]) {
    const r = await cli(cwd, ...args);
    assert.equal(r.exit, 1, args[0]);
    assert.equal(r.env.errors[0].rule, "HARD-PURGED", args[0]);
    assert.match(r.env.errors[0].message, /media was purged/i);
  }
});

test("ADV-PURGE-G7-PENDING: purge advises when G7 is not approved without blocking", async () => {
  const { cwd, dir } = await makeProject();
  final(dir);
  file(dir, "assets/img/a.png");
  const r = await cli(cwd, "purge");
  assert.equal(r.exit, 0);
  assert.ok(r.env.advice.some((item) => item.rule === "ADV-PURGE-G7-PENDING" && /not accepted at G7/i.test(item.message)));
});
