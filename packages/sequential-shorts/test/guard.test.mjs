import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkOutputDir, diffRecords, findImagineProject, hashImagineRecords, imagineProjectOf, resolveLoose } from "../src/guard.mjs";
import { tmp } from "./helpers/media.mjs";

function imagineTree() {
  const root = resolveLoose(tmp("guard-"));
  const proj = join(root, ".imagine", "film-1");
  mkdirSync(join(proj, "post"), { recursive: true });
  mkdirSync(join(proj, "review", "g7"), { recursive: true });
  writeFileSync(join(proj, "project.yaml"), "name: film-1\n");
  writeFileSync(join(proj, "journal.md"), "# journal\n");
  writeFileSync(join(proj, "review", "g7", "verdict.md"), "PASS\n");
  writeFileSync(join(proj, "post", "film.mp4"), "video");
  return { root, proj, input: join(proj, "post", "film.mp4") };
}
const hard = (fn) => assert.throws(fn, (e) => e.code === "HARD" && e.check === "write-boundary");

test("imagineProjectOf finds the project segment", () => {
  assert.deepEqual(imagineProjectOf("/a/.imagine/p/tmp/x"), { root: "/a/.imagine/p", project: "p", rel: "tmp/x" });
  assert.equal(imagineProjectOf("/a/b/c"), null);
});

test("output may not be the input directory or inside an Imagine project outside tmp/", () => {
  const { root, proj, input } = imagineTree();
  hard(() => checkOutputDir(input, join(proj, "post")));
  hard(() => checkOutputDir(input, join(proj, "post", "shorts")));
  hard(() => checkOutputDir(input, proj));
  assert.equal(checkOutputDir(input, join(proj, "tmp", "shorts")).output, join(proj, "tmp", "shorts"));
  assert.equal(checkOutputDir(input, join(root, "out")).output, join(root, "out"));
});

test("symlinks cannot smuggle the output into a project", () => {
  const { root, proj, input } = imagineTree();
  symlinkSync(join(proj, "post"), join(root, "link"));
  hard(() => checkOutputDir(input, join(root, "link", "shorts")));
});

test("record hashes catch changed, added and removed files", async () => {
  const { proj, input } = imagineTree();
  assert.equal(findImagineProject(input), proj);
  assert.equal(findImagineProject(join(tmp("x-"), "a.mp4")), null);
  const before = await hashImagineRecords(proj);
  assert.deepEqual(Object.keys(before.files).sort(), ["journal.md", "project.yaml", "review/g7/verdict.md"]);
  assert.deepEqual(diffRecords(before, await hashImagineRecords(proj)), []);
  writeFileSync(join(proj, "review", "g7", "verdict.md"), "FAIL\n");
  writeFileSync(join(proj, "review", "new.md"), "x");
  rmSync(join(proj, "journal.md"));
  const changed = diffRecords(before, await hashImagineRecords(proj)).map((d) => d.file).sort();
  assert.deepEqual(changed, ["journal.md", "review/g7/verdict.md", "review/new.md"]);
});
