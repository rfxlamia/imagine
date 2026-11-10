import { join } from "node:path";
import { ShortsError } from "../errors.mjs";
import { checkOutputDir, diffRecords, findImagineProject, hashImagineRecords } from "../guard.mjs";
import { buildManifest, writeManifest } from "../manifest.mjs";
import { validatePlanFile } from "../plan/validate.mjs";
import { requireTools } from "../preflight.mjs";
import { boundaryEvidence } from "../qa/evidence.mjs";
import { coverage, writeQcReport } from "../qa/qc.mjs";
import { OUT } from "../render/compose.mjs";
import { renderParts } from "../render/render.mjs";
import { detectCaps } from "../run/caps.mjs";
import { readJsonIfExists } from "../run/fsx.mjs";
import { sha256File } from "../run/hash.mjs";
import { toolArgv } from "../run/tools.mjs";

// Shared by `run` (after planning) and `render --plan`.
export async function renderFromPlan(ctx, { planPath, replace = false, warnings: pre = [], not_run: preNotRun = [], recordsBefore = null, tools = null }) {
  const v = await validatePlanFile(ctx, planPath);
  if (v.errors.length) return { code: "HARD", data: { plan: v.planPath, valid: false }, errors: v.errors, warnings: v.warnings };
  const { plan, planDir, timeline } = v;
  checkOutputDir(plan.source.path, planDir);
  const projectRoot = findImagineProject(plan.source.path);
  const before = recordsBefore ?? (projectRoot ? await hashImagineRecords(projectRoot) : null);
  const toolVersions = { ...(tools ?? (await requireTools(ctx, ["ffmpeg", "ffprobe"]))),
    binaries: Object.fromEntries(["ffmpeg", "ffprobe"].map((n) => [n, toolArgv(ctx, n).join(" ")])) };
  const caps = await detectCaps(ctx);
  const signals = readJsonIfExists(join(planDir, "work", "signals.json"));
  const transcript = readJsonIfExists(join(planDir, "transcript.json"));
  const preset = ctx.x264Preset ?? OUT.preset;
  const r = await renderParts(ctx, { plan, planDir, timeline, caps, signals, replace, preset });
  const cov = coverage({ plan, results: r.results });
  const review = await boundaryEvidence(ctx, { plan, planDir, results: r.results, transcript });
  const sha256_after = await sha256File(plan.source.path);
  const after = projectRoot ? await hashImagineRecords(projectRoot) : null;
  const changed = before && after ? diffRecords(before, after) : [];
  const records = projectRoot ? { root: projectRoot, before: before.files, after: after.files, changed } : null;

  const warnings = [...pre, ...v.warnings];
  if (r.marker.warning) warnings.push({ check: "marker", message: r.marker.warning });
  if (plan.vo.status !== "ok") warnings.push({ check: "vo", message: `no reliable speech (${plan.vo.status}): cuts use silence, scene cuts and a frame grid` });
  for (const p of plan.parts) if (p.boundary_out.forced) warnings.push({ check: "boundary", message: `cut after part ${p.index} is forced: ${p.boundary_out.forced_reason}` });
  for (const p of plan.parts) if (p.boundary_out.uncertain && !p.boundary_out.forced) warnings.push({ check: "boundary", message: `cut after part ${p.index} is uncertain (${p.boundary_out.kind}, cost ${p.boundary_out.cost})` });

  const not_run = [...preNotRun];
  for (const c of review.cuts) {
    if (c.visual === "NOT_RUN") not_run.push({ check: "visual", item: `cut-${c.cut}`, reason: `view ${c.contact_sheet} and record PASS or FAIL in qa/review.json` });
    not_run.push({ check: "listening", item: `cut-${c.cut}`, reason: c.listening_note });
  }
  for (const res of r.results) {
    for (const [name, chk] of Object.entries(res.qc.checks)) if (chk.status === "NOT_RUN") not_run.push({ check: `qc.${name}`, item: res.file, reason: String(chk.detail) });
  }
  if (cov.samples.status === "NOT_RUN") not_run.push({ check: "coverage.samples", item: null, reason: cov.samples.reason });

  const errors = [];
  if (sha256_after !== plan.source.sha256) errors.push({ code: "HARD", check: "source-hash", item: plan.source.path, message: "the source file changed during the run" });
  if (changed.length) errors.push({ code: "HARD", check: "imagine-records", item: projectRoot, message: `Imagine project records changed: ${changed.map((c) => c.file).join(", ")}` });
  if (cov.status === "FAIL") errors.push({ code: "HARD", check: "coverage", item: null, message: "the parts do not cover the source exactly once within tolerance", cause: cov });

  const qcReport = { schema: "sequential-shorts/qc@1", status: errors.length ? "FAIL" : "PASS", parts: r.results.map((x) => x.qc), coverage: cov,
    source: { sha256_before: plan.source.sha256, sha256_after, unchanged: sha256_after === plan.source.sha256 }, imagine_records: records };
  writeQcReport(planDir, qcReport);
  const manifest = buildManifest({ plan, status: errors.length ? "failed" : "complete", sha256_after, records, tools: toolVersions, caps, transcript,
    render: { layout: r.layout, marker: r.marker, preset, commands: r.commands }, results: r.results, coverage: cov, review, warnings, not_run, superseded: r.superseded, now: ctx.now });
  writeManifest(planDir, manifest, plan);

  const data = { output: planDir, plan: v.planPath, qc: qcReport.status, manifest: join(planDir, "manifest.json"), review: join(planDir, "qa", "review.json"),
    superseded: r.superseded, vo: plan.vo, parts: r.results.map(({ index, file, duration_s, status, sha256 }) => ({ index, file, duration_s, status, sha256 })) };
  return errors.length ? { code: "HARD", data, errors, warnings, not_run } : { data, warnings, not_run };
}
