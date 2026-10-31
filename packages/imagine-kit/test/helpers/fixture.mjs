import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import YAML from "yaml";
import { run } from "../../src/cli.mjs";
import { sha256 } from "../../src/hash.mjs";

export const NOW = new Date("2026-11-01T10:00:00Z");
export const cli = (cwd, ...args) => run(args, { cwd, now: () => NOW });

export async function makeProject({ mode = "narrated", format = "portrait", extra = [] } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), "imagine-kit-"));
  const args = ["new", "Keeper", "--format", format, "--audio-mode", mode, "--duration", "12-15",
    ...(mode === "narrated" ? ["--lang", "en"] : []), ...extra];
  const r = await cli(cwd, ...args);
  if (!r.env.ok) throw new Error(JSON.stringify(r.env));
  return { cwd, dir: join(cwd, r.env.project), rel: r.env.project };
}

export function put(dir, rel, text) {
  mkdirSync(dirname(join(dir, rel)), { recursive: true });
  writeFileSync(join(dir, rel), text);
}
export const getProject = (dir) => YAML.parse(readFileSync(join(dir, "project.yaml"), "utf8"));
export function setProject(dir, fn) {
  const p = getProject(dir);
  fn(p);
  writeFileSync(join(dir, "project.yaml"), YAML.stringify(p));
}
export const getManifest = (dir) => YAML.parse(readFileSync(join(dir, "assets", "manifest.yaml"), "utf8"));
export function setManifest(dir, fn) {
  const m = getManifest(dir);
  fn(m);
  writeFileSync(join(dir, "assets", "manifest.yaml"), YAML.stringify(m));
}
export const asset = (id, kind, v, extra = {}) => ({ id, kind, v, path: `assets/${kind}/${id}.v${v}.bin`,
  sha256: sha256(`${id}.v${v}`), status: "pending", ...extra });

export const NARRATION = [
  "L01 [narrator]: Every night for forty years, Mara climbed the stairs and lit the lamp.",
  "L02 [narrator]: Tonight the sea was quiet, and no ship was coming.",
  "L03 [narrator]: She lit it anyway.", ""].join("\n");
export const COPY = "T01: Forty years.\nT02: One lamp.\nT03: She lit it anyway.\n";
export const BIBLE = [
  "characters:", "  - id: mara", "    hair: grey braid", "    voice:", "      engine: pocket-tts", "      source: builtin:eve",
  "locations:", "  - id: lighthouse", "    look: white tower",
  "world:", "  period: 1950s",
  "pronunciation:", "  - term: Skerryvore", "    say: SKERRY-vor", ""].join("\n");
export const STYLE_BODY = "\n## camera\nSlow push-ins only.\n\n## motion\nEase out.\n\n## texture\nGrain three percent.\n";

export function seedCanon(dir, { copy = false } = {}) {
  put(dir, copy ? "script/copy.md" : "script/narration.md", copy ? COPY : NARRATION);
  put(dir, "bible.yaml", BIBLE);
  put(dir, "style.md", readFileSync(join(dir, "style.md"), "utf8") + STYLE_BODY);
}

export async function approveThrough(cwd, last = "G3") {
  for (const g of ["G0", "G1", "G2", "G3", "G4"]) {
    const r = await cli(cwd, "gate", g, "approve", "--quote", `ok ${g}`);
    if (!r.env.ok) throw new Error(`${g}: ${JSON.stringify(r.env)}`);
    if (g === last) return;
  }
}

export const shot = (id, keys = {}, title = `Title ${id}`, narrative = "") => ({ id, title, keys, narrative });
export async function writeStory(dir, rev, shots, front = {}) {
  const { renderStory } = await import("../../src/story/render.mjs");
  const text = renderStory({ front: { imagine_rev: rev, ...front }, shots });
  put(dir, "STORY.md", text);
  put(dir, `.history/STORY.r${rev}.md`, text);
}

// Records an item whose inputs are the current values of `refs` (clock refs are written "clock:L02=vo.v1").
export async function snapshot(dir, id, refs, { status = "approved", watch = [], kind = id.split(":")[0] } = {}) {
  const { createContext, resolveRef } = await import("../../src/sources.mjs");
  const sctx = createContext(dir);
  const record = (list) => Object.fromEntries(list.map((spec) => {
    const [ref, label] = spec.split("=");
    const v = resolveRef(sctx, ref, label ? `${label}:` : undefined);
    if (v === null) throw new Error(`unresolvable ${spec}`);
    return [ref, v === undefined ? "item" : v];
  }));
  setProject(dir, (p) => {
    p.items[id] = { kind, status, ...(status === "approved" ? { gate: "G9", decision: { decision: "approve", quote: "ok", at: NOW.toISOString() } } : {}),
      inputs: record(refs), ...(watch.length ? { watch: record(watch) } : {}) };
  });
}
