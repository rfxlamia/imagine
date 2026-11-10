import { existsSync, mkdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { analyzeSignals } from "../analyze/signals.mjs";
import { transcribeSource } from "../analyze/asr.mjs";
import { ShortsError, UsageError } from "../errors.mjs";
import { checkOutputDir, findImagineProject, hashImagineRecords } from "../guard.mjs";
import { buildPlan } from "../plan/build.mjs";
import { buildCandidates } from "../plan/candidates.mjs";
import { partition } from "../plan/partition.mjs";
import { checkPlan } from "../plan/validate.mjs";
import { requireTools } from "../preflight.mjs";
import { probe, timelineFromProbe } from "../probe.mjs";
import { moveAside } from "../render/render.mjs";
import { readJsonIfExists, writeJsonAtomic } from "../run/fsx.mjs";
import { hashValue } from "../run/hash.mjs";
import { renderFromPlan } from "./render-core.mjs";

const num = (name, raw, def) => {
  if (raw === undefined) return def;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new UsageError(`--${name} must be a number`);
  return n;
};

export function parseSettings(v) {
  if (!v.input) throw new UsageError("--input is required");
  if (!v.output) throw new UsageError("--output is required");
  const target_s = num("target-seconds", v["target-seconds"], 60);
  const max_s = num("max-seconds", v["max-seconds"], 90);
  if (target_s < 5) throw new UsageError("--target-seconds must be at least 5");
  if (max_s > 180) throw new UsageError("--max-seconds must be at most 180");
  if (max_s < target_s) throw new UsageError("--max-seconds must be at least --target-seconds");
  const language = v.language ?? "auto";
  if (!/^(auto|[a-z]{2,3})$/.test(language)) throw new UsageError("--language must be auto or an ISO 639 code such as id or en");
  const marker = v.marker ?? "auto";
  if (!["auto", "on", "off"].includes(marker)) throw new UsageError("--marker must be auto, on or off");
  const background = v.background ?? "blur";
  if (!/^(blur|color:#[0-9a-fA-F]{6})$/.test(background)) throw new UsageError("--background must be blur or color:#RRGGBB");
  const asr_revision = v["asr-revision"] ?? null;
  if (asr_revision !== null && !/^[A-Za-z0-9._/-]{1,100}$/.test(asr_revision)) throw new UsageError("--asr-revision must be a Hugging Face commit, branch or tag");
  return { target_s, max_s, language, asr_model: v["asr-model"] ?? "large-v3-turbo", asr_revision, marker, background };
}

export const runCommand = {
  usage: "run --input <mp4> --output <dir> [--target-seconds 60] [--max-seconds 90] [--language auto|<code>] [--asr-model large-v3-turbo] [--asr-revision <hf-commit>] [--marker auto|on|off] [--background blur|color:#RRGGBB] [--plan-only] [--replace]",
  options: { input: { type: "string" }, output: { type: "string" }, "target-seconds": { type: "string" }, "max-seconds": { type: "string" }, language: { type: "string" },
    "asr-model": { type: "string" }, "asr-revision": { type: "string" }, marker: { type: "string" }, background: { type: "string" }, "plan-only": { type: "boolean" }, replace: { type: "boolean" } },
  async run(values, ctx) {
    const settings = parseSettings(values);
    const cwd = ctx.cwd ?? process.cwd();
    const input = resolve(cwd, values.input);
    if (!existsSync(input) || !statSync(input).isFile()) throw new ShortsError("HARD", `input not found: ${values.input}`, { check: "input", item: input });
    const { output } = checkOutputDir(input, resolve(cwd, values.output));
    const tools = await requireTools(ctx, ["ffmpeg", "ffprobe", "uv"]);
    const projectRoot = findImagineProject(input);
    const recordsBefore = projectRoot ? await hashImagineRecords(projectRoot) : null;
    const work = join(output, "work");
    mkdirSync(work, { recursive: true });

    const p = await probe(ctx, input);
    const { frame_times, ...probeRecord } = p;
    writeJsonAtomic(join(work, "probe.json"), probeRecord);
    writeJsonAtomic(join(work, "frames.json"), { frame_times });
    const signals = await analyzeSignals(ctx, p);
    writeJsonAtomic(join(work, "signals.json"), signals);

    const transcriptPath = join(output, "transcript.json");
    const cached = readJsonIfExists(transcriptPath);
    const reusable = cached && cached.status !== "failed" && cached.source_sha256 === p.sha256 && cached.request?.model === settings.asr_model && cached.request?.language === settings.language && (cached.request?.revision ?? null) === settings.asr_revision;
    const transcript = reusable ? cached : await transcribeSource(ctx, p, { workDir: work, model: settings.asr_model, language: settings.language, revision: settings.asr_revision });
    if (!reusable) writeJsonAtomic(transcriptPath, transcript);

    const timeline = timelineFromProbe(p);
    const candidates = buildCandidates({ timeline, transcript, signals });
    writeJsonAtomic(join(output, "candidates.json"), { schema: "sequential-shorts/candidates@1", source_sha256: p.sha256, vo_status: transcript.status, candidates });
    const plan = buildPlan({ probe: p, transcript, settings, partitionResult: partition(candidates, { timeline, target_s: settings.target_s, max_s: settings.max_s }) });
    const planErrors = checkPlan(plan, { timeline });
    if (planErrors.length) throw new ShortsError("HARD_NOT_RUN", "the generated plan failed validation (internal error)", { check: "plan", detail: planErrors });

    const planPath = join(output, "plan.json");
    const existing = readJsonIfExists(planPath);
    // Titles and descriptions are the agent's semantic pass; they never block a rerun with the same boundaries.
    const structural = (pl) => (Array.isArray(pl?.parts) ? { ...pl, parts: pl.parts.map(({ title, description, ...rest }) => rest) } : pl);
    const same = existing !== null && hashValue(structural(existing)) === hashValue(structural(plan));
    if (existing !== null && !same) {
      if (!values.replace) {
        throw new ShortsError("CONFLICT", "plan.json exists with different boundaries or settings (it may hold edits); render it with `render --plan`, or rerun with --replace to move it to superseded/", { check: "plan", item: "plan.json" });
      }
      moveAside(output, ["plan.json"], ctx.now ?? (() => new Date()));
    }
    if (!same) writeJsonAtomic(planPath, plan);

    const warnings = [];
    if (transcript.status !== "ok") warnings.push({ check: "vo", message: `no reliable speech (${transcript.status}: ${transcript.reasons.join("; ")}); cuts use silence, scene cuts and a frame grid` });
    if (settings.max_s > 90) warnings.push({ check: "settings", message: `max ${settings.max_s} s is above 90 s; platform limits for Shorts differ` });
    if (values["plan-only"]) {
      return { data: { output, plan: planPath, candidates: join(output, "candidates.json"), transcript: transcriptPath, vo: plan.vo,
        parts: plan.parts.map(({ index, start_s, end_s, duration_s, boundary_out }) => ({ index, start_s, end_s, duration_s, boundary: boundary_out.kind, forced: boundary_out.forced })) },
        warnings, not_run: [{ check: "render", item: null, reason: "--plan-only: review plan.json, then run render --plan" }] };
    }
    // validatePlanFile adds the max-above-90 warning itself; pass only the VO warning on.
    return renderFromPlan(ctx, { planPath, replace: Boolean(values.replace), warnings: warnings.filter((w) => w.check !== "settings" && w.check !== "vo"), recordsBefore, tools });
  },
};
