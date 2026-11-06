import { existsSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { basename, extname, join } from "node:path";
import { err } from "../envelope.mjs";
import { KitError, UsageError } from "../errors.mjs";
import { deriveAll } from "../derive.mjs";
import { currentAsset } from "../docs.mjs";
import { withLock, readYaml, writeYamlAtomic, writeAtomic } from "../fsx.mjs";
import { sha256File } from "../hash.mjs";
import { wavInfo } from "../media.mjs";
import { resolveProject } from "../project.mjs";
import { createContext } from "../sources.mjs";
import { commitAsset, safePath } from "../img/commit.mjs";
import { applyLexicon, resolveVoice, voiceConfig } from "../tts/voices.mjs";
import { runTts } from "../tts/worker.mjs";
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

function checkSeed(voice, seed, item) {
  if (voice.engine === "elevenlabs") {
    if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295) {
      throw new KitError("HARD", `ElevenLabs seed ${seed} must be between 0 and 4294967295`, { rule: "HARD-HAS-VOICE-CLONING", item });
    }
  }
}

function buildJob(voice, { id, text, seed, out }) {
  if (voice.engine === "elevenlabs") {
    return {
      engine: "elevenlabs",
      id,
      voice_id: voice.voice_id,
      model_id: voice.model,
      ...(voice.language_code ? { language_code: voice.language_code } : {}),
      ...(voice.voice_settings ? { voice_settings: voice.voice_settings } : {}),
      text,
      seed,
      out,
    };
  }
  return {
    engine: "pocket-tts",
    id,
    model: voice.model,
    config: voice.config,
    temperature: voice.temperature,
    eos_threshold: voice.eos_threshold,
    voice: voice.voice,
    voice_is_file: voice.voice_is_file,
    text,
    seed,
    out,
  };
}

function licenseText(tier) {
  if (tier === "free") {
    return "ElevenLabs free plan: no commercial use; attribution to ElevenLabs is required when shared non-commercially.";
  }
  if (!tier) {
    return "ElevenLabs plan unverified (the subscription could not be read): commercial use requires a paid plan; free-plan audio is non-commercial and needs attribution.";
  }
  return `ElevenLabs paid plan (${tier}): commercial use permitted under the ElevenLabs Terms of Service and Prohibited Use Policy, provided you hold the rights to the text. Content made on a paid plan keeps its commercial rights after a downgrade.`;
}

function elevenLabsSourceText(voice) {
  const namePart = voice.voice_name ? ` (${voice.voice_name})` : "";
  return `ElevenLabs voice ${voice.voice_id}${namePart}, model ${voice.model}`;
}

function elevenLabsCreditText(voice) {
  const name = voice.voice_name || voice.voice_id;
  return `Voice: ${name} (ElevenLabs)`;
}

