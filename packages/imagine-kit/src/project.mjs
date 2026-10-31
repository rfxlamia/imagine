import { existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { KitError, UsageError } from "./errors.mjs";
import { readText, readYaml, writeYamlAtomic } from "./fsx.mjs";
import { loadValidator } from "./schemas.mjs";

export const G0_FIELDS = ["format", "width", "height", "fps", "audio_mode", "language", "duration_s", "platform", "silence"];

export function slugify(title) {
  return title.normalize("NFKD").replace(/[^\x00-\x7F]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function parseDuration(text) {
  const m = String(text ?? "").match(/^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/);
  if (!m || Number(m[1]) <= 0 || Number(m[2]) < Number(m[1])) throw new UsageError('--duration must look like "12-15" (min-max seconds, min > 0, max >= min)');
  return { min: Number(m[1]), max: Number(m[2]) };
}

export function resolveProject(cwd, flag) {
  let dir;
  if (flag) dir = resolve(cwd, flag);
  else {
    const active = join(cwd, ".imagine", "ACTIVE");
    if (!existsSync(active)) throw new UsageError("no active project: run `new` or pass --project <dir>");
    dir = join(cwd, ".imagine", readText(active).trim());
  }
  if (!existsSync(join(dir, "project.yaml"))) throw new UsageError(`not an Imagine project: ${dir}`);
  return { dir, rel: relative(cwd, dir) || "." };
}

export function loadProject(dir) {
  const project = readYaml(join(dir, "project.yaml"));
  const v = loadValidator("project")(project);
  if (!v.valid) throw new KitError("HARD_NOT_RUN", "project.yaml is invalid", { rule: "HARD-STATUS-DERIVED", detail: v.errors.join("; ") });
  return project;
}

export function saveProject(dir, project, hooks) {
  const v = loadValidator("project")(project);
  if (!v.valid) throw new KitError("HARD_NOT_RUN", "refusing to write an invalid project.yaml", { rule: "HARD-STATUS-DERIVED", detail: v.errors.join("; ") });
  writeYamlAtomic(join(dir, "project.yaml"), project, hooks);
}
