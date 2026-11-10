import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { run } from "../src/cli.mjs";
import { findImagineProject } from "../src/guard.mjs";
import { readJson } from "../src/run/fsx.mjs";

const INPUT = process.env.SEQ_SHORTS_LIVE_INPUT
  ?? join(homedir(), "content/.imagine/2026-11-07-kontrak-yang-bikin-kamu-gak-bisa-resign/post/kontrak-yang-bikin-kamu-gak-bisa-resign.v1.mp4");
const skip = (process.env.SEQ_SHORTS_LIVE !== "1" && "NOT_RUN: set SEQ_SHORTS_LIVE=1 to run real ASR on the live film")
  || (!existsSync(INPUT) && `NOT_RUN: live input not found: ${INPUT}`);

test("live: Indonesian film to a Shorts series with real faster-whisper", { skip, timeout: 3 * 3600 * 1000 }, async () => {
  const project = findImagineProject(INPUT);
  assert.ok(project, "the live input should sit inside an Imagine project");
  const out = join(project, "tmp", "sequential-shorts-live");
  const planned = await run(["run", "--input", INPUT, "--output", out, "--language", "id", "--plan-only"]);
  assert.equal(planned.exit, 0, JSON.stringify(planned.env.errors));
  const transcript = readJson(join(out, "transcript.json"));
  assert.equal(transcript.status, "ok", transcript.reasons.join("; "));
  assert.equal(transcript.language, "id");
  assert.ok(transcript.provenance.model.revision, "model revision must be recorded");
  assert.equal(transcript.provenance.faster_whisper, "1.2.1");

  const rendered = await run(["render", "--plan", join(out, "plan.json")]);
  assert.equal(rendered.exit, 0, JSON.stringify(rendered.env.errors));
  const m = readJson(join(out, "manifest.json"));
  assert.ok(m.parts.length >= 4 && m.parts.length <= 5, `${m.parts.length} parts`);
  for (const p of m.parts) assert.ok(p.duration_s <= 90, `part ${p.index}: ${p.duration_s} s`);
  assert.equal(m.qc.status, "PASS");
  assert.equal(m.source.unchanged, true);
  assert.deepEqual(m.imagine_records.changed, []);
  assert.ok(m.parts.every((p) => p.sha256 && p.sha256.length === 64));
});
