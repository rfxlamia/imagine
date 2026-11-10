import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { VERSION } from "../envelope.mjs";
import { ShortsError } from "../errors.mjs";
import { MANIFEST_SCHEMA, readManifest, writeManifest } from "../manifest.mjs";
import { checkPart } from "../qa/qc.mjs";
import { hashValue, sha256File } from "../run/hash.mjs";
import { ensureTool, runTool, tail, toolArgv } from "../run/tools.mjs";
import { OUT, composeArgs, layoutFor, resolveMarker } from "./compose.mjs";

const PART_RE = /^part-(\d+)-of-(\d+)\.mp4$/;
const TMP_RE = /^\.part-.*\.tmp\.mp4$/;

export function partName(i, n) {
  const w = Math.max(2, String(n).length);
  return `part-${String(i).padStart(w, "0")}-of-${String(n).padStart(w, "0")}.mp4`;
}

export const rangeHash = ({ plan, part, layout, marker, preset }) => hashValue({ v: VERSION, source: plan.source.sha256,
  start_frame: part.start_frame, end_frame: part.end_frame, start_sample: part.start_sample, end_sample: part.end_sample, of: part.of,
  layout, background: plan.settings.background, marker: { draw: marker.draw, style: marker.style }, preset });

// Never deletes: prior outputs move to superseded/<timestamp>/ keeping their relative paths.
export function moveAside(dir, rels, now) {
  const present = rels.filter((rel) => existsSync(join(dir, rel)));
  if (!present.length) return null;
  const rel = join("superseded", now().toISOString().replace(/[:.]/g, "-"));
  for (const r of present) {
    const to = join(dir, rel, r);
    mkdirSync(dirname(to), { recursive: true });
    renameSync(join(dir, r), to);
  }
  return rel;
}

const progress = (plan, results, commands) => ({ schema: MANIFEST_SCHEMA, version: VERSION, status: "partial",
  source: { path: plan.source.path, sha256_before: plan.source.sha256 }, settings: plan.settings, render: { commands },
  parts: results.map(({ index, file, sha256, range_hash, start_s, end_s, duration_s, qc }) => ({ index, file, sha256, range_hash, start_s, end_s, duration_s, qc })) });

export async function renderParts(ctx, { plan, planDir, timeline, caps, signals, replace = false, preset = OUT.preset }) {
  const partsDir = join(planDir, "parts");
  mkdirSync(partsDir, { recursive: true });
  for (const n of readdirSync(partsDir)) if (TMP_RE.test(n)) rmSync(join(partsDir, n), { force: true });
  const layout = layoutFor(plan.source);
  const marker = resolveMarker(plan.settings.marker, layout, caps, plan.source);
  const N = plan.parts.length;
  const expected = plan.parts.map((part) => ({ part, file: `parts/${partName(part.index, N)}`, range_hash: rangeHash({ plan, part, layout, marker, preset }) }));
  const prevParts = new Map((readManifest(planDir)?.parts ?? []).map((p) => [p.file, p]));

  const keep = new Map();
  const conflicts = [];
  for (const name of readdirSync(partsDir).filter((n) => PART_RE.test(n)).sort()) {
    const file = `parts/${name}`;
    const exp = expected.find((x) => x.file === file);
    const pm = prevParts.get(file);
    if (exp && pm && pm.range_hash === exp.range_hash && pm.sha256 === (await sha256File(join(planDir, file)))) keep.set(file, pm);
    else conflicts.push(file);
  }
  let superseded = null;
  if (conflicts.length) {
    if (!replace) {
      throw new ShortsError("CONFLICT", `existing outputs do not match this plan: ${conflicts.join(", ")}; rerun with --replace to move them to superseded/`, { check: "resume", item: conflicts.join(","), detail: { files: conflicts } });
    }
    superseded = moveAside(planDir, [...conflicts, "qa", "manifest.json", "manifest.md"], ctx.now ?? (() => new Date()));
  }

  const results = [];
  const commands = [];
  // The progress manifest always lists kept parts too, so a crash after --replace cannot orphan good parts.
  const save = () => {
    const pending = [...keep.values()].filter((pm) => !results.some((r) => r.file === pm.file));
    writeManifest(planDir, progress(plan, [...results, ...pending].sort((a, b) => a.index - b.index), commands));
  };
  if (superseded) save();
  for (const { part, file, range_hash } of expected) {
    const final = join(planDir, file);
    const kept = keep.get(file);
    if (kept) {
      const qc = kept.qc ?? (await checkPart(ctx, { file: final, part, plan, signals }));
      results.push({ index: part.index, file, sha256: kept.sha256, range_hash, status: "skipped", start_s: part.start_s, end_s: part.end_s, duration_s: part.duration_s, qc });
      continue;
    }
    const tmp = join(partsDir, `.${basename(file, ".mp4")}.tmp.mp4`);
    let partForCompose = part;
    if (part.index === part.of && plan.source.audio_offset_s > 0 && plan.source.has_audio) {
      const vdur_s = timeline.frameTime(part.end_frame) - timeline.frameTime(part.start_frame);
      const max_samples = part.start_sample + Math.round(vdur_s * plan.source.sample_rate);
      if (part.end_sample > max_samples) partForCompose = { ...part, end_sample: max_samples };
    }
    const { args } = composeArgs({ plan, part: partForCompose, timeline, marker, out: tmp, preset });
    commands.push({ part: part.index, argv: [...toolArgv(ctx, "ffmpeg"), ...args] });
    const r = ensureTool(await runTool(ctx, "ffmpeg", args, { timeoutMs: 3 * 3600 * 1000 }), "ffmpeg", "render");
    if (r.status !== 0) {
      rmSync(tmp, { force: true });
      throw new ShortsError("HARD", `part ${part.index} failed to render: ${tail(r.stderr, 300)}`, { check: "render", item: file });
    }
    if ((await sha256File(plan.source.path)) !== plan.source.sha256) {
      rmSync(tmp, { force: true });
      throw new ShortsError("HARD", "the source file changed during the render", { check: "source-hash", item: plan.source.path });
    }
    const qc = await checkPart(ctx, { file: tmp, part, plan, signals });
    if (qc.status === "FAIL") {
      rmSync(tmp, { force: true });
      const failed = Object.entries(qc.checks).filter(([, c]) => c.status === "FAIL").map(([k]) => k);
      throw new ShortsError("HARD", `part ${part.index} failed QC: ${failed.join(", ")}`, { check: "qc", item: file, detail: qc });
    }
    renameSync(tmp, final);
    results.push({ index: part.index, file, sha256: await sha256File(final), range_hash, status: "rendered", start_s: part.start_s, end_s: part.end_s, duration_s: part.duration_s, qc: { ...qc, file } });
    save();
  }
  return { results, commands, layout, marker, superseded };
}
