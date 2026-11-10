import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildManifest, manifestMarkdown, readManifest, timecode, writeManifest } from "../src/manifest.mjs";
import { tmp } from "./helpers/media.mjs";
import { writeFixturePlan } from "./helpers/plan.mjs";

const NOW = () => new Date("2026-11-09T01:02:03.000Z");

function fixture() {
  const dir = tmp("man-");
  const { plan } = writeFixturePlan(dir);
  plan.parts[0].title = "Kontrak yang mengikat";
  plan.parts[0].description = "Bagian pertama. #shorts";
  const results = plan.parts.map((p) => ({ index: p.index, file: `parts/part-0${p.index}-of-02.mp4`, sha256: "a".repeat(64), range_hash: "r", status: "rendered",
    start_s: p.start_s, end_s: p.end_s, duration_s: p.duration_s, qc: { status: "PASS", checks: {}, counts: { frames: 1, samples: 1 } } }));
  const manifest = buildManifest({ plan, status: "complete", sha256_after: plan.source.sha256,
    records: { root: "/p", before: { "project.yaml": "x" }, after: { "project.yaml": "x" }, changed: [] },
    tools: { ffmpeg: "ffmpeg version 9.0.2", ffprobe: "ffprobe version 9.0.2", uv: "uv 0.9.0" }, caps: { drawtext: true, drawtext_detail: null },
    transcript: { status: "ok", reasons: [], language: "id", language_probability: 0.98, provenance: { engine: "faster-whisper", faster_whisper: "1.2.1", model: { name: "large-v3-turbo", repo: "r", revision: "abc", cached: true } } },
    render: { layout: "contain", marker: { mode: "auto", draw: true, style: "band", warning: null }, preset: "medium", commands: [{ part: 1, argv: ["ffmpeg", "-i", "x"] }] },
    results, coverage: { status: "PASS" }, review: { cuts: [{ cut: "01-02", visual: "NOT_RUN", listening: "NOT_RUN" }] },
    warnings: [{ check: "vo", message: "w" }], not_run: [{ check: "listening", item: "cut-01-02", reason: "agent cannot listen" }], superseded: null, now: NOW });
  return { dir, plan, manifest };
}

test("timecode formats HH:MM:SS.mmm", () => {
  assert.equal(timecode(0), "00:00:00.000");
  assert.equal(timecode(61.2), "00:01:01.200");
  assert.equal(timecode(3725.0456), "01:02:05.046");
});

test("manifest.json carries every spec section 8.4 field", () => {
  const { plan, manifest } = fixture();
  assert.equal(manifest.schema, "sequential-shorts/manifest@1");
  assert.equal(manifest.status, "complete");
  assert.equal(manifest.created_at, "2026-11-09T01:02:03.000Z");
  assert.deepEqual(manifest.source, { path: plan.source.path, sha256_before: plan.source.sha256, sha256_after: plan.source.sha256, unchanged: true });
  assert.deepEqual(manifest.imagine_records.changed, []);
  assert.equal(manifest.tools.faster_whisper, "1.2.1");
  assert.deepEqual(manifest.tools.asr_model, { name: "large-v3-turbo", repo: "r", revision: "abc", cached: true });
  assert.equal(manifest.boundaries.length, plan.parts.length - 1);
  assert.ok(manifest.boundaries[0].evidence.length > 0);
  assert.equal(manifest.render.commands[0].argv[0], "ffmpeg");
  assert.equal(manifest.parts[0].sha256, "a".repeat(64));
  assert.equal(manifest.parts[0].title, "Kontrak yang mengikat");
  assert.equal(manifest.parts[0].qc.status, "PASS", "full per-part QC is kept so resume can reuse it");
  assert.equal(manifest.qc.status, "PASS");
  assert.equal(manifest.not_run.length, 1);
});

test("manifest.md has titles, timecodes and descriptions, no em dash", () => {
  const { dir, plan, manifest } = fixture();
  writeManifest(dir, manifest, plan);
  const md = readFileSync(join(dir, "manifest.md"), "utf8");
  assert.equal(md, manifestMarkdown(manifest, plan));
  assert.match(md, /## Part 1\/2: Kontrak yang mengikat/);
  assert.match(md, /00:00:00\.000 to 00:01:\d\d\.\d{3}/);
  assert.match(md, /Bagian pertama\. #shorts/);
  assert.match(md, /## Part 2\/2: \(untitled\)/);
  assert.doesNotMatch(md, /—/);
  assert.equal(readManifest(dir).status, "complete");
});
