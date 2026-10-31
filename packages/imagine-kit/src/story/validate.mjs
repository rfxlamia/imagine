import { err } from "../envelope.mjs";
import { bibleLookup } from "../docs.mjs";
import { FX_TOOLS, WEBGL_TOOLS, parseValue } from "./keys.mjs";

const EPS = 1e-6;
const PLACEHOLDER = /\b(TODO|TBD|lorem)\b|\{\{/i;
const CSS_FILTER = /\bfilter\s*:|\bcss-filter\b/i;
const BUILTIN_TRANSITIONS = new Set(["cut", "crossfade"]);
const NAME_LISTS = { shader: "shaders", registry: "registry", "vfx-chain": "vfx_chains", "media-treatment": "media_treatment" };
const ADVISORY_NOT_RUN = ["ADV-HERO-40", "ADV-NEW-EVERY", "ADV-READ-WINDOW", "ADV-EASE-ROLE", "ADV-HERO-MOVE", "ADV-EXIT-ENTRANCE", "ADV-SHOT-LENGTH", "ADV-BANNED"];
const round = (n) => Math.round(n * 1000) / 1000;

export function inputsFrom(sctx, stage, story = sctx.story) {
  return { story, project: sctx.project, units: sctx.units.units, unitDupes: sctx.units.duplicates, bible: sctx.bible,
    manifest: sctx.manifest, names: sctx.names, voDurations: sctx.voDurations, stage };
}

export function validateStory({ story, project, units, unitDupes, bible, manifest, names, voDurations, stage }) {
  const errors = [];
  const advice = [];
  const checked = new Set();
  const add = (rule, code, item, message, cause) => errors.push(err(rule, code, item, message, cause));
  const g0 = project.g0;
  const shots = story.shots;
  const vals = new Map();
  const dur = (s) => vals.get(s.id).duration ?? vals.get(s.id).duration_est;

  // Structure, typed values, placeholders
  checked.add("HARD-STORY-IDS");
  checked.add("HARD-NO-PLACEHOLDER");
  const seen = new Set();
  for (const s of shots) {
    if (seen.has(s.id)) add("HARD-STORY-IDS", "HARD", s.id, `duplicate shot id ${s.id}`);
    seen.add(s.id);
    const parsed = {};
    for (const [key, raw] of Object.entries(s.keys)) {
      const r = parseValue(key, raw);
      if (r.error) add(key === "assets" ? "HARD-STORYBOARD-ASSET-DECL" : key === "fx" ? "HARD-FX-TOOL-ENUM" : "HARD-STORY-IDS", "HARD", s.id, r.error);
      else parsed[key] = r.value;
      if (PLACEHOLDER.test(raw)) add("HARD-NO-PLACEHOLDER", "PLACEHOLDER", s.id, `placeholder text in ${key}`);
    }
    for (const [what, text] of [["title", s.title], ["narrative", s.narrative]]) {
      if (PLACEHOLDER.test(text)) add("HARD-NO-PLACEHOLDER", "PLACEHOLDER", s.id, `placeholder text in ${what}`);
    }
    vals.set(s.id, parsed);
  }

  // Script units placed exactly once
  if (shots.length > 0 || stage) {
    checked.add("HARD-STORY-UNIT-ONCE");
    for (const d of unitDupes) add("HARD-STORY-UNIT-ONCE", "HARD", d, `script unit ${d} is defined more than once`);
    const count = {};
    for (const s of shots) for (const { unit } of vals.get(s.id).voiceover ?? []) count[unit] = (count[unit] ?? 0) + 1;
    for (const u of Object.keys(units)) {
      if ((count[u] ?? 0) === 0) add("HARD-STORY-UNIT-ONCE", "HARD", u, `script unit ${u} is not placed in any shot`);
      else if (count[u] > 1) add("HARD-STORY-UNIT-ONCE", "HARD", u, `script unit ${u} is placed ${count[u]} times`);
    }
    for (const u of Object.keys(count)) if (!units[u]) add("HARD-STORY-UNIT-ONCE", "HARD", u, `a shot references unknown script unit ${u}`);
  }

  // Durations
  if (shots.length > 0) {
    checked.add("HARD-DURATION");
    checked.add("HARD-STORYBOARD-ASSET-DECL");
    let total = 0;
    let missing = false;
    for (const s of shots) {
      const d = dur(s);
      if (d === undefined) { add("HARD-DURATION", "HARD", s.id, "shot has neither duration_est nor duration"); missing = true; } else total += d;
      if (vals.get(s.id).duration_est === undefined) add("HARD-STORYBOARD-ASSET-DECL", "HARD", s.id, "storyboard shots need duration_est");
    }
    const { min, max } = g0.duration_s;
    if (!missing && (total < min - EPS || total > max + EPS)) add("HARD-DURATION", "HARD", null, `total duration ${round(total)}s is outside the G0 range ${min}-${max}s`);
  }

  // Entities
  checked.add("HARD-ENTITIES-EXIST");
  for (const s of shots) {
    const p = vals.get(s.id);
    for (const c of p.characters ?? []) if (bibleLookup(bible, `characters.${c}`) === undefined) add("HARD-ENTITIES-EXIST", "HARD", s.id, `character ${c} is not in bible.yaml`);
    if (p.location !== undefined && bibleLookup(bible, `locations.${p.location}`) === undefined) add("HARD-ENTITIES-EXIST", "HARD", s.id, `location ${p.location} is not in bible.yaml`);
  }

  // Previz
  const previzPresent = shots.length > 0 && shots.every((s) => vals.get(s.id).duration !== undefined);
  const planned = stage === "previz" || stage === "fx" || (stage === undefined && previzPresent);
  for (const s of shots) {
    const p = vals.get(s.id);
    if (p.beats && dur(s) !== undefined) {
      checked.add("HARD-PREVIZ-BEATS-INSIDE");
      for (const b of p.beats) if (b > dur(s) + EPS) add("HARD-PREVIZ-BEATS-INSIDE", "HARD", s.id, `beat at ${b}s is outside the ${dur(s)}s shot`);
    }
  }
  if (g0.audio_mode === "narrated" && planned && shots.length > 0) {
    checked.add("HARD-VO-NO-OVERLAP");
    let start = 0;
    const spans = [];
    const unknown = new Set();
    for (const s of shots) {
      for (const { unit, offset } of vals.get(s.id).voiceover ?? []) {
        const len = voDurations[unit];
        if (len === undefined) unknown.add(unit);
        else spans.push({ unit, from: start + offset, to: start + offset + len });
      }
      start += dur(s) ?? 0;
    }
    if (unknown.size) {
      add("HARD-VO-NO-OVERLAP", "HARD_NOT_RUN", null, "VO durations are unknown, so overlap cannot be checked",
        `no duration for ${[...unknown].join(", ")}; run tts --scratch or add VO assets with duration_s`);
    } else {
      spans.sort((a, b) => a.from - b.from);
      let end = -Infinity;
      let endUnit = null;
      for (const sp of spans) {
        if (sp.from < end - 0.001) add("HARD-VO-NO-OVERLAP", "HARD", sp.unit, `${sp.unit} starts at ${round(sp.from)}s before ${endUnit} ends at ${round(end)}s`);
        if (sp.to > end) { end = sp.to; endUnit = sp.unit; }
      }
      if (end > start + 0.001) add("HARD-VO-NO-OVERLAP", "HARD", null, `VO ends at ${round(end)}s but the film is ${round(start)}s long`);
    }
  }
  if (g0.audio_mode === "music-led" && planned) {
    checked.add("HARD-MUSICLED-ASSET");
    if (!manifest.assets.some((a) => a.kind === "music" && a.status !== "rejected")) add("HARD-MUSICLED-ASSET", "HARD", null, "music-led projects need a licensed music asset in assets/manifest.yaml");
  }

  // FX, transitions and names
  const needNames = [];
  for (const s of shots) {
    const p = vals.get(s.id);
    for (const e of p.fx ?? []) {
      checked.add("HARD-FX-TOOL-ENUM");
      checked.add("HARD-FX-WEBGL-FALLBACK");
      if (!FX_TOOLS.includes(e.tool)) add("HARD-FX-TOOL-ENUM", "HARD", s.id, `fx "${e.id}": tool "${e.tool}" is not one of ${FX_TOOLS.join(", ")}`);
      if ((WEBGL_TOOLS.includes(e.tool) || e.unsupported === "true") && !e.fallback) add("HARD-FX-WEBGL-FALLBACK", "HARD", s.id, `fx "${e.id}" needs a fallback`);
      if (NAME_LISTS[e.tool]) needNames.push({ list: NAME_LISTS[e.tool], name: e.name, shot: s.id, what: `fx "${e.id}" ${e.tool}` });
      checked.add("HARD-NO-CSS-FILTER-RASTER");
      if (CSS_FILTER.test(`${e.tool}:${e.name} ${e.params ?? ""}`)) add("HARD-NO-CSS-FILTER-RASTER", "HARD", s.id, `fx "${e.id}" uses a CSS filter; use media-treatment for rasters`);
    }
    for (const key of ["grade", "overlays", "fx_notes"]) {
      if (s.keys[key] && CSS_FILTER.test(s.keys[key])) { checked.add("HARD-NO-CSS-FILTER-RASTER"); add("HARD-NO-CSS-FILTER-RASTER", "HARD", s.id, `${key} uses a CSS filter; use media-treatment for rasters`); }
    }
    const t = s.keys.transition_in?.split(/\s+/)[0];
    if (t && !BUILTIN_TRANSITIONS.has(t)) needNames.push({ list: "transitions", name: t, shot: s.id, what: "transition_in" });
  }
  if (needNames.length) {
    checked.add("HARD-PREVIZ-NAMES-EXIST");
    if (names === null) {
      add("HARD-PREVIZ-NAMES-EXIST", "HARD_NOT_RUN", null, "names cannot be verified", "stage/names.yaml is missing; the main agent writes it from the HyperFrames listings");
    } else {
      const malformed = new Set();
      for (const n of needNames) {
        const list = names[n.list];
        if (list !== undefined && (!Array.isArray(list) || !list.every((x) => typeof x === "string"))) {
          if (!malformed.has(n.list)) {
            malformed.add(n.list);
            add("HARD-PREVIZ-NAMES-EXIST", "HARD_NOT_RUN", null, "names cannot be verified", `stage/names.yaml ${n.list} must be a list of strings`);
          }
        } else if (!(list ?? []).includes(n.name)) {
          add("HARD-PREVIZ-NAMES-EXIST", "HARD", n.shot, `${n.what}: "${n.name}" is not listed under ${n.list} in stage/names.yaml`);
        }
      }
    }
  }

  // ADVISORY
  const transitions = shots.filter((s) => s.keys.transition_in).map((s) => s.keys.transition_in.split(/\s+/)[0]);
  if (transitions.length >= 3) {
    checked.add("ADV-HARD-CUTS");
    const hard = transitions.filter((t) => t === "cut").length;
    if (hard / transitions.length > 1 / 3) advice.push({ rule: "ADV-HARD-CUTS", item: null, message: `${hard} of ${transitions.length} transitions are hard cuts (advisory limit: one third)`, source: "STORY.md" });
  }
  if (transitions.length >= 4) {
    checked.add("ADV-TRANSITION-KINDS");
    const kinds = new Set(transitions).size;
    if (kinds < 3 || kinds > 5) advice.push({ rule: "ADV-TRANSITION-KINDS", item: null, message: `${kinds} transition kinds (advisory: 3-5)`, source: "STORY.md" });
  }
  if (g0.format === "portrait" && shots.length > 0 && shots.every((s) => dur(s) !== undefined)) {
    checked.add("ADV-VERTICAL");
    const avg = shots.reduce((sum, s) => sum + dur(s), 0) / shots.length;
    if (avg > 2) advice.push({ rule: "ADV-VERTICAL", item: null, message: `average shot length ${round(avg)}s; 9:16 pacing is 1-2 s per shot`, source: "STORY.md" });
  }
  const not_run = ADVISORY_NOT_RUN.map((rule) => ({ rule, item: null, cause: "no deterministic check in imagine-kit; the main agent judges it" }));
  return { errors, advice, not_run, checked: [...checked].sort() };
}
