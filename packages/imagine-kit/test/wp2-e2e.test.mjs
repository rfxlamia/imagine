import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { sha256File } from "../src/hash.mjs";
import { cli, getManifest, getProject, shot, snapshot, writeStory } from "./helpers/fixture.mjs";
import { renderProject } from "./helpers/edit.mjs";
import { imgProject } from "./helpers/img.mjs";
import { ttsProject } from "./helpers/tts.mjs";
import { hasFfmpeg } from "./helpers/media.mjs";

const t = hasFfmpeg ? test : test.skip;

t("e2e: export-hf, draft render, qc, G6, final render and qc on the immutable file", async () => {
  const p = await renderProject();
  const draft = await p.render({}, "render", "--draft");
  assert.equal(draft.exit, 0, JSON.stringify(draft.env.errors));
  const qcDraft = await cli(p.cwd, "qc", draft.env.data.path);
  assert.equal(qcDraft.exit, 0, JSON.stringify(qcDraft.env.errors));
  assert.equal((await cli(p.cwd, "gate", "G6", "approve", "--quote", "edit ok")).exit, 0);
  const final = await p.render({}, "render", "--final");
  assert.equal(final.exit, 0, JSON.stringify(final.env.errors));
  assert.equal(final.env.data.path, "post/keeper.v1.mp4");
  const qc = await cli(p.cwd, "qc", final.env.data.path);
  assert.equal(qc.exit, 0, JSON.stringify(qc.env.errors));
  assert.equal(JSON.parse(readFileSync(join(p.dir, "review/qc.json"), "utf8")).file, "post/keeper.v1.mp4");
  const status = (await cli(p.cwd, "status")).env.data.items;
  assert.equal(status.find((i) => i.id === "render:keeper.v1").status, "proposed");
});

t("AC-14: a text-led project reaches an MP4 without any TTS, with G5a on the music", async () => {
  const shots = [
    shot("s01", { scene: "stairs", duration_est: "6s", duration: "6s", voiceover: "[T01, T02@2.5]", location: "lighthouse", assets: "[bg:img:1536x1024]", framing: "wide" }, "Stairs", "Text."),
    shot("s02", { scene: "lamp", duration_est: "7s", duration: "7s", voiceover: "[T03]", fx: "[glow=css-blend:screen]" }, "Lamp"),
  ];
  const p = await renderProject({ shots, mode: "text-led" });
  assert.equal((await cli(p.cwd, "tts", "--all")).exit, 2, "tts is for narrated projects");
  const music = getManifest(p.dir).assets.find((a) => a.kind === "music");
  assert.ok(music && music.license && music.credit, "music carries licence, source and credit");
  assert.equal(getManifest(p.dir).assets.some((a) => a.kind === "vo"), false);
  const draft = await p.render({}, "render", "--draft");
  assert.equal(draft.exit, 0, JSON.stringify(draft.env.errors));
  const qc = await cli(p.cwd, "qc", draft.env.data.path);
  assert.equal(qc.exit, 0, JSON.stringify(qc.env.errors));
  assert.equal(p.calls().some((c) => c.argv.includes("pocket-tts[audio]==4.0.1")), false);
});

test("AC-06: redoing one voice line by seed re-opens only the previz of the shot that uses it", async () => {
  const p = await ttsProject({ upTo: "G3" });
  await writeStory(p.dir, 1, [
    shot("s01", { scene: "stairs", duration_est: "6s", voiceover: "[L01, L02@2.5]" }, "Stairs"),
    shot("s02", { scene: "lamp", duration_est: "7s", voiceover: "[L03]" }, "Lamp"),
  ]);
  assert.equal((await cli(p.cwd, "gate", "G4", "approve", "--quote", "story ok")).exit, 0);
  assert.equal((await p.run({}, "tts", "--all")).exit, 0);
  await snapshot(p.dir, "shot:s01.previz", ["clock:L01=vo.v1", "clock:L02=vo.v1"], { status: "proposed" });
  await snapshot(p.dir, "shot:s02.previz", ["clock:L03=vo.v1"], { status: "proposed" });
  const states = async () => Object.fromEntries((await cli(p.cwd, "status")).env.data.items.filter((i) => i.id.endsWith(".previz")).map((i) => [i.id, i.status]));
  assert.deepEqual(await states(), { "shot:s01.previz": "proposed", "shot:s02.previz": "proposed" });
  const redo = await p.run({}, "tts", "L02", "--redo", "L02", "--note", "rushed");
  assert.deepEqual([redo.env.data.takes[0].v, redo.env.data.takes[0].seed], [2, 1302]);
  assert.deepEqual(await states(), { "shot:s01.previz": "stale", "shot:s02.previz": "proposed" });
});

t("AC-08: a batch that stops half way resumes without regenerating or duplicating the finished asset", async () => {
  const plan = { assets: [
    { id: "a", kind: "img", prompt: "First plate", framing: "wide", size: "1536x1024" },
    { id: "b", kind: "img", prompt: "Second plate", framing: "wide", size: "1536x1024" },
  ] };
  const p = await imgProject(plan);
  const broken = await p.run({ FAKE_CODEX_MODES: "ok,fail" }, "img", "--batch", "a,b");
  assert.equal(broken.exit, 3);
  assert.equal(p.calls().length, 4, "one good call for a, three failed attempts for b");
  const sha = sha256File(join(p.dir, "assets/img/a.v1.png"));
  const resumed = await p.run({}, "img", "--batch", "a,b");
  assert.equal(resumed.exit, 0, JSON.stringify(resumed.env.errors));
  assert.equal(p.calls().length, 5, "only b was generated again");
  assert.deepEqual(getManifest(p.dir).assets.map((a) => `${a.id}.v${a.v}`).sort(), ["a.v1", "b.v1"]);
  assert.equal(sha256File(join(p.dir, "assets/img/a.v1.png")), sha);
  assert.deepEqual(getProject(p.dir).blocked, []);
  assert.equal(existsSync(join(p.dir, "assets/img/b.v1.png")), true);
});
