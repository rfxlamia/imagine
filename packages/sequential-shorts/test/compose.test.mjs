import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { detectCaps } from "../src/run/caps.mjs";
import { composeArgs, containGeometry, layoutFor, resolveMarker } from "../src/render/compose.mjs";
import { FFMPEG, TOOLS, countFrames, countSamples, framePixel, hasDrawtext, hasFfmpeg, makeVideo, offsetAudio, rotate, streams, tmp } from "./helpers/media.mjs";
import { cfrTimeline, writeFixturePlan } from "./helpers/plan.mjs";
import { OFF_MARKER, planFromMedia, renderWith } from "./helpers/render.mjs";

const skip = !hasFfmpeg && "NOT_RUN: ffmpeg not available";
const src = (w, h, extra = {}) => ({ display_width: w, display_height: h, ...extra });
const graphOf = (args) => args[args.indexOf("-filter_complex") + 1];

test("layout and contain geometry", () => {
  assert.equal(layoutFor(src(1080, 1920)), "passthrough");
  assert.equal(layoutFor(src(720, 1280)), "passthrough");
  assert.equal(layoutFor(src(1920, 1080)), "contain");
  assert.equal(layoutFor(src(1080, 1350)), "contain");
  assert.deepEqual(containGeometry(src(1920, 1080)), { w: 1080, h: 608, x: 0, y: 656 });
});

test("marker resolution", () => {
  const yes = { drawtext: true };
  const no = { drawtext: false, drawtext_detail: "No such filter: 'drawtext'" };
  assert.equal(resolveMarker("auto", "passthrough", yes, src(1080, 1920)).draw, false);
  assert.deepEqual(resolveMarker("auto", "contain", yes, src(1920, 1080)), { mode: "auto", draw: true, style: "band", warning: null });
  const fallback = resolveMarker("auto", "contain", no, src(1920, 1080));
  assert.equal(fallback.draw, false);
  assert.match(fallback.warning, /drawtext/);
  assert.throws(() => resolveMarker("on", "contain", no, src(1920, 1080)), (e) => e.code === "HARD" && e.check === "marker");
  assert.equal(resolveMarker("on", "passthrough", yes, src(1080, 1920)).style, "pill");
  assert.equal(resolveMarker("off", "contain", yes, src(1920, 1080)).draw, false);
});

