import { err } from "./envelope.mjs";
import { appendJournal } from "./journal.mjs";
import { loadProject, saveProject } from "./project.mjs";

const RESULTS = ["passed", "failed", "not_run"];
const isFilled = (v) => typeof v === "string" && v.trim() !== "";
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

const FIELD_OK = {
  itemId: isFilled,
  checkId: isFilled,
  evaluator: isFilled,
  evaluatorCapabilities: (v) => Array.isArray(v) && v.length > 0 && v.every(isFilled),
  ruleVersion: isFilled,
  inputHashes: isObject,
  outputRefs: (v) => Array.isArray(v) && v.every((x) => typeof x === "string"),
  result: (v) => RESULTS.includes(v),
  now: (v) => v instanceof Date && !Number.isNaN(v.getTime()),
};

export const REQUIRED_EVIDENCE_FIELDS = Object.keys(FIELD_OK);

// Names of required fields that are absent or invalid.
export function missingEvidenceFields(input) {
  return REQUIRED_EVIDENCE_FIELDS.filter((f) => !FIELD_OK[f](input?.[f]));
}

// Capabilities the Check requires that the evaluator does not offer.
export function missingCapabilities(requires = [], evaluatorCapabilities = []) {
  return requires.filter((c) => !evaluatorCapabilities.includes(c));
}

// Writes one Evidence_Record (Requirements 6.3-6.7, 10.2, 10.3).
// - Any missing/invalid required field: EVIDENCE-INCOMPLETE, nothing written, no journal entry.
// - Evaluator capabilities not covering `requires`: record is still written, with result forced to
//   `not_run`, and an EVALUATOR-CAPABILITY error is returned alongside it.
// Returns { errors, record, journal_id }.
export function writeEvidence(dir, input) {
  const missing = missingEvidenceFields(input);
  if (missing.length) {
    return { errors: [err("EVIDENCE-INCOMPLETE", "HARD", input?.itemId ?? null, `evidence record is missing or has invalid field(s): ${missing.join(", ")}`)], record: null, journal_id: null };
  }
  const { itemId, checkId, evaluator, evaluatorCapabilities, ruleVersion, inputHashes, outputRefs, now } = input;
  const requires = Array.isArray(input.requires) ? input.requires : [];
  const lacking = missingCapabilities(requires, evaluatorCapabilities);
  const errors = [];
  let result = input.result;
  if (lacking.length) {
    result = "not_run";
    errors.push(err("EVALUATOR-CAPABILITY", "HARD", itemId,
      `evaluator ${evaluator} lacks capability ${lacking.join(", ")} required by check ${checkId}`));
  }
  const record = { evaluator, evaluatorCapabilities: [...evaluatorCapabilities], ruleVersion, inputHashes: { ...inputHashes },
    outputRefs: [...outputRefs], at: now.toISOString(), result, checkId };

  const project = loadProject(dir);
  const kind = itemId.includes(":") ? itemId.slice(0, itemId.indexOf(":")) : "";
  const item = (project.items[itemId] ??= { kind: /^[a-z0-9-]+$/.test(kind) ? kind : "item", status: "pending" });
  (item.evidence ??= []).push(record);
  saveProject(dir, project);
  const journal_id = appendJournal(dir, { command: "evidence",
    summary: `${itemId} ${checkId} ${result} evaluator=${evaluator} rule=${ruleVersion}`, now });
  return { errors, record, journal_id };
}
