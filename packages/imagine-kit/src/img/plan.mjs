import { existsSync } from "node:fs";
import { join } from "node:path";
import { KitError } from "../errors.mjs";
import { readYaml } from "../fsx.mjs";
import { loadValidator } from "../schemas.mjs";
import { SHEET_MAX } from "./sheet.mjs";

// "legacy" keeps today's sheet behavior (opaque prompt, remover on every cell) so an approved plan never changes output on its own.
export function resolveBackground(a) {
  if (a.background !== undefined) return a.background;
  return a.sheet !== undefined ? "legacy" : "opaque";
}

export function imgDir(kind, intent) {
  if (kind === "ref") return "refs";
  if (intent === "transparent" || intent === "legacy") return "img/figure";
  return "img/world";
}

// assets/plan.yaml (source-formats.md section 11): the planned rasters, written during the storyboard stage.
export function loadPlan(dir) {
  const p = join(dir, "assets", "plan.yaml");
  if (!existsSync(p)) throw new KitError("HARD_NOT_RUN", "assets/plan.yaml is missing; img generates only planned assets", { rule: "HARD-ASSETS-APPROVED" });
  let doc;
  try { doc = readYaml(p); } catch (e) {
    throw new KitError("HARD_NOT_RUN", "assets/plan.yaml is not valid YAML", { rule: "HARD-ASSETS-APPROVED", detail: e.message });
  }
  const v = loadValidator("plan")(doc);
  if (!v.valid) throw new KitError("HARD_NOT_RUN", "assets/plan.yaml does not match the plan schema", { rule: "HARD-ASSETS-APPROVED", detail: v.errors.join("; ") });
  const seen = new Set();
  const groups = new Map();
  for (const a of doc.assets) {
    if (seen.has(a.id)) throw new KitError("HARD_NOT_RUN", `assets/plan.yaml lists ${a.id} twice`, { rule: "HARD-ASSETS-APPROVED" });
    seen.add(a.id);
    if (a.kind === "ref" && a.background === "transparent") {
      throw new KitError("HARD_NOT_RUN", `ref "${a.id}" cannot be background: transparent; references are conditioning images`, { rule: "HARD-ASSETS-APPROVED" });
    }
    if (a.sheet !== undefined && a.background === "opaque") {
      throw new KitError("HARD_NOT_RUN", `sheet member "${a.id}" cannot be background: opaque; a sheet exists to make cutouts`, { rule: "PROC-POSE-SHEET" });
    }
    if (a.sheet !== undefined) {
      if (a.kind !== "img") {
        throw new KitError("HARD_NOT_RUN", `sheet member "${a.id}" must have kind "img"`, { rule: "PROC-POSE-SHEET" });
      }
      if (!groups.has(a.sheet)) groups.set(a.sheet, []);
      groups.get(a.sheet).push(a);
    }
  }
  for (const [group, members] of groups) {
    if (members.length < 2 || members.length > SHEET_MAX) {
      throw new KitError("HARD_NOT_RUN", `sheet group "${group}" must have between 2 and ${SHEET_MAX} members, found ${members.length}`, { rule: "PROC-POSE-SHEET" });
    }
    const [first] = members;
    for (const m of members) {
      if (!m.refs || m.refs.length === 0) {
        throw new KitError("HARD_NOT_RUN", `sheet group "${group}" member "${m.id}" has empty refs; all members must have non-empty refs`, { rule: "PROC-POSE-SHEET" });
      }
      if (m.refs.length !== first.refs.length || !m.refs.every((r, i) => r === first.refs[i])) {
        throw new KitError("HARD_NOT_RUN", `sheet group "${group}" members must have identical refs; "${m.id}" differs from "${first.id}"`, { rule: "PROC-POSE-SHEET" });
      }
      if (m.size !== first.size) {
        throw new KitError("HARD_NOT_RUN", `sheet group "${group}" members must have identical size; "${m.id}" has ${m.size} but "${first.id}" has ${first.size}`, { rule: "PROC-POSE-SHEET" });
      }
      if (resolveBackground(m) !== resolveBackground(first)) {
        throw new KitError("HARD_NOT_RUN", `sheet group "${group}" members must share one background intent; "${m.id}" is ${resolveBackground(m)} but "${first.id}" is ${resolveBackground(first)}`, { rule: "PROC-POSE-SHEET" });
      }
    }
  }
  return doc.assets;
}