test("argv: seek, frame/sample trims, open last part, layouts", () => {
  const dir = tmp("cmp-");
  const f = writeFixturePlan(dir);
  const tl = f.timeline;
  const [p1, p2] = f.plan.parts;
  const a1 = composeArgs({ plan: f.plan, part: p1, timeline: tl, marker: OFF_MARKER, out: "/o1.mp4" });
  assert.ok(!a1.args.includes("-ss"));
  assert.match(graphOf(a1.args), new RegExp(`trim=start_frame=0:end_frame=${p1.end_frame},setpts=PTS-STARTPTS`));
  assert.match(graphOf(a1.args), new RegExp(`atrim=start_sample=0:end_sample=${p1.end_sample},asetpts=PTS-STARTPTS`));
  assert.match(graphOf(a1.args), /gblur=sigma=30/);
  assert.match(graphOf(a1.args), /overlay=0:656/);
  const a2 = composeArgs({ plan: f.plan, part: p2, timeline: tl, marker: OFF_MARKER, out: "/o2.mp4" });
  const seek = tl.snapFrame(p2.start_s - 3);
  assert.equal(a2.seek_frame, seek);
  assert.equal(a2.args[a2.args.indexOf("-ss") + 1], ((tl.frameTime(seek - 1) + tl.frameTime(seek)) / 2).toFixed(6));
  assert.match(graphOf(a2.args), new RegExp(`trim=start_frame=${p2.start_frame - seek},setpts`));
  assert.doesNotMatch(graphOf(a2.args), /end_frame|end_sample/);
  const enc = a2.args.slice(a2.args.indexOf("-c:v"), a2.args.indexOf("-movflags"));
  assert.deepEqual(enc, ["-c:v", "libx264", "-crf", "18", "-preset", "medium", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-ar", "48000"]);
  assert.ok(a2.args.includes("+faststart"));
  const color = composeArgs({ plan: { ...f.plan, settings: { ...f.plan.settings, background: "color:#112233" } }, part: p1, timeline: tl, marker: OFF_MARKER, out: "/o.mp4" });
  assert.match(graphOf(color.args), /pad=1080:1920:0:656:color=0x112233/);
  const tall = { ...f.plan, source: { ...f.plan.source, display_width: 1080, display_height: 1920 } };
  assert.doesNotMatch(graphOf(composeArgs({ plan: tall, part: p1, timeline: tl, marker: OFF_MARKER, out: "/o.mp4" }).args), /scale=/);
  const small = { ...f.plan, source: { ...f.plan.source, display_width: 720, display_height: 1280 } };
  assert.match(graphOf(composeArgs({ plan: small, part: p1, timeline: tl, marker: OFF_MARKER, out: "/o.mp4" }).args), /scale=1080:1920:flags=lanczos/);
});

test("argv: marker text, VFR conversion and audio offset", () => {
  const dir = tmp("cmp-");
  const f = writeFixturePlan(dir);
  const p2 = f.plan.parts[1];
  const band = composeArgs({ plan: f.plan, part: p2, timeline: f.timeline, marker: { mode: "auto", draw: true, style: "band", warning: null }, out: "/o.mp4" });
  assert.match(graphOf(band.args), /drawtext=font=Sans:text='Part 2\/2'/);
  const vfrPlan = { ...f.plan, source: { ...f.plan.source, fps_mode: "vfr" } };
  const vfr = composeArgs({ plan: vfrPlan, part: p2, timeline: f.timeline, marker: OFF_MARKER, out: "/o.mp4" });
  assert.match(graphOf(vfr.args), /setpts=PTS-STARTPTS,fps=30\/1/);
  assert.ok(vfr.args.includes("-fps_mode"));
  const off = { ...f.plan, source: { ...f.plan.source, audio_offset_s: 0.5 } };
  const p1 = composeArgs({ plan: off, part: f.plan.parts[0], timeline: f.timeline, marker: OFF_MARKER, out: "/o.mp4" });
  assert.match(graphOf(p1.args), /atrim=start_sample=0:end_sample=\d+,asetpts=PTS-STARTPTS,adelay=delays=24000S:all=1/);
});

test("detectCaps reports drawtext availability", { skip }, async () => {
  const caps = await detectCaps({ tools: TOOLS });
  assert.equal(caps.drawtext, hasDrawtext);
});

async function renderAll(dir, media, settings) {
  const f = await planFromMedia(dir, media, { settings: { target_s: 5, max_s: 8, marker: "off", ...settings } });
  const outs = f.plan.parts.map((p) => renderWith(f.plan, p, f.timeline, OFF_MARKER, join(dir, `p${p.index}.mp4`)));
  return { f, outs };
}

test("16:9 contain keeps both edges and the cuts are exact", { skip }, async () => {
  const dir = tmp("cmp-");
  const media = makeVideo(join(dir, "src.mp4"), { w: 320, h: 180, seconds: 12, edges: true, tone: true });
  const { f, outs } = await renderAll(dir, media, { background: "blur" });
  assert.ok(outs.length >= 2);
  const s = streams(outs[0]);
  assert.equal(`${s.video.width}x${s.video.height}`, "1080x1920");
  const [lr, lg] = framePixel(outs[0], 1, 20, 960);
  const [rr, rg] = framePixel(outs[0], 1, 1060, 960);
  assert.ok(lr > 180 && lg < 90, `left edge lost: ${lr},${lg}`);
  assert.ok(rg > 180 && rr < 90, `right edge lost: ${rr},${rg}`);
  assert.equal(outs.reduce((n, o) => n + countFrames(o), 0), countFrames(media));
  const diff = outs.reduce((n, o) => n + countSamples(o), 0) - countSamples(media);
  assert.ok(Math.abs(diff) <= 1024 * outs.length, `sample diff ${diff}`);
  assert.equal(f.plan.source.fps_mode, "cfr");
});

test("30000/1001 source: frames exact, samples within tolerance", { skip }, async () => {
  const dir = tmp("cmp-");
  const media = makeVideo(join(dir, "src.mp4"), { w: 320, h: 180, seconds: 10, fps: "30000/1001", tone: true });
  const { outs } = await renderAll(dir, media, { background: "color:#000000" });
  assert.equal(outs.reduce((n, o) => n + countFrames(o), 0), countFrames(media));
  const diff = outs.reduce((n, o) => n + countSamples(o), 0) - countSamples(media);
  assert.ok(Math.abs(diff) <= 1024 * outs.length, `sample diff ${diff}`);
});

test("rotated 16:9 file is treated as 9:16 passthrough", { skip }, async () => {
  const dir = tmp("cmp-");
  const media = rotate(makeVideo(join(dir, "b.mp4"), { w: 320, h: 180, seconds: 6, tone: true }), join(dir, "r.mp4"), 90);
  const { f, outs } = await renderAll(dir, media, {});
  assert.equal(layoutFor(f.plan.source), "passthrough");
  const s = streams(outs[0]);
  assert.equal(`${s.video.width}x${s.video.height}`, "1080x1920");
});

test("audio offset is padded so the first part stays in sync", { skip }, async () => {
  const dir = tmp("cmp-");
  const media = offsetAudio(makeVideo(join(dir, "b.mp4"), { seconds: 12, tone: true }), join(dir, "o.mp4"), 0.5);
  const { outs } = await renderAll(dir, media, {});
  const s = streams(outs[0]);
  assert.ok(Math.abs(Number(s.audio.duration) - Number(s.video.duration)) < 0.08, `${s.audio.duration} vs ${s.video.duration}`);
});

test("drawtext marker draws into the top band", { skip: (!hasDrawtext && "NOT_RUN: ffmpeg drawtext unavailable (see Task 0)") || skip }, async () => {
  const dir = tmp("cmp-");
  const media = makeVideo(join(dir, "src.mp4"), { w: 320, h: 180, seconds: 6, tone: true });
  const f = await planFromMedia(dir, media, { settings: { target_s: 5, max_s: 8, background: "color:#000000" } });
  const p = f.plan.parts[0];
  const on = renderWith(f.plan, p, f.timeline, { mode: "on", draw: true, style: "band", warning: null }, join(dir, "on.mp4"));
  const off = renderWith(f.plan, p, f.timeline, OFF_MARKER, join(dir, "off.mp4"));
  const band = (file) => spawnSync(FFMPEG, ["-v", "error", "-ss", "1", "-i", file, "-frames:v", "1", "-vf", "crop=1080:400:0:100", "-f", "rawvideo", "-pix_fmt", "gray", "-"], { maxBuffer: 1 << 24 }).stdout;
  assert.notDeepEqual(band(on), band(off));
});
