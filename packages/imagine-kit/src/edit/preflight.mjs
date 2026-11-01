import { existsSync, readdirSync, realpathSync, statSync } from "node:fs";
import { join } from "node:path";
import { err } from "../envelope.mjs";
import { readText } from "../fsx.mjs";
import { checkAssertions } from "./composition.mjs";
import { safePath } from "../img/commit.mjs";

const PLACEHOLDER = /\b(TODO|TBD|lorem)\b|\{\{/i;

function scanMotionFiles(dir, rel = "", visited = new Set(), errors = []) {
  const editRel = rel ? join("edit", rel) : "edit";
  const safeCurrent = safePath(dir, editRel);
  if (!safeCurrent) {
    errors.push(err("HARD-ROOT-MOTION", "HARD", editRel, `${editRel} is outside the project or forms a symlink cycle`));
    return { files: [], errors };
  }
  let realDir;
  try {
    realDir = realpathSync(safeCurrent);
  } catch (e) {
    errors.push(err("HARD-ROOT-MOTION", "HARD", editRel, e.message));
    return { files: [], errors };
  }
  if (visited.has(realDir)) {
    errors.push(err("HARD-ROOT-MOTION", "HARD", editRel, `directory symlink cycle under edit/: ${editRel}`));
    return { files: [], errors };
  }
  visited.add(realDir);
  const files = [];
  let entries = [];
  try {
    entries = readdirSync(safeCurrent);
  } catch (e) {
    errors.push(err("HARD-ROOT-MOTION", "HARD", editRel, e.message));
    return { files, errors };
  }
  for (const name of entries) {
    const childRel = rel ? `${rel}/${name}` : name;
    const projectRel = join("edit", childRel);
    const safeChild = safePath(dir, projectRel);
    if (!safeChild) {
      errors.push(err("HARD-ROOT-MOTION", "HARD", projectRel, `${projectRel} is outside the project or forms a symlink cycle`));
      continue;
    }
    let st;
    try {
      st = statSync(safeChild);
    } catch (e) {
      errors.push(err("HARD-ROOT-MOTION", "HARD", projectRel, e.message));
      continue;
    }
    if (st.isDirectory()) {
      let realSub;
      try {
        realSub = realpathSync(safeChild);
      } catch (e) {
        errors.push(err("HARD-ROOT-MOTION", "HARD", projectRel, e.message));
        continue;
      }
      if (visited.has(realSub)) {
        errors.push(err("HARD-ROOT-MOTION", "HARD", projectRel, `directory symlink cycle under edit/: ${projectRel}`));
        continue;
      }
      const sub = scanMotionFiles(dir, childRel, visited, errors);
      files.push(...sub.files);
    } else if (name.endsWith(".motion.json")) {
      files.push(childRel);
    }
  }
  return { files, errors };
}

// What a render needs from edit/: root index.html, scene hosts with class "scene", assertions only in root index.motion.json,
// no placeholder text. (HARD-SCENE-CLASS, HARD-ROOT-MOTION, HARD-NO-PLACEHOLDER)
export function renderPreflight(dir) {
  const errors = [];
  const safeEdit = safePath(dir, "edit");
  if (!safeEdit) return [err("HARD-ROOT-MOTION", "HARD", "edit", "edit/ is outside the project")];

  const safeIndex = safePath(dir, "edit/index.html");
  if (!safeIndex) return [err("HARD-NO-PLACEHOLDER", "HARD", "edit/index.html", "edit/index.html is outside the project")];
  if (!existsSync(safeIndex)) return [err("HARD-NO-PLACEHOLDER", "HARD", "edit/index.html", "edit/index.html does not exist; the main agent writes the root composition")];

  const html = readText(safeIndex);
  if (PLACEHOLDER.test(html)) errors.push(err("HARD-NO-PLACEHOLDER", "HARD", "edit/index.html", "edit/index.html contains placeholder text (TODO, TBD, lorem or {{)"));
  for (const tag of html.match(/<[^>]*data-composition-src\s*=\s*["'][^"']*["'][^>]*>/g) ?? []) {
    const src = tag.match(/data-composition-src\s*=\s*["']([^"']*)["']/)[1];
    const cls = tag.match(/\bclass\s*=\s*["']([^"']*)["']/)?.[1] ?? "";
    if (!cls.split(/\s+/).includes("scene")) errors.push(err("HARD-SCENE-CLASS", "HARD", src, `the scene host for ${src} needs class="scene"`));
    const safeSrc = safePath(dir, join("edit", src));
    if (!safeSrc) errors.push(err("HARD-NO-PLACEHOLDER", "HARD", src, `data-composition-src ${src} resolves outside the project`));
    else if (!existsSync(safeSrc)) errors.push(err("HARD-NO-PLACEHOLDER", "HARD", src, `data-composition-src ${src} points at a file that does not exist`));
  }

  const { files: motion, errors: motionErrors } = scanMotionFiles(dir);
  errors.push(...motionErrors);
  for (const f of motion.filter((f) => !f.startsWith("assets/"))) {
    if (f !== "index.motion.json") errors.push(err("HARD-ROOT-MOTION", "HARD", `edit/${f}`, `assertions live only in edit/index.motion.json (found edit/${f})`));
  }
  if (motion.includes("index.motion.json")) {
    const motionFile = safePath(dir, "edit/index.motion.json");
    if (!motionFile) {
      errors.push(err("HARD-ROOT-MOTION", "HARD", "edit/index.motion.json", "edit/index.motion.json is outside the project"));
    } else {
      try {
        const doc = JSON.parse(readText(motionFile));
        errors.push(...checkAssertions(doc.assertions, "edit/index.motion.json"));
      } catch (e) {
        errors.push(err("HARD-ROOT-MOTION", "HARD", "edit/index.motion.json", "edit/index.motion.json is not valid JSON", e.message));
      }
    }
  }
  return errors;
}
