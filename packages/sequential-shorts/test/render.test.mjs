import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readManifest } from "../src/manifest.mjs";
import { partName, renderParts } from "../src/render/render.mjs";
import { sha256File } from "../src/run/hash.mjs";
import { FFMPEG, TOOLS, hasFfmpeg, makeVideo, offsetAudio, tmp } from "./helpers/media.mjs";
import { planFromMedia } from "./helpers/render.mjs";

const skip = !hasFfmpeg && "NOT_RUN: ffmpeg not available";
const failFake = fileURLToPath(new URL("./fakes/ffmpeg-fail-part.mjs", import.meta.url));
const NOW = () => new Date("2026-11-09T01:02:03.000Z");
const CAPS = { drawtext: false, drawtext_detail: null };

async function setup() {
  const root = tmp("rnd-");
  const media = makeVideo(join(root, "src", "src.mp4"), { w: 320, h: 180, seconds: 12, tone: true });
  const out = join(root, "out");
  const f = await planFromMedia(out, media, { settings: { target_s: 5, max_s: 8, background: "color:#000000" } });
  const go = (extra = {}, ctx = {}) => renderParts({ tools: TOOLS, now: NOW, ...ctx }, { plan: f.plan, planDir: out, timeline: f.timeline, caps: CAPS, signals: f.signals, preset: "ultrafast", ...extra });
  return { root, media, out, f, go };
}

test("partName pads to the width of N", () => {
  assert.equal(partName(1, 4), "part-01-of-04.mp4");
  assert.equal(partName(7, 120), "part-007-of-120.mp4");
});

test("fresh render, then resume skips matching parts", { skip }, async () => {
  const { out, f, go } = await setup();
  const first = await go();
  const N = f.plan.parts.length;
  assert.deepEqual(first.results.map((r) => r.status), Array(N).fill("rendered"));
  const names = readdirSync(join(out, "parts"));
  assert.deepEqual(names.sort(), f.plan.parts.map((p) => partName(p.index, N)).sort());
  const m = readManifest(out);
  for (const r of first.results) assert.equal(r.sha256, await sha256File(join(out, r.file)));
  assert.equal(m.parts.length, N);
  const mtimes = first.results.map((r) => statSync(join(out, r.file)).mtimeMs);
  const again = await go();
  assert.deepEqual(again.results.map((r) => r.status), Array(N).fill("skipped"));
  assert.deepEqual(again.results.map((r) => statSync(join(out, r.file)).mtimeMs), mtimes);
});

test("a changed range is CONFLICT; --replace moves old files aside", { skip }, async () => {
  const { out, f, go } = await setup();
  await go();
  const before = await sha256File(join(out, "parts", partName(1, f.plan.parts.length)));
  const p = f.plan.parts;
  const alt = f.candidates.find((c) => c.frame !== p[0].end_frame && c.frame > p[0].start_frame + 60 && c.frame < p[1].end_frame - 60 && p[1].end_s - c.t <= f.plan.settings.max_s && !c.forced_only);
  p[0].end_frame = alt.frame; p[0].end_s = alt.t; p[0].end_sample = alt.sample; p[0].duration_s = alt.t;
  p[1].start_frame = alt.frame; p[1].start_s = alt.t; p[1].start_sample = alt.sample; p[1].duration_s = p[1].end_s - alt.t;
  await assert.rejects(go(), (e) => e.code === "CONFLICT" && /--replace/.test(e.message) && e.detail.files.length >= 2);
  assert.equal(await sha256File(join(out, "parts", partName(1, p.length))), before);
  const replaced = await go({ replace: true });
  assert.equal(replaced.superseded, "superseded/2026-11-09T01-02-03-000Z");
  assert.ok(existsSync(join(out, replaced.superseded, "parts", partName(1, p.length))));
  assert.ok(existsSync(join(out, replaced.superseded, "manifest.json")));
  assert.notEqual(await sha256File(join(out, "parts", partName(1, p.length))), before);
});

test("a stale file with a different N is CONFLICT", { skip }, async () => {
  const { out, go } = await setup();
  await go();
  writeFileSync(join(out, "parts", "part-01-of-09.mp4"), "stale");
  await assert.rejects(go(), (e) => e.code === "CONFLICT" && e.detail.files.includes("parts/part-01-of-09.mp4"));
});

test("a failing part names itself and leaves earlier parts and the source intact", { skip }, async () => {
  const { media, out, go } = await setup();
  const srcHash = await sha256File(media);
  const ctx = { tools: { ...TOOLS, ffmpeg: [process.execPath, failFake] }, env: { ...process.env, FAKE_REAL_FFMPEG: FFMPEG } };
  await assert.rejects(go({}, ctx), (e) => e.code === "HARD" && /part 2/.test(e.message) && /simulated render failure/.test(e.message));
  const names = readdirSync(join(out, "parts"));
  assert.ok(names.some((n) => n.startsWith("part-01-of-")));
  assert.ok(!names.some((n) => n.includes(".tmp.")));
  assert.equal(await sha256File(media), srcHash);
  assert.equal(readManifest(out).parts.length, 1);
});

test("a source with delayed audio passes QC on every part, including the last", { skip }, async () => {
  const root = tmp("rnd-");
  const media = offsetAudio(makeVideo(join(root, "src", "b.mp4"), { seconds: 12, tone: true }), join(root, "src", "o.mp4"), 0.5);
  const out = join(root, "out");
  const f = await planFromMedia(out, media, { settings: { target_s: 5, max_s: 8, background: "color:#000000" } });
  const r = await renderParts({ tools: TOOLS, now: NOW }, { plan: f.plan, planDir: out, timeline: f.timeline, caps: CAPS, signals: f.signals, preset: "ultrafast" });
  assert.ok(r.results.every((x) => x.qc.checks.av_sync.status === "PASS"), JSON.stringify(r.results.map((x) => x.qc.checks.av_sync)));
});

test("a crash after --replace keeps the good parts in the progress manifest", { skip }, async () => {
  const { out, f, go } = await setup();
  await go();
  const N = f.plan.parts.length;
  const p = f.plan.parts;
  const alt = f.candidates.find((c) => c.frame !== p[0].end_frame && c.frame > p[0].start_frame + 60 && c.frame < p[1].end_frame - 60 && p[1].end_s - c.t <= f.plan.settings.max_s && !c.forced_only);
  p[0].end_frame = alt.frame; p[0].end_s = alt.t; p[0].end_sample = alt.sample; p[0].duration_s = alt.t;
  p[1].start_frame = alt.frame; p[1].start_s = alt.t; p[1].start_sample = alt.sample; p[1].duration_s = p[1].end_s - alt.t;
  const ctx = { tools: { ...TOOLS, ffmpeg: [process.execPath, failFake] }, env: { ...process.env, FAKE_REAL_FFMPEG: FFMPEG } };
  await assert.rejects(go({ replace: true }, ctx), (e) => e.code === "HARD" && /part 2/.test(e.message));
  const listed = readManifest(out).parts.map((x) => x.index);
  assert.deepEqual(listed, [1, ...Array.from({ length: N - 2 }, (_, i) => i + 3)]);
  const resumed = await go();
  assert.deepEqual(resumed.results.map((x) => x.status), ["skipped", "rendered", ...Array(N - 2).fill("skipped")]);
});

test("a part failing QC is not promoted", { skip }, async () => {
  const { out, f, go } = await setup();
  f.plan.settings.max_s = 1;
  await assert.rejects(go(), (e) => e.code === "HARD" && /failed QC/.test(e.message) && /duration/.test(e.message));
  assert.deepEqual(readdirSync(join(out, "parts")), []);
});
