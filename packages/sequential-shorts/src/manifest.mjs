import { join } from "node:path";
import { VERSION } from "./envelope.mjs";
import { readJsonIfExists, writeFileAtomic, writeJsonAtomic } from "./run/fsx.mjs";

export const MANIFEST_SCHEMA = "sequential-shorts/manifest@1";

export const readManifest = (dir) => readJsonIfExists(join(dir, "manifest.json"));

export function timecode(s) {
  const ms = Math.round(s * 1000);
  const p = (n, w = 2) => String(n).padStart(w, "0");
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)}.${p(ms % 1000, 3)}`;
}

// Spec section 8.4.
export function buildManifest({ plan, status, sha256_after, records = null, tools, caps, transcript, render, results, coverage, review, warnings, not_run, superseded = null, now = () => new Date() }) {
  return {
    schema: MANIFEST_SCHEMA, version: VERSION, status, created_at: now().toISOString(),
    source: { path: plan.source.path, sha256_before: plan.source.sha256, sha256_after, unchanged: sha256_after === plan.source.sha256 },
    imagine_records: records,
    settings: plan.settings,
    tools: { ...tools, drawtext: caps.drawtext, faster_whisper: transcript?.provenance?.faster_whisper ?? null, asr_model: transcript?.provenance?.model ?? null },
    transcript: transcript ? { status: transcript.status, reasons: transcript.reasons, language: transcript.language, language_probability: transcript.language_probability, provenance: transcript.provenance } : null,
    boundaries: plan.parts.slice(0, -1).map((p) => ({ after_part: p.index, t_s: p.end_s, frame: p.end_frame, sample: p.end_sample, ...p.boundary_out })),
    render,
    parts: results.map((r) => {
      const p = plan.parts[r.index - 1];
      return { index: r.index, of: p.of, file: r.file, sha256: r.sha256, range_hash: r.range_hash, status: r.status, start_s: r.start_s, end_s: r.end_s, duration_s: r.duration_s,
        start_frame: p.start_frame, end_frame: p.end_frame, start_sample: p.start_sample, end_sample: p.end_sample, title: p.title, description: p.description, qc: r.qc };
    }),
    qc: { status: coverage.status === "PASS" && results.every((r) => r.qc.status === "PASS") ? "PASS" : "FAIL", coverage, report: "qa/qc.json", review: "qa/review.json", cuts: review?.cuts?.length ?? 0 },
    superseded, warnings, not_run,
  };
}

export function manifestMarkdown(manifest, plan) {
  const L = [`# Sequential Shorts: ${plan.source.path.split("/").at(-1)}`, "",
    `Source: \`${plan.source.path}\` (sha256 \`${plan.source.sha256}\`), ${plan.source.duration_s} s, ${plan.parts.length} parts. QC: ${manifest.qc?.status ?? "not run"}.`, "",
    "| Part | File | Duration | Source in | Source out | Title |", "| --- | --- | --- | --- | --- | --- |"];
  for (const p of plan.parts) {
    const file = manifest.parts.find((x) => x.index === p.index)?.file ?? "(not rendered)";
    L.push(`| ${p.index}/${p.of} | \`${file}\` | ${p.duration_s.toFixed(3)} s | ${timecode(p.start_s)} | ${timecode(p.end_s)} | ${p.title || "(untitled)"} |`);
  }
  for (const p of plan.parts) {
    const b = p.boundary_out;
    L.push("", `## Part ${p.index}/${p.of}: ${p.title || "(untitled)"}`, "",
      `- Source: ${timecode(p.start_s)} to ${timecode(p.end_s)} (${p.duration_s.toFixed(3)} s)`,
      `- Cut after this part: ${b.kind}${b.kind === "end" ? "" : ` (cost ${b.cost})`}${b.forced ? `, forced: ${b.forced_reason}` : ""}${b.uncertain && !b.forced ? ", uncertain" : ""}`,
      "- Upload description:", "", p.description || "(none yet; fill `description` in plan.json and rerun `render --plan`)");
  }
  if (manifest.warnings?.length) L.push("", "## Warnings", "", ...manifest.warnings.map((w) => `- ${w.message}`));
  if (manifest.not_run?.length) L.push("", "## Not run", "", ...manifest.not_run.map((n) => `- ${n.check}${n.item ? ` ${n.item}` : ""}: ${n.reason}`));
  return `${L.join("\n")}\n`;
}

export function writeManifest(dir, manifest, plan = null) {
  writeJsonAtomic(join(dir, "manifest.json"), manifest);
  if (plan) writeFileAtomic(join(dir, "manifest.md"), manifestMarkdown(manifest, plan));
}
