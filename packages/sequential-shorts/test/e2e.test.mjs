import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { run } from "../src/cli.mjs";
import { readJson, writeJsonAtomic } from "../src/run/fsx.mjs";
import { TOOLS, fakeUv, hasFfmpeg, makeVideo, speechWav, tmp, writeAsrReply } from "./helpers/media.mjs";

const skip = !hasFfmpeg && "NOT_RUN: ffmpeg not available";
const NOW = () => new Date("2026-11-09T01:02:03.000Z");

function synthetic() {
  const root = tmp("e2e-");
  const { words, duration } = speechWav(join(root, "src", "vo.wav"), { sentences: Array(80).fill(10) });
  const segs = [];
  for (let t = 0; t < duration; t += 45) segs.push({ color: segs.length % 2 ? "0x406020" : "0x204060", seconds: Math.min(45, duration - t) });
  const media = makeVideo(join(root, "src", "talk.mp4"), { w: 320, h: 180, segments: segs, edges: true, wav: join(root, "src", "vo.wav") });
  const reply = writeAsrReply(root, words);
  const log = join(root, "uv.log");
  const ctx = (mode = "ok") => ({ tools: { ...TOOLS, uv: [process.execPath, fakeUv] }, env: { ...process.env, FAKE_UV_MODE: mode, FAKE_UV_REPLY: reply, FAKE_UV_LOG: log },
    x264Preset: "ultrafast", now: NOW });
  return { root, media, out: join(root, "out"), duration, ctx, log };
}
const args = (s, extra = []) => ["run", "--input", s.media, "--output", s.out, "--language", "id", "--background", "color:#101820", ...extra];
const uvCalls = (log) => (existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").length : 0);

test("synthetic 6-minute talk: plan, render, resume, edit, conflict, replace", { skip, timeout: 900000 }, async () => {
  const s = synthetic();
  assert.ok(s.duration > 330 && s.duration < 400, `duration ${s.duration}`);
  const first = await run(args(s), s.ctx());
  assert.equal(first.exit, 0, JSON.stringify(first.env.errors));
  const plan = readJson(join(s.out, "plan.json"));
  assert.ok(plan.parts.length >= 5 && plan.parts.length <= 7, `${plan.parts.length} parts`);
  for (const p of plan.parts) assert.ok(p.duration_s >= 30 && p.duration_s <= 90, `part ${p.index}: ${p.duration_s} s`);
  for (const p of plan.parts.slice(0, -1)) assert.match(p.boundary_out.kind, /^sentence_end/);
  assert.equal(first.env.data.qc, "PASS");
  assert.deepEqual(readdirSync(join(s.out, "parts")).length, plan.parts.length);
  for (const f of ["candidates.json", "transcript.json", "manifest.json", "manifest.md", "qa/qc.json", "qa/review.json", "work/probe.json", "work/frames.json", "work/signals.json"]) {
    assert.ok(existsSync(join(s.out, f)), `${f} missing`);
  }
  const cuts = plan.parts.length - 1;
  assert.equal(first.env.not_run.filter((n) => n.check === "listening").length, cuts);
  assert.equal(first.env.not_run.filter((n) => n.check === "visual").length, cuts);
  assert.equal(readJson(join(s.out, "manifest.json")).source.unchanged, true);
  assert.ok(readJson(join(s.out, "manifest.json")).tools.binaries.ffmpeg, "resolved ffmpeg binary is recorded");
  assert.equal(uvCalls(s.log), 1);

  const again = await run(args(s), s.ctx());
  assert.equal(again.exit, 0);
  assert.equal(uvCalls(s.log), 1, "transcript.json must be reused");
  assert.ok(again.env.data.parts.every((p) => p.status === "skipped"));

  const titled = readJson(join(s.out, "plan.json"));
  titled.parts[1].title = "Judul saja";
  writeJsonAtomic(join(s.out, "plan.json"), titled);
  const textOnly = await run(args(s), s.ctx());
  assert.equal(textOnly.exit, 0, JSON.stringify(textOnly.env.errors));
  assert.equal(readJson(join(s.out, "plan.json")).parts[1].title, "Judul saja");
  assert.ok(textOnly.env.data.parts.every((p) => p.status === "skipped"));

  const cands = readJson(join(s.out, "candidates.json")).candidates;
  const edited = readJson(join(s.out, "plan.json"));
  const [a, b] = edited.parts;
  const alt = cands.find((c) => c.kind.startsWith("sentence_end") && c.frame !== a.end_frame && c.t > a.end_s - 15 && c.t < a.end_s - 3);
  a.end_frame = alt.frame; a.end_s = alt.t; a.end_sample = alt.sample; a.duration_s = Math.round((alt.t - a.start_s) * 1e6) / 1e6;
  b.start_frame = alt.frame; b.start_s = alt.t; b.start_sample = alt.sample; b.duration_s = Math.round((b.end_s - alt.t) * 1e6) / 1e6;
  a.boundary_out = { kind: alt.kind, candidate_id: alt.id, evidence: alt.evidence, cost: alt.cost, forced: false, forced_reason: null, uncertain: false };
  a.title = "Bagian satu";
  writeJsonAtomic(join(s.out, "plan.json"), edited);
  const planPath = join(s.out, "plan.json");
  assert.equal((await run(["validate", "--plan", planPath], s.ctx())).exit, 0);
  const conflict = await run(["render", "--plan", planPath], s.ctx());
  assert.equal(conflict.exit, 4);
  assert.ok(conflict.env.errors[0].cause.files.some((f) => f.startsWith("parts/part-01-of-")));
  const replaced = await run(["render", "--plan", planPath, "--replace"], s.ctx());
  assert.equal(replaced.exit, 0, JSON.stringify(replaced.env.errors));
  assert.ok(existsSync(join(s.out, "superseded", "2026-11-09T01-02-03-000Z", "parts")));
  assert.deepEqual(replaced.env.data.parts.map((p) => p.status).slice(0, 2), ["rendered", "rendered"]);
  assert.ok(replaced.env.data.parts.slice(2).every((p) => p.status === "skipped"));
  assert.match(readFileSync(join(s.out, "manifest.md"), "utf8"), /Part 1\/\d: Bagian satu/);

  const rerun = await run(args(s), s.ctx());
  assert.equal(rerun.exit, 4);
  assert.equal(rerun.env.errors[0].item, "plan.json");
});

test("missing uv is BLOCKED and writes nothing", { skip }, async () => {
  const root = tmp("e2e-");
  const media = makeVideo(join(root, "src", "a.mp4"), { seconds: 2, tone: true });
  const r = await run(["run", "--input", media, "--output", join(root, "out")], { tools: { ...TOOLS, uv: "/nonexistent/uv" } });
  assert.equal(r.exit, 3);
  assert.equal(r.env.code, "BLOCKED");
  assert.ok(!existsSync(join(root, "out")));
});

test("output in the input directory is HARD", { skip }, async () => {
  const root = tmp("e2e-");
  const media = makeVideo(join(root, "src", "a.mp4"), { seconds: 2, tone: true });
  const r = await run(["run", "--input", media, "--output", dirname(media)], { tools: { ...TOOLS, uv: [process.execPath, fakeUv] } });
  assert.equal(r.exit, 1);
  assert.equal(r.env.errors[0].check, "write-boundary");
});

test("ASR failure warns and plans on silence, scenes and grid", { skip, timeout: 300000 }, async () => {
  const s = synthetic();
  const r = await run(args(s, ["--plan-only"]), s.ctx("fail"));
  assert.equal(r.exit, 0, JSON.stringify(r.env.errors));
  assert.equal(r.env.data.vo.status, "failed");
  assert.ok(r.env.warnings.some((w) => /no reliable speech/.test(w.message)));
  assert.deepEqual(r.env.not_run, [{ check: "render", item: null, reason: "--plan-only: review plan.json, then run render --plan" }]);
  assert.ok(!existsSync(join(s.out, "parts")));
  for (const p of readJson(join(s.out, "plan.json")).parts) assert.ok(p.duration_s <= 90);
});

test("usage errors exit 2", async () => {
  const base = ["run", "--input", "/x.mp4", "--output", "/tmp/never"];
  for (const extra of [["--max-seconds", "200"], ["--target-seconds", "60", "--max-seconds", "40"], ["--background", "red"], ["--language", "Indonesian"], ["--marker", "maybe"], ["--asr-revision", "a b;rm"], ["--target-seconds", "abc"]]) {
    const r = await run([...base, ...extra]);
    assert.equal(r.exit, 2, extra.join(" "));
  }
  assert.equal((await run(["run", "--output", "/tmp/x"])).exit, 2);
  assert.equal((await run(["render"])).exit, 2);
});
