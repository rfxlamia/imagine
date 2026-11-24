import { err } from "./envelope.mjs";
import { isBlankQuote } from "./gates.mjs";
import { appendJournal } from "./journal.mjs";
import { loadProject, saveProject } from "./project.mjs";

export const CONSENT_KINDS = ["material_change", "publication", "legacy_approval"];
// legacy_approval is written only by migrate.mjs and the gate shim (internal option); never by the user-facing `consent record`.
export const USER_CONSENT_KINDS = CONSENT_KINDS.filter((k) => k !== "legacy_approval");

const norm = (s) => String(s ?? "").toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();

// Whole-quote matches against standard agent phrasing (compared after normalization).
const BOILERPLATE = new Set([
  "approved", "approve", "user approved", "user approves", "the user approved", "the user approves",
  "user approved the change", "user approved this change", "user approved publication", "user approved publishing",
  "approved by user", "approved by the user", "approved automatically", "auto approved", "auto approve",
  "automatically approved", "agent approved", "approved by agent", "approved by the agent", "approved by orchestrator",
  "consent granted", "consent given", "user consents", "user consent granted", "the user consents",
  "n a", "na", "none", "tbd", "todo", "placeholder", "lorem ipsum", "test", "quote", "user quote", "verbatim quote",
  "confirmed by agent", "confirmed by the agent",
]);

// Template-shaped text: unfilled placeholders such as <quote>, {{quote}}, [user words], ${quote}, %s.
const TEMPLATE = [/<[^<>\n]{1,60}>/, /\{\{[^}]*\}\}/, /\$\{[^}]*\}/, /\[(?:user|quote|insert|verbatim|your)[^\]]*\]/i, /%[sd]\b/, /\blorem ipsum\b/i];

// Agent narration about the user instead of the user's own words.
const THIRD_PERSON = /^(?:the )?(?:user|agent|assistant|orchestrator|ai)\b.{0,40}\b(?:approved?|approves|consent(?:s|ed)?|authori[sz]ed?|confirmed?|agreed?|said)\b/i;

// True when a quote is template-shaped or agent-authored boilerplate. `promptText` (optional) is text the agent showed
// the user; a quote identical to it was copied, not spoken.
export function looksAgentGenerated(quote, { promptText } = {}) {
  const raw = String(quote ?? "");
  const n = norm(raw);
  if (!n) return false;
  if (BOILERPLATE.has(n)) return true;
  if (TEMPLATE.some((re) => re.test(raw))) return true;
  if (THIRD_PERSON.test(raw.trim())) return true;
  if (promptText !== undefined && norm(promptText) === n) return true;
  return false;
}

export function recordConsent(dir, { scope, quote, kind, fileHash, promptText, now, internal = false }) {
  if (isBlankQuote(quote)) {
    return { errors: [err("GATE-QUOTE", "NEEDS_USER", null, "consent requires the user's verbatim words")] };
  }
  if (looksAgentGenerated(quote, { promptText })) {
    return { errors: [err("GATE-QUOTE", "NEEDS_USER", null, "consent quote looks template-shaped or agent-generated; ask the user and pass their own verbatim words")] };
  }
  if (!CONSENT_KINDS.includes(kind)) {
    return { errors: [err("CONSENT-KIND", "HARD", null, `consent kind must be one of ${CONSENT_KINDS.join(", ")}`)] };
  }
  if (kind === "legacy_approval" && !internal) {
    return { errors: [err("CONSENT-KIND", "HARD", null, "legacy_approval is reserved for migration and the gate shim; use material_change or publication")] };
  }
  if (typeof scope !== "string" || scope.trim() === "") {
    return { errors: [err("CONSENT-SCOPE", "HARD", null, "consent requires a non-empty scope (item id or platform)")] };
  }
  if (fileHash !== undefined && !/^[0-9a-f]{64}$/.test(fileHash)) {
    return { errors: [err("CONSENT-FILEHASH", "HARD", scope, "fileHash must be a lowercase sha256 hex digest")] };
  }
  const project = loadProject(dir);
  const consent = { kind, scope, quote, ...(fileHash !== undefined ? { fileHash } : {}), at: now.toISOString() };
  project.consents = [...(project.consents ?? []), consent];
  saveProject(dir, project);
  const journal_id = appendJournal(dir, { command: "consent", summary: `${kind} ${scope} quote=${JSON.stringify(quote)}`, now });
  return { consent, journal_id, errors: [] };
}