function updateCredits(currentContent, bullets) {
  let content = currentContent || "# Credits\n";
  if (!content.endsWith("\n")) content += "\n";
  const header = "## Voices (ElevenLabs)";
  const bulletsToAdd = bullets.filter((b) => !content.includes(b));
  if (bulletsToAdd.length === 0) return content;

  if (!content.includes(header)) {
    if (!content.endsWith("\n\n") && content.endsWith("\n")) {
      content += "\n";
    }
    content += `${header}\n`;
    for (const b of bulletsToAdd) {
      content += `${b}\n`;
    }
    return content;
  }

  // Header exists
  const headerIndex = content.indexOf(header);
  const afterHeader = content.slice(headerIndex + header.length);
  const nextSectionMatch = afterHeader.match(/\n## [^\n]+/);
  if (nextSectionMatch) {
    const insertPos = headerIndex + header.length + nextSectionMatch.index;
    const before = content.slice(0, insertPos);
    const after = content.slice(insertPos);
    const bulletText = bulletsToAdd.map((b) => `${b}\n`).join("");
    return before.endsWith("\n") ? `${before}${bulletText}${after}` : `${before}\n${bulletText}${after}`;
  } else {
    let res = content;
    if (!res.endsWith("\n")) res += "\n";
    for (const b of bulletsToAdd) {
      res += `${b}\n`;
    }
    return res;
  }
}

function computeDurationReport({ allUnits, getDuration, g0, advice }) {
  let sum = 0;
  const missing_lines = [];
  for (const id of allUnits) {
    const d = getDuration(id);
    if (typeof d === "number") {
      sum += d;
    } else {
      missing_lines.push(id);
    }
  }
  const total_duration_s = Math.round(sum * 1000) / 1000;
  missing_lines.sort();
  const duration_range = { min: g0.duration_s.min, max: g0.duration_s.max };
  if (total_duration_s > duration_range.max || (missing_lines.length === 0 && total_duration_s < duration_range.min)) {
    advice.push({
      rule: "ADV-VO-DURATION-RANGE",
      item: null,
      source: "project.yaml",
      message: `total VO ${total_duration_s}s is outside the G0 range ${duration_range.min}-${duration_range.max}s`,
    });
  }
  return { total_duration_s, duration_range, missing_lines };
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
        let v;
        let label;
        if (raw.startsWith("elevenlabs:")) {
          const voice_id = raw.slice("elevenlabs:".length);
          const cfg = {
            engine: "elevenlabs",
            voice_id,
            ...(base.engine === "elevenlabs" ? {
              model_id: base.model_id,
              language_code: base.language_code,
              voice_settings: base.voice_settings,
              seed_base: base.seed_base,
            } : {}),
          };
          v = resolveVoice(dir, cfg, { language, item: values.line });
          label = voice_id;
        } else if (/^(builtin|file):/.test(raw)) {
          const cfg = {
            ...(base.engine === "pocket-tts" ? base : DEFAULT_VOICE),
            engine: "pocket-tts",
            source: raw,
          };
          v = resolveVoice(dir, cfg, { language, item: values.line });
          label = basename(raw.replace(/^[a-z]+:/, ""), extname(raw)).replace(/[^A-Za-z0-9_-]/g, "-");
        } else {
          // Bare token
          if (base.engine === "elevenlabs") {
            const voice_id = raw;
            const cfg = {
              engine: "elevenlabs",
              voice_id,
              model_id: base.model_id,
              language_code: base.language_code,
              voice_settings: base.voice_settings,
              seed_base: base.seed_base,
            };
            v = resolveVoice(dir, cfg, { language, item: values.line });
            label = voice_id;
          } else {
            const source = `builtin:${raw}`;
            const cfg = {
              ...(base.engine === "pocket-tts" ? base : DEFAULT_VOICE),
              engine: "pocket-tts",
              source,
            };
            v = resolveVoice(dir, cfg, { language, item: values.line });
            label = basename(source.replace(/^[a-z]+:/, ""), extname(source)).replace(/[^A-Za-z0-9_-]/g, "-");
          }
        }
        const seed = v.seed_base;
        checkSeed(v, seed, values.line);
        const relOut = join("tmp", "audition", `${speakerOf(u)}-${label}.wav`);
        const out = safePath(dir, relOut);
        if (!out) throw new KitError("HARD", `${relOut} is outside the project`, { rule: "HARD-ASSETS-APPROVED", item: values.line });
        jobs.push(buildJob(v, { id: `${values.line}:${label}`, text: lexicon(u), seed, out }));
        meta.push({ v, seed, out, text: lexicon(u) });
      }
      if (jobs.length === 0) throw new UsageError("--voices needs at least one voice");
      const { results: res } = await runTts(ctx, jobs);
      const takes = meta.map((m, i) => {
        const info = checkWav(m.out, jobs[i].id);
        return report(values.line, 0, m.seed, info.duration_s, sha256File(m.out), ttsParamsHash(m.v, m.seed, m.text));
      });
      const characters = jobs.filter((j) => j.engine === "elevenlabs").reduce((sum, j) => sum + j.text.length, 0);
      return {
        project: rel,
        advice: [{
          rule: "PROC-SCRATCH-NOT-ASSET",
          item: values.line,
          source: "tmp/audition",
          message: "audition files are for listening only; cast the chosen voice in bible.yaml"
        }],
        data: {
          takes: res.length ? takes : [],
          characters,
        }
      };
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
        const seed = v.seed_base;
        checkSeed(v, seed, id);
        const relOut = join("tmp", "scratch-vo", `${id}.wav`);
        const out = safePath(dir, relOut);
        if (!out) throw new KitError("HARD", `${relOut} is outside the project`, { rule: "HARD-ASSETS-APPROVED", item: id });
        jobs.push(buildJob(v, { id, text: lexicon(u), seed, out }));
        meta.push({ id, v, seed, out, text: lexicon(u) });
      }
      const { tier } = await runTts(ctx, jobs);
      const takes = meta.map((m) => {
        const info = checkWav(m.out, m.id);
        return report(m.id, 0, m.seed, info.duration_s, sha256File(m.out), ttsParamsHash(m.v, m.seed, m.text));
      });
      let merged = {};
      await withLock(dir, async () => {
        const file = safePath(dir, relDurations);
        if (!file) throw new KitError("HARD", `${relDurations} is outside the project`, { rule: "HARD-ASSETS-APPROVED", item: "durations.yaml" });
        merged = existsSync(file) ? readYaml(file) ?? {} : {};
        for (const t of takes) merged[t.line] = t.duration_s;
        writeYamlAtomic(file, Object.fromEntries(Object.entries(merged).sort(([a], [b]) => a.localeCompare(b))));
      });
      const advice = [
        { rule: "PROC-SCRATCH-NOT-ASSET", item: null, source: "tmp/scratch-vo", message: "scratch durations feed previz timing only; they are not assets and cannot be approved" }
      ];
      const hasEleven = jobs.some((j) => j.engine === "elevenlabs");
      if (hasEleven && (tier === "free" || tier === null)) {
        advice.push({ rule: "PROC-HOSTED-TTS-LICENCE", item: null, source: "assets/CREDITS.md", message: licenseText(tier) });
      }
      const durReport = computeDurationReport({
        allUnits: Object.keys(units).sort(),
        getDuration: (id) => (typeof merged[id] === "number" ? merged[id] : null),
        g0,
        advice,
      });
      const characters = jobs.filter((j) => j.engine === "elevenlabs").reduce((sum, j) => sum + j.text.length, 0);
      return {
        project: rel,
        advice,
        data: {
          takes,
          total_duration_s: durReport.total_duration_s,
          duration_range: durReport.duration_range,
          missing_lines: durReport.missing_lines,
          characters,
        }
      };
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
      checkSeed(voice, seed, id);
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
    const jobs = plan.map((p) => buildJob(p.voice, { id: p.id, text: p.text, seed: p.seed, out: p.out }));
    const { tier } = await runTts(ctx, jobs);
    const validated = [];
    for (const p of plan) {
      const info = checkWav(p.out, p.id);
      validated.push({ p, info });
    }
    const committedElevenTakes = [];
    for (const { p, info } of validated) {
      const isEleven = p.voice.engine === "elevenlabs";
      const entry = {
        id: p.id,
        kind: "vo",
        v: p.v,
        path: `assets/vo/${p.id}.v${p.v}.wav`,
        sha256: "0".repeat(64),
        status: "pending",
        line: p.id,
        text: p.u.text,
        tts_text: p.text,
        voice: p.voice.source,
        seed: p.seed,
        take: p.v,
        params_hash: ttsParamsHash(p.voice, p.seed, p.text),
        duration_s: info.duration_s,
        listen_status: "pending",
        ...(values.redo === p.id ? { note: values.note } : {}),
        ...(isEleven ? {
          engine: "elevenlabs",
          model_id: p.voice.model,
          voice_id: p.voice.voice_id,
          ...(p.voice.language_code ? { language_code: p.voice.language_code } : {}),
          provider_tier: tier ?? "unknown",
          license: licenseText(tier),
          source: elevenLabsSourceText(p.voice),
          credit: elevenLabsCreditText(p.voice),
        } : {}),
      };
      const summaryText = isEleven
        ? `${p.id}.v${p.v} ${info.duration_s}s seed=${p.seed} engine=elevenlabs voice=${p.voice.voice_id} model=${p.voice.model} tier=${tier ?? "unknown"}`
        : `${p.id}.v${p.v} ${info.duration_s}s seed=${p.seed}`;
      const committed = await commitAsset(ctx, dir, { entry, source: p.out, summary: { command: "tts", text: summaryText } });
      const result = committed.entry;
      takes.push(report(p.id, result.v, result.seed, result.duration_s, result.sha256, result.params_hash));
      if (isEleven) {
        committedElevenTakes.push({ p, result });
      }
    }
    takes.sort((a, b) => ids.indexOf(a.line) - ids.indexOf(b.line));

    if (committedElevenTakes.length > 0) {
      const distinctBullets = new Map();
      for (const { p } of committedElevenTakes) {
        const vKey = `${p.voice.voice_id}::${p.voice.model}::${tier ?? "unknown"}`;
        if (!distinctBullets.has(vKey)) {
          const name = p.voice.voice_name || p.voice.voice_id;
          const bullet = `- ${name}: ElevenLabs voice \`${p.voice.voice_id}\`, model \`${p.voice.model}\`, plan \`${tier ?? "unknown"}\`. Licence: ${licenseText(tier)}`;
          distinctBullets.set(vKey, bullet);
        }
      }
      const bullets = [...distinctBullets.values()];
      await withLock(dir, async () => {
        const creditsPath = safePath(dir, "assets/CREDITS.md");
        if (!creditsPath) throw new KitError("HARD", "assets/CREDITS.md is outside the project", { rule: "HARD-ASSETS-APPROVED", item: "assets/CREDITS.md" });
        const content = existsSync(creditsPath) ? readFileSync(creditsPath, "utf8") : "# Credits\n";
        const updated = updateCredits(content, bullets);
        if (updated !== content) {
          writeAtomic(creditsPath, updated);
        }
      });
    }

    const hasEleven = jobs.some((j) => j.engine === "elevenlabs");
    if (hasEleven && (tier === "free" || tier === null)) {
      advice.push({ rule: "PROC-HOSTED-TTS-LICENCE", item: null, source: "assets/CREDITS.md", message: licenseText(tier) });
    }

    const durReport = computeDurationReport({
      allUnits: Object.keys(units).sort(),
      getDuration: (id) => {
        const thisRun = takes.find((t) => t.line === id);
        if (thisRun && typeof thisRun.duration_s === "number") return thisRun.duration_s;
        const cur = currentAsset(sctx.manifest, id);
        if (cur && typeof cur.duration_s === "number") return cur.duration_s;
        return null;
      },
      g0,
      advice,
    });
    const characters = jobs.filter((j) => j.engine === "elevenlabs").reduce((sum, j) => sum + j.text.length, 0);

    return {
      project: rel,
      advice,
      data: {
        takes,
        total_duration_s: durReport.total_duration_s,
        duration_range: durReport.duration_range,
        missing_lines: durReport.missing_lines,
        characters,
      }
    };
  },
};
