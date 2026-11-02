import { err } from "../envelope.mjs";
import { ensureTool, runTool, HF_ENV, HYPERFRAMES } from "../tools.mjs";

// Static checks the lint does not make (HARD-SCENE-LINT: fromTo in scenes, timeline registered under the composition id).
export function staticSceneChecks(html, id) {
  const errors = [];
  if (!new RegExp(`data-composition-id\\s*=\\s*["']${id}["']`).test(html)) errors.push(err("HARD-SCENE-LINT", "HARD", id, `compositions/${id}.html must declare data-composition-id="${id}"`));
  const stripped = html.replace(/\bArray\.from\(/g, "");
  if (/\.from\(/.test(stripped)) errors.push(err("HARD-SCENE-LINT", "HARD", id, "scenes must use fromTo(), never from(): from() reads the live state and breaks seeking"));
  if (!new RegExp(`__timelines\\s*\\[\\s*["']${id}["']\\s*\\]\\s*=`).test(html)) errors.push(err("HARD-SCENE-LINT", "HARD", id, `the timeline must be registered as window.__timelines["${id}"]`));
  return errors;
}

const KINDS = {
  appearsBy: (a) => typeof a.selector === "string" && a.selector.trim() !== "" && typeof a.bySec === "number" && a.bySec >= 0,
  before: (a) => [a.a, a.b].every((s) => typeof s === "string" && s.trim() !== ""),
  staysInFrame: (a) => typeof a.selector === "string" && a.selector.trim() !== "",
  keepsMoving: (a) => (a.withinSelector === undefined || (typeof a.withinSelector === "string" && a.withinSelector.trim() !== "" && a.withinSelector !== "*"))
    && (a.maxStaticSec === undefined || (typeof a.maxStaticSec === "number" && a.maxStaticSec > 0)),
};
export function checkAssertions(list, where) {
  if (!Array.isArray(list)) return [err("HARD-ROOT-MOTION", "HARD", where, `${where}: "assertions" must be an array`)];
  return list.flatMap((a, i) => (a && typeof a === "object" && KINDS[a.kind]?.(a) ? [] : [err("HARD-ROOT-MOTION", "HARD", where, `${where}: assertions[${i}] is not a valid ${a?.kind ?? "(no kind)"} assertion`)]));
}

function isNonNegativeInt(n) {
  return typeof n === "number" && Number.isInteger(n) && n >= 0;
}

function isMalformedLintDoc(doc) {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return true;
  if (typeof doc.ok !== "boolean") return true;
  if (!isNonNegativeInt(doc.errorCount) || !isNonNegativeInt(doc.warningCount)) return true;
  if (!Array.isArray(doc.findings)) return true;
  if (doc.findings.some((f) => !f || typeof f !== "object" || Array.isArray(f) || typeof f.severity !== "string")) return true;
  return false;
}

// `hyperframes lint <dir> --json`: ok is false when any finding has severity error.
export async function lintProject(ctx, dir) {
  const configured = Number(ctx.env?.IMAGINE_LINT_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(configured) && configured > 0 ? configured : 300000;
  const r = ensureTool(await runTool(ctx, "npx", ["--yes", HYPERFRAMES, "lint", dir, "--json"], { env: HF_ENV, timeoutMs }), "npx", "HARD-SCENE-LINT");
  if (r.timedOut) {
    return { errors: [err("HARD-SCENE-LINT", "HARD_NOT_RUN", null, "hyperframes lint timed out", (r.stderr || r.stdout).slice(-300))], warnings: [] };
  }
  const text = r.stdout;
  let doc = null;
  try { doc = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)); } catch { /* handled below */ }
  if (!doc) return { errors: [err("HARD-SCENE-LINT", "HARD_NOT_RUN", null, "hyperframes lint produced no JSON", (r.stderr || text).slice(-300))], warnings: [] };
  if (isMalformedLintDoc(doc)) return { errors: [err("HARD-SCENE-LINT", "HARD_NOT_RUN", null, "hyperframes lint produced malformed JSON schema", (r.stderr || text).slice(-300))], warnings: [] };
  const findings = doc.findings;
  const errors = findings.filter((f) => f.severity === "error").map((f) => err("HARD-SCENE-LINT", "HARD", f.file ? String(f.file).split("/").slice(-2).join("/") : null, `${f.code}: ${f.message}`, f.fixHint));
  if (r.status !== 0 && errors.length === 0) errors.push(err("HARD-SCENE-LINT", "HARD", null, `hyperframes lint exited with code ${r.status}`, (r.stderr || text).slice(-300)));
  else if (doc.ok === false && errors.length === 0) errors.push(err("HARD-SCENE-LINT", "HARD", null, "hyperframes lint reported failure"));
  return { errors, warnings: findings.filter((f) => f.severity === "warning").map((f) => f.code) };
}
