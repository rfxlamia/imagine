import { existsSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { basename, extname, join } from "node:path";
import { err } from "../envelope.mjs";
import { KitError, UsageError } from "../errors.mjs";
import { deriveAll } from "../derive.mjs";
import { currentAsset } from "../docs.mjs";
import { withLock, readYaml, writeYamlAtomic } from "../fsx.mjs";
import { sha256File } from "../hash.mjs";
import { wavInfo } from "../media.mjs";
import { resolveProject } from "../project.mjs";
import { createContext } from "../sources.mjs";
import { commitAsset, safePath } from "../img/commit.mjs";
import { applyLexicon, resolveVoice, voiceConfig } from "../tts/voices.mjs";
import { runWorker } from "../tts/worker.mjs";
import { expectedTtsParamsHash, ttsParamsHash } from "../tts/provenance.mjs";

const DEFAULT_VOICE = { engine: "pocket-tts", source: "builtin:eve" };
const USAGE = "usage: tts <line,...|--all> [--scratch] [--redo <line> --note <text>] | tts --audition --voices <a,b,c> --line <L##>";
const report = (line, v, seed, duration_s, sha, params) => ({ line, v, seed, duration_s, sha256: sha, params_hash: params });
function checkWav(path, item) {
  const info = existsSync(path) ? wavInfo(readFileSync(path)) : null;
  if (!info || info.format !== 1 || info.channels !== 1 || info.bits !== 16 || info.sample_rate !== 24000 || !(info.duration_s > 0)) {
    throw new KitError("BLOCKED", `${item}: the worker did not produce a 24 kHz mono 16-bit WAV`, { rule: "PROC-ONE-LINE-PER-WAV", item });
  }
  return info;
}

export default {
  locks: false,   // the project lock is held only around each commit
  options: { all: { type: "boolean" }, audition: { type: "boolean" }, voices: { type: "string" }, line: { type: "string" },
    scratch: { type: "boolean" }, redo: { type: "string" }, note: { type: "string" } },
  async run({ values, positionals }, ctx) {
    const { dir, rel } = resolveProject(ctx.cwd, values.project);
    const sctx = createContext(dir);
    const g0 = sctx.project.g0;
    if (g0.audio_mode !== "narrated") throw new UsageError("tts is for narrated projects (audio_mode narrated)");
    if (values.audition && (values.scratch || values.all || positionals.length || values.redo)) throw new UsageError(USAGE);
    if ((values.redo === undefined) !== (values.note === undefined)) throw new UsageError("--redo and --note go together");
    if (values.redo !== undefined && values.scratch) throw new UsageError("--scratch measurements are overwritten, not versioned; drop --redo");
    const units = sctx.units.units;
    const known = (id) => { if (!Object.hasOwn(units, id)) throw new UsageError(`unknown script line ${id}`); return id; };
    const language = g0.language;
    const lexicon = (u) => applyLexicon(u.text, sctx.bible);
    const speakerOf = (u) => u.speaker ?? "narrator";

    // Audition: the same line with several candidate voices, written to tmp/audition (never an asset).
    if (values.audition) {
      if (!values.voices || !values.line) throw new UsageError(USAGE);
      const u = units[known(values.line)];
      const base = voiceConfig(sctx.bible, u.speaker) ?? DEFAULT_VOICE;
      const jobs = [];
      const meta = [];
      for (const raw of values.voices.split(",").map((s) => s.trim()).filter(Boolean)) {
        const source = /^(builtin|file):/.test(raw) ? raw : `builtin:${raw}`;
        const v = resolveVoice(dir, { ...base, source }, { language, item: values.line });
        const label = basename(source.replace(/^[a-z]+:/, ""), extname(source)).replace(/[^A-Za-z0-9_-]/g, "-");
        const seed = v.seed_base;
        const relOut = join("tmp", "audition", `${speakerOf(u)}-${label}.wav`);
        const out = safePath(dir, relOut);
        if (!out) throw new KitError("HARD", `${relOut} is outside the project`, { rule: "HARD-ASSETS-APPROVED", item: values.line });
        jobs.push({ id: `${values.line}:${label}`, model: v.model, config: v.config, temperature: v.temperature, eos_threshold: v.eos_threshold, voice: v.voice, voice_is_file: v.voice_is_file, text: lexicon(u), seed, out });
        meta.push({ v, seed, out, text: lexicon(u) });
      }
      if (jobs.length === 0) throw new UsageError("--voices needs at least one voice");
      const res = await runWorker(ctx, jobs);
      const takes = meta.map((m, i) => {
        const info = checkWav(m.out, jobs[i].id);
        return report(values.line, 0, m.seed, info.duration_s, sha256File(m.out), ttsParamsHash(m.v, m.seed, m.text));
      });
      return { project: rel, advice: [{ rule: "PROC-SCRATCH-NOT-ASSET", item: values.line, source: "tmp/audition", message: "audition files are for listening only; cast the chosen voice in bible.yaml" }], data: { takes: res.length ? takes : [] } };
    }

    const ids = values.all ? Object.keys(units).sort() : [...new Set(positionals.flatMap((p) => p.split(",")).map((s) => s.trim()).filter(Boolean).map(known))];
    if (ids.length === 0) throw new UsageError(USAGE);
    if (values.redo !== undefined && !ids.includes(known(values.redo))) throw new UsageError("--redo must name one of the requested lines");

    if (values.scratch) {
      const relDurations = join("tmp", "scratch-vo", "durations.yaml");
      const safeDurations = safePath(dir, relDurations);
      if (!safeDurations) throw new KitError("HARD", `${relDurations} is outside the project`, { rule: "HARD-ASSETS-APPROVED", item: "durations.yaml" });
      const jobs = [];
      const meta = [];
      for (const id of ids) {
        const u = units[id];
        const v = resolveVoice(dir, voiceConfig(sctx.bible, u.speaker) ?? DEFAULT_VOICE, { language, item: id });
        const relOut = join("tmp", "scratch-vo", `${id}.wav`);
        const out = safePath(dir, relOut);
        if (!out) throw new KitError("HARD", `${relOut} is outside the project`, { rule: "HARD-ASSETS-APPROVED", item: id });
        jobs.push({ id, model: v.model, config: v.config, temperature: v.temperature, eos_threshold: v.eos_threshold, voice: v.voice, voice_is_file: v.voice_is_file, text: lexicon(u), seed: v.seed_base, out });
        meta.push({ id, v, seed: v.seed_base, out, text: lexicon(u) });
      }
      await runWorker(ctx, jobs);
      const takes = meta.map((m) => {
        const info = checkWav(m.out, m.id);
        return report(m.id, 0, m.seed, info.duration_s, sha256File(m.out), ttsParamsHash(m.v, m.seed, m.text));
      });
      await withLock(dir, async () => {
        const file = safePath(dir, relDurations);
        if (!file) throw new KitError("HARD", `${relDurations} is outside the project`, { rule: "HARD-ASSETS-APPROVED", item: "durations.yaml" });
        const merged = existsSync(file) ? readYaml(file) ?? {} : {};
        for (const t of takes) merged[t.line] = t.duration_s;
        writeYamlAtomic(file, Object.fromEntries(Object.entries(merged).sort(([a], [b]) => a.localeCompare(b))));
      });
      return { project: rel, advice: [{ rule: "PROC-SCRATCH-NOT-ASSET", item: null, source: "tmp/scratch-vo", message: "scratch durations feed previz timing only; they are not assets and cannot be approved" }], data: { takes } };
    }

    // Production takes: voice cast required, G2 approved, versions immutable, resume skips what exists.
    const derived = deriveAll(sctx);
    if (derived.gates.G2.state !== "approved") {
      return { project: rel, data: { takes: [] }, errors: [err("HARD-GATES-RECORDED", "HARD", "G2", `gate G2 (the voice cast) must be approved before production takes (state: ${derived.gates.G2.state})`)] };
    }
    const plan = [];
    const advice = [];
    const takes = [];
    for (const id of ids) {
      const u = units[id];
      const cfg = voiceConfig(sctx.bible, u.speaker);
      if (!cfg) throw new KitError("HARD", `no voice is cast for ${speakerOf(u)} in bible.yaml (line ${id})`, { rule: "HARD-ENTITIES-EXIST", item: id });
      const voice = resolveVoice(dir, cfg, { language, item: id });
      const all = sctx.manifest.assets.filter((a) => a.kind === "vo" && a.id === id);
      const latest = all.reduce((b, a) => (!b || a.v > b.v ? a : b), null);
      const cur = currentAsset(sctx.manifest, id);
      const desiredParams = cur ? expectedTtsParamsHash(sctx, cur) : null;
      if (cur && values.redo !== id && cur.params_hash === desiredParams) {
        advice.push({ rule: "PROC-RESUME-IDEMPOTENT", item: `${id}.v${cur.v}`, source: "assets/manifest.yaml", message: `${id} v${cur.v} already exists with current script and voice inputs; nothing was regenerated (use --redo ${id} --note <why> for a new take)` });
        takes.push(report(id, cur.v, cur.seed, cur.duration_s, cur.sha256, cur.params_hash));
        continue;
      }
      const v = (latest?.v ?? 0) + 1;
      const seed = voice.seed_base + v;
      const canonicalOut = join("tmp", "tts", `${id}.v${v}.wav`);
      if (!safePath(dir, canonicalOut)) throw new KitError("HARD", `${canonicalOut} is outside the project`, { rule: "HARD-ASSETS-APPROVED", item: `${id}.v${v}` });
      const relOut = join("tmp", "tts", `${id}.v${v}.${randomBytes(6).toString("hex")}.wav`);
      const out = safePath(dir, relOut);
      if (!out) throw new KitError("HARD", `${relOut} is outside the project`, { rule: "HARD-ASSETS-APPROVED", item: `${id}.v${v}` });
      const finalRel = `assets/vo/${id}.v${v}.wav`;
      const finalPath = safePath(dir, finalRel);
      if (!finalPath) throw new KitError("HARD", `${finalRel} is outside the project`, { rule: "HARD-ASSETS-APPROVED", item: `${id}.v${v}` });
      plan.push({ id, u, voice, v, seed, text: lexicon(u), out });
    }
    await runWorker(ctx, plan.map((p) => ({ id: p.id, model: p.voice.model, config: p.voice.config, temperature: p.voice.temperature, eos_threshold: p.voice.eos_threshold,
      voice: p.voice.voice, voice_is_file: p.voice.voice_is_file, text: p.text, seed: p.seed, out: p.out })));
    const validated = [];
    for (const p of plan) {
      const info = checkWav(p.out, p.id);
      validated.push({ p, info });
    }
    for (const { p, info } of validated) {
      const entry = { id: p.id, kind: "vo", v: p.v, path: `assets/vo/${p.id}.v${p.v}.wav`, sha256: "0".repeat(64), status: "pending", line: p.id,
        text: p.u.text, tts_text: p.text, voice: p.voice.source, seed: p.seed, take: p.v, params_hash: ttsParamsHash(p.voice, p.seed, p.text),
        duration_s: info.duration_s, listen_status: "pending", ...(values.redo === p.id ? { note: values.note } : {}) };
      const committed = await commitAsset(ctx, dir, { entry, source: p.out, summary: { command: "tts", text: `${p.id}.v${p.v} ${info.duration_s}s seed=${p.seed}` } });
      const result = committed.entry;
      takes.push(report(p.id, result.v, result.seed, result.duration_s, result.sha256, result.params_hash));
    }
    takes.sort((a, b) => ids.indexOf(a.line) - ids.indexOf(b.line));
    return { project: rel, advice, data: { takes } };
  },
};
