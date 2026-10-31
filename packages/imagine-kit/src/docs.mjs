import { existsSync } from "node:fs";
import { join } from "node:path";
import { KitError } from "./errors.mjs";
import { readYaml, writeYamlAtomic } from "./fsx.mjs";
import { loadValidator } from "./schemas.mjs";

export function renderStyleOutput(g0) {
  return [
    `- format: ${g0.format} ${g0.width}x${g0.height} @ ${g0.fps} fps`,
    `- audio_mode: ${g0.audio_mode}`,
    `- language: ${g0.language ?? "n/a"}`,
    `- duration: ${g0.duration_s.min}-${g0.duration_s.max} s`,
    `- platform: ${g0.platform}`,
    `- silence: ${g0.silence ?? "no"}`,
  ].join("\n");
}

export function parseUnits(text, prefix) {
  const units = {};
  const duplicates = [];
  const re = new RegExp(`^(?:[-*]\\s+)?(${prefix}\\d{2})(?:\\s+\\[([a-z0-9-]+)\\])?:\\s+(\\S.*?)\\s*$`);
  for (const line of text.split("\n")) {
    const m = line.match(re);
    if (!m) continue;
    if (units[m[1]]) duplicates.push(m[1]);
    else units[m[1]] = { id: m[1], speaker: m[2] ?? null, text: m[3] };
  }
  return { units, duplicates };
}

export function bibleLookup(bible, path) {
  let cur = bible;
  for (const seg of path.split(".")) {
    if (Array.isArray(cur)) cur = cur.find((e) => e && typeof e === "object" && (e.id === seg || e.term === seg));
    else if (cur && typeof cur === "object" && Object.hasOwn(cur, seg)) cur = cur[seg];
    else return undefined;
    if (cur === undefined) return undefined;
  }
  return cur;
}

export function bibleEntities(bible) {
  const out = [];
  for (const [key, val] of Object.entries(bible ?? {})) {
    if (Array.isArray(val)) {
      if (val.length && val.every((e) => e && typeof e === "object" && typeof e.id === "string")) out.push(...val.map((e) => `${key}.${e.id}`));
      else if (val.length) out.push(key);
    } else if (val && typeof val === "object") {
      if (Object.keys(val).length) out.push(key);
    } else if (val !== null && val !== undefined) out.push(key);
  }
  return out;
}

export function styleSections(text) {
  const lines = text.split("\n");
  const heads = [];
  lines.forEach((l, i) => {
    const m = l.match(/^##\s+#?([a-z][a-z0-9-]*)\s*$/);
    if (m) heads.push({ anchor: m[1], i });
  });
  const out = {};
  for (const h of heads) {
    let end = lines.length;
    for (let j = h.i + 1; j < lines.length; j += 1) {
      if (/^#{1,2}\s/.test(lines[j])) { end = j; break; }
    }
    out[h.anchor] = lines.slice(h.i + 1, end).join("\n").trim();
  }
  return out;
}

export function loadManifest(dir) {
  const p = join(dir, "assets", "manifest.yaml");
  const manifest = existsSync(p) ? readYaml(p) : { assets: [] };
  const v = loadValidator("manifest")(manifest);
  if (!v.valid) throw new KitError("HARD_NOT_RUN", "assets/manifest.yaml is invalid", { rule: "HARD-AUDIO-LICENCE", detail: v.errors.join("; ") });
  return manifest;
}

export function currentAsset(manifest, id) {
  const live = manifest.assets.filter((a) => a.id === id && a.status !== "rejected");
  return live.reduce((best, a) => (!best || a.v > best.v ? a : best), null);
}
export const assetEntry = (manifest, id, v) => manifest.assets.find((a) => a.id === id && a.v === v) ?? null;
const ids = (manifest) => [...new Set(manifest.assets.map((a) => a.id))];
export const currentAssets = (manifest) => ids(manifest).map((id) => currentAsset(manifest, id)).filter(Boolean);
export const latestAssets = (manifest) => ids(manifest).map((id) => manifest.assets.filter((a) => a.id === id).reduce((b, a) => (a.v > b.v ? a : b)));

export function loadNames(dir) {
  const p = join(dir, "stage", "names.yaml");
  if (!existsSync(p)) return null;
  const doc = readYaml(p);
  return doc ?? null;
}

export function loadVoDurations(dir, manifest) {
  const out = {};
  const p = join(dir, "tmp", "scratch-vo", "durations.yaml");
  if (existsSync(p)) {
    for (const [k, v] of Object.entries(readYaml(p) ?? {})) if (typeof v === "number") out[k] = v;
  }
  const vo = manifest.assets.filter((a) => a.kind === "vo" && a.line && a.status !== "rejected" && typeof a.duration_s === "number");
  for (const a of vo.sort((x, y) => x.v - y.v)) out[a.line] = a.duration_s;
  return out;
}

export function saveManifest(dir, manifest) {
  const v = loadValidator("manifest")(manifest);
  if (!v.valid) throw new KitError("HARD_NOT_RUN", "refusing to write an invalid manifest", { rule: "HARD-AUDIO-LICENCE", detail: v.errors.join("; ") });
  writeYamlAtomic(join(dir, "assets", "manifest.yaml"), manifest);
}

