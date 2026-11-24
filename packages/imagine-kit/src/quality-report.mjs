import { CHECKPOINT_IDS, checkpointEvidence, checkpointView, resolveCheckpoint } from "./checkpoints.mjs";
import { loadProject } from "./project.mjs";

// Quality report (Req 2.6, 5.6, 10.7). Built only from Evidence_Records.
// Records whose evaluator offers `image-inspection` or `audio-analysis` go in the review section; the rest are technical validation.
export const REVIEW_CAPABILITIES = Object.freeze(["image-inspection", "audio-analysis"]);

export const isReviewRecord = (r) => (r?.evaluatorCapabilities ?? []).some((c) => REVIEW_CAPABILITIES.includes(c));

// Stable reference to one Evidence_Record: item, check and timestamp.
export const evidenceRef = (itemId, r) => `${itemId}#${r.checkId}@${r.at}`;

function entryOf(checkpoint, itemId, r) {
  const review = isReviewRecord(r);
  // A `not_run` record in the review section is a subjective Check nobody judged: it is unevaluated, never passed.
  const unevaluated = review && r.result === "not_run";
  return {
    ref: evidenceRef(itemId, r), checkpoint, checkId: r.checkId, result: r.result, unevaluated,
    evaluator: r.evaluator, evaluatorCapabilities: [...(r.evaluatorCapabilities ?? [])], ruleVersion: r.ruleVersion,
    at: r.at, outputRefs: [...(r.outputRefs ?? [])],
  };
}

// Pure builder. `input` is [{ checkpoint, itemId, records }] (one entry per Checkpoint item).
export function buildQualityReport(input) {
  const checkpoints = [];
  const technical = [];
  const review = [];
  for (const { checkpoint, itemId, records } of input) {
    const cp = resolveCheckpoint(checkpoint);
    const id = cp?.id ?? checkpoint;
    const entries = (records ?? []).map((r) => entryOf(id, itemId, r));
    (records ?? []).forEach((r, i) => (isReviewRecord(r) ? review : technical).push(entries[i]));
    const view = cp ? checkpointView(id, records ?? []) : { state: "open", checks: [] };
    checkpoints.push({
      id, state: view.state,
      checks: view.checks.map((c) => {
        const own = entries.filter((e) => e.checkId === c.id);
        const latest = own.filter((e) => e.at === c.at).at(-1) ?? null;
        return { id: c.id, result: c.result, unevaluated: latest?.unevaluated ?? false, evidence: own.map((e) => e.ref), latest: latest?.ref ?? null };
      }),
    });
  }
  const unevaluated = review.filter((e) => e.unevaluated);
  return { checkpoints, technical, review, unevaluated, total: technical.length + review.length };
}

// Reads every Checkpoint item of the project (optionally one scope) and builds the report.
export function generateQualityReport(dir, opts = {}) {
  const project = loadProject(dir);
  const input = CHECKPOINT_IDS.map((id) => {
    const scope = opts.scope;
    const itemId = `checkpoint:${id}${scope?.length ? `[${[...scope].sort().join(",")}]` : ""}`;
    return { checkpoint: id, itemId, records: checkpointEvidence(project, id, scope) };
  });
  return buildQualityReport(input);
}

const line = (e) => `- ${e.ref}: ${e.unevaluated ? "UNEVALUATED (not_run)" : e.result} [${e.evaluator}; ${e.evaluatorCapabilities.join(", ")}; ${e.ruleVersion}]${e.outputRefs.length ? ` outputs: ${e.outputRefs.join(", ")}` : ""}`;

export function renderQualityReport(report) {
  const out = ["# Quality report", "", "## Checkpoint results"];
  for (const cp of report.checkpoints) {
    out.push("", `### ${cp.id}: ${cp.state}`);
    for (const c of cp.checks) {
      const mark = c.unevaluated ? "unevaluated (not_run)" : c.result;
      out.push(`- ${c.id}: ${mark}${c.evidence.length ? ` (evidence: ${c.evidence.join("; ")})` : " (no evidence)"}`);
    }
  }
  out.push("", "## Technical validation", ...(report.technical.length ? report.technical.map(line) : ["- none"]));
  out.push("", "## Visual review and audio mix", ...(report.review.length ? report.review.map(line) : ["- none"]));
  out.push("", "## Unevaluated, needs human review", ...(report.unevaluated.length ? report.unevaluated.map((e) => `- ${e.checkpoint} ${e.checkId} (${e.ref})`) : ["- none"]));
  return `${out.join("\n")}\n`;
}
