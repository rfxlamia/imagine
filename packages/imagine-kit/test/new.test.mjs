import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadValidator } from "../src/schemas.mjs";
import { renderStyleOutput } from "../src/docs.mjs";
import { cli, getProject, makeProject } from "./helpers/fixture.mjs";

const NEW = ["new", "Keeper", "--format", "portrait", "--audio-mode", "narrated", "--lang", "en", "--duration", "12-15"];

test("HARD-FPS-SIZE: new writes a valid project with the G0 proposal and the section 5 tree", async () => {
  const { cwd, dir, rel } = await makeProject({ format: "portrait" });
  assert.equal(rel, join(".imagine", "2026-11-01-keeper"));
  const p = getProject(dir);
  assert.equal(loadValidator("project")(p).valid, true);
  assert.equal(p.title, "Keeper");
  assert.deepEqual([p.g0.status, p.g0.width, p.g0.height, p.g0.fps], ["pending", 1080, 1920, 30]);
  assert.deepEqual(p.g0.duration_s, { min: 12, max: 15 });
  assert.equal(readFileSync(join(cwd, ".imagine", "ACTIVE"), "utf8").trim(), "2026-11-01-keeper");
  for (const d of ["script", "stage/storyboard", "stage/previz", "stage/fx", "assets/refs", "assets/img", "assets/vo", "tmp/scratch-vo", "post", ".history"]) {
    assert.equal(existsSync(join(dir, d)), true, d);
  }
  assert.equal(readFileSync(join(dir, "assets", "manifest.yaml"), "utf8"), "assets: []\n");
});

test("HARD-FPS-SIZE: landscape is 1920x1080", async () => {
  const { dir } = await makeProject({ format: "landscape" });
  const g0 = getProject(dir).g0;
  assert.deepEqual([g0.width, g0.height, g0.fps], [1920, 1080, 30]);
});

test("new: STORY skeleton, history r0, generated style output and journal", async () => {
  const { dir } = await makeProject();
  const story = readFileSync(join(dir, "STORY.md"), "utf8");
  assert.equal(story, "---\nimagine_rev: 0\n---\n");
  assert.equal(readFileSync(join(dir, ".history", "STORY.r0.md"), "utf8"), story);
  const g0 = getProject(dir).g0;
  assert.match(readFileSync(join(dir, "style.md"), "utf8"), /## output\n\n- format: portrait 1080x1920 @ 30 fps\n/);
  assert.equal(renderStyleOutput(g0).split("\n")[0], "- format: portrait 1080x1920 @ 30 fps");
  assert.match(readFileSync(join(dir, "journal.md"), "utf8"), /^- j-000001 2026-11-01T10:00:00.000Z new: /m);
});

test("new: the same slug on the same day is USAGE and nothing else changes", async () => {
  const { cwd } = await makeProject();
  const r = await cli(cwd, ...NEW);
  assert.equal(r.exit, 2);
  assert.match(r.env.errors[0].message, /already exists/);
});

test("CAP-BLOCKED-STOP: a non-generic platform is BLOCKED and creates nothing", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "imagine-kit-"));
  const r = await cli(cwd, ...NEW, "--platform", "tiktok");
  assert.equal(r.exit, 3);
  assert.equal(r.env.code, "BLOCKED");
  assert.equal(existsSync(join(cwd, ".imagine")), false);
});

test("new: usage rules", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "imagine-kit-"));
  const base = ["new", "Keeper", "--format", "portrait", "--duration", "12-15"];
  assert.equal((await cli(cwd, ...base, "--audio-mode", "narrated")).exit, 2);                        // narrated needs --lang
  assert.equal((await cli(cwd, ...base, "--audio-mode", "narrated", "--lang", "en", "--silence", "intentional")).exit, 2);
  assert.equal((await cli(cwd, "new", "Keeper", "--format", "portrait", "--duration", "9-3", "--audio-mode", "text-led")).exit, 2);
  assert.equal((await cli(cwd, "new", "日本", "--format", "portrait", "--audio-mode", "text-led", "--duration", "5-9")).exit, 2);
  assert.equal((await cli(cwd, "new", "--format", "portrait", "--audio-mode", "text-led", "--duration", "5-9")).exit, 2);
  const ok = await cli(cwd, ...base, "--audio-mode", "text-led", "--silence", "intentional");
  assert.equal(ok.exit, 0);
  const g0 = ok.env.data.g0;
  assert.deepEqual([g0.language, g0.silence, g0.audio_mode], [null, "intentional", "text-led"]);
});
