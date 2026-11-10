import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { ShortsError } from "../errors.mjs";
import { readJsonIfExists, writeJsonAtomic } from "../run/fsx.mjs";
import { ensureTool, runTool, tail } from "../run/tools.mjs";

export const EVIDENCE = { sheet_fps: 4, tile_w: 270, tile_h: 480, padding: 8, sheet_side_s: 1, clip_side_s: 1.5, excerpt_side_s: 6 };
const pad = (n, w) => String(n).padStart(w, "0");

export function excerpt(words, t, side = EVIDENCE.excerpt_side_s) {
  const near = words.filter((w) => w.end > t - side && w.start < t + side);
  const before = near.filter((w) => (w.start + w.end) / 2 < t).map((w) => w.word).join(" ");
  const after = near.filter((w) => (w.start + w.end) / 2 >= t).map((w) => w.word).join(" ");
  return `${before} | ${after}`.trim();
}

async function ff(ctx, args, item) {
  const r = ensureTool(await runTool(ctx, "ffmpeg", ["-v", "error", "-nostdin", "-y", ...args], { timeoutMs: 600000 }), "ffmpeg", "evidence");
  if (r.status !== 0) throw new ShortsError("HARD", `boundary evidence failed for ${item}`, { check: "evidence", item, detail: tail(r.stderr) });
}

// Evidence is taken from the rendered parts, not the source, so it shows what viewers will see at each cut.
export async function boundaryEvidence(ctx, { plan, planDir, results, transcript }) {
  const E = EVIDENCE;
  mkdirSync(join(planDir, "qa"), { recursive: true });
  const prev = readJsonIfExists(join(planDir, "qa", "review.json"));
  const w = Math.max(2, String(plan.parts.length).length);
  const words = transcript?.status === "ok" ? transcript.words : [];
  const tiles = 2 * E.sheet_fps * E.sheet_side_s;
  const cuts = [];
  for (let i = 0; i < results.length - 1; i++) {
    const p = plan.parts[i];
    const id = `${pad(i + 1, w)}-${pad(i + 2, w)}`;
    const A = join(planDir, results[i].file);
    const B = join(planDir, results[i + 1].file);
    const sheet = `qa/cut-${id}.png`;
    const vg = `[0:v]fps=${E.sheet_fps},scale=${E.tile_w}:${E.tile_h}[a];[1:v]trim=end=${E.sheet_side_s},setpts=PTS-STARTPTS,fps=${E.sheet_fps},scale=${E.tile_w}:${E.tile_h}[b];`
      + `[a][b]concat=n=2:v=1:a=0,tile=${tiles}x1:padding=${E.padding}:color=white`;
    await ff(ctx, ["-sseof", `-${E.sheet_side_s}`, "-i", A, "-i", B, "-filter_complex", vg, "-frames:v", "1", "-update", "1", join(planDir, sheet)], sheet);
    let clip = null;
    if (plan.source.has_audio) {
      clip = `qa/cut-${id}.wav`;
      const ag = `[0:a]asetpts=PTS-STARTPTS[a0];[1:a]atrim=end=${E.clip_side_s},asetpts=PTS-STARTPTS[a1];[a0][a1]concat=n=2:v=0:a=1[a]`;
      await ff(ctx, ["-sseof", `-${E.clip_side_s}`, "-i", A, "-i", B, "-filter_complex", ag, "-map", "[a]", "-c:a", "pcm_s16le", join(planDir, clip)], clip);
    }
    const old = prev?.cuts?.find((c) => c.cut === id && c.frame === p.end_frame);
    cuts.push({ cut: id, after_part: p.index, t_s: p.end_s, frame: p.end_frame, boundary: p.boundary_out.kind, contact_sheet: sheet, audio_clip: clip,
      excerpt: excerpt(words, p.end_s), visual: old?.visual ?? "NOT_RUN", visual_note: old?.visual_note ?? "",
      listening: "NOT_RUN", listening_note: clip ? "the agent cannot listen; the user checks audio_clip" : "source has no audio" });
  }
  const review = { schema: "sequential-shorts/review@1",
    instructions: "View each contact_sheet (left half: last second of the earlier part; right half: first second of the next) and set visual to PASS or FAIL with a visual_note. listening stays NOT_RUN unless the user listened to audio_clip.",
    cuts };
  writeJsonAtomic(join(planDir, "qa", "review.json"), review);
  return review;
}
