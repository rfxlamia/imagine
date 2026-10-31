import { existsSync } from "node:fs";
import { join } from "node:path";
import { hashValue, sha256, sha256File } from "./hash.mjs";
import { readText, readYaml } from "./fsx.mjs";
import { G0_FIELDS, loadProject } from "./project.mjs";
import { assetEntry, bibleEntities, bibleLookup, currentAsset, currentAssets, loadManifest, loadNames, loadVoDurations,
  parseUnits, styleSections } from "./docs.mjs";
import { parseStory } from "./story/parse.mjs";
import { blockHash } from "./story/block.mjs";

export const SUPERSEDED = "superseded";

export function createContext(dir) {
  const cache = new Map();
  const memo = (key, make) => {
    if (!cache.has(key)) cache.set(key, make());
    return cache.get(key);
  };
  const file = (rel) => join(dir, rel);
  return {
    dir,
    get project() { return memo("project", () => loadProject(dir)); },
    get bible() { return memo("bible", () => (existsSync(file("bible.yaml")) ? readYaml(file("bible.yaml")) ?? {} : {})); },
    get style() { return memo("style", () => (existsSync(file("style.md")) ? styleSections(readText(file("style.md"))) : {})); },
    get units() {
      return memo("units", () => {
        const narrated = this.project.g0.audio_mode === "narrated";
        const p = file(narrated ? "script/narration.md" : "script/copy.md");
        return parseUnits(existsSync(p) ? readText(p) : "", narrated ? "L" : "T");
      });
    },
    get storyText() { return memo("storyText", () => readText(file("STORY.md"))); },
    get story() { return memo("story", () => parseStory(this.storyText)); },
    get manifest() { return memo("manifest", () => loadManifest(dir)); },
    get names() { return memo("names", () => loadNames(dir)); },
    get voDurations() { return memo("voDurations", () => loadVoDurations(dir, this.manifest)); },
  };
}

function assetValue(ctx, id, v, kind) {
  const entry = assetEntry(ctx.manifest, id, v);
  if (!entry || (kind && entry.kind !== kind)) return null;
  const cur = currentAsset(ctx.manifest, id);
  return cur && cur.v === v ? entry.sha256 : SUPERSEDED;
}

function clockValue(ctx, key, recorded) {
  const label = typeof recorded === "string" ? recorded.split(":")[0] : "";
  let m;
  let hash = null;
  if ((m = label.match(/^vo\.v(\d+)$/))) {
    const entries = ctx.manifest.assets.filter((a) => a.kind === "vo" && a.line === key);
    const wanted = entries.find((a) => a.v === Number(m[1]));
    const cur = entries.filter((a) => a.status !== "rejected").reduce((b, a) => (!b || a.v > b.v ? a : b), null);
    hash = wanted ? (cur && cur.v === wanted.v ? wanted.sha256 : SUPERSEDED) : null;
  } else if ((m = label.match(/^music\.v(\d+)$/))) {
    hash = assetValue(ctx, key, Number(m[1]), "music");
  } else if (label === "scratch") {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(key)) return null;
    const p = join(ctx.dir, "tmp", "scratch-vo", `${key}.wav`);
    hash = existsSync(p) ? sha256File(p) : null;
  } else if (label === "readtime") {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(key)) return null;
    const p = join(ctx.dir, "script", "readtime.yaml");
    const units = existsSync(p) ? (readYaml(p) ?? {}).units : undefined;
    const entry = units && typeof units === "object" && Object.hasOwn(units, key) ? units[key] : undefined;
    hash = entry === undefined ? null : hashValue(entry);
  }
  return hash === null ? null : `${label}:${hash}`;
}

// string = value; null = unresolvable; undefined = item-only reference (no hash of its own)
export function resolveRef(ctx, ref, recorded) {
  const i = ref.indexOf(":");
  if (i < 0) return undefined;
  const kind = ref.slice(0, i);
  const rest = ref.slice(i + 1);
  switch (kind) {
    case "g0": return Object.hasOwn(ctx.project.g0, rest) ? hashValue(ctx.project.g0[rest]) : null;
    case "unit": {
      const u = Object.hasOwn(ctx.units.units, rest) ? ctx.units.units[rest] : null;
      return u ? sha256(`${u.speaker ?? ""}\n${u.text}`) : null;
    }
    case "bible": {
      const v = bibleLookup(ctx.bible, rest);
      return v === undefined ? null : hashValue(v);
    }
    case "style": return Object.hasOwn(ctx.style, rest) ? sha256(ctx.style[rest]) : null;
    case "story": return rest === "sha" ? sha256(ctx.storyText) : null;
    case "shot": {
      const m = rest.match(/^(s\d{2})\.(storyboard|previz|fx|edit)$/);
      const s = m && ctx.story.shots.find((x) => x.id === m[1]);
      return s ? blockHash(s, m[2]) : null;
    }
    case "asset": {
      const m = rest.match(/^(.+)\.v(\d+)$/);
      return m ? assetValue(ctx, m[1], Number(m[2])) : null;
    }
    case "clock": return clockValue(ctx, rest, recorded);
    default: return undefined;
  }
}

export function enumerateSources(ctx) {
  const out = {};
  const add = (ref, recorded) => {
    const v = resolveRef(ctx, ref, recorded);
    if (v !== null && v !== undefined) out[ref] = v;
  };
  for (const f of G0_FIELDS) add(`g0:${f}`);
  for (const id of Object.keys(ctx.units.units)) add(`unit:${id}`);
  for (const p of bibleEntities(ctx.bible)) add(`bible:${p}`);
  for (const a of Object.keys(ctx.style)) add(`style:${a}`);
  add("story:sha");
  for (const s of ctx.story.shots) for (const st of ["storyboard", "previz", "fx"]) add(`shot:${s.id}.${st}`);
  for (const a of currentAssets(ctx.manifest)) {
    add(`asset:${a.id}.v${a.v}`);
    if (a.kind === "vo" && a.line) add(`clock:${a.line}`, `vo.v${a.v}:`);
  }
  return out;
}
