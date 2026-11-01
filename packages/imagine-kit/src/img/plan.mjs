import { existsSync } from "node:fs";
import { join } from "node:path";
import { KitError } from "../errors.mjs";
import { readYaml } from "../fsx.mjs";
import { loadValidator } from "../schemas.mjs";

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
  for (const a of doc.assets) {
    if (seen.has(a.id)) throw new KitError("HARD_NOT_RUN", `assets/plan.yaml lists ${a.id} twice`, { rule: "HARD-ASSETS-APPROVED" });
    seen.add(a.id);
  }
  return doc.assets;
}
