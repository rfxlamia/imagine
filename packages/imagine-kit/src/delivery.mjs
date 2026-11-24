import { existsSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import { checkpointEvidence, checkpointState } from "./checkpoints.mjs";
import { createContext } from "./sources.mjs";
import { err } from "./envelope.mjs";
import { sha256File } from "./hash.mjs";
import { appendJournal } from "./journal.mjs";
import { loadProject, saveProject } from "./project.mjs";

// Delivery state of the whole film (Requirements 2.5, 12.1-12.5).
// Stored as one project item; `ready` is Production_Complete, `published` only follows publishPlatform.
export const DELIVERY_ITEM_ID = "delivery:film";

const sameState = (rec, state) => rec?.state === state;

// A shot's Q3 has passed when its shot-scoped Checkpoint item passed, or the unscoped project-wide Q3 passed.
export function shotQ3Passed(project, shotId) {
  return checkpointState("Q3", checkpointEvidence(project, "Q3", [shotId])) === "passed"
    || checkpointState("Q3", checkpointEvidence(project, "Q3")) === "passed";
}

// Pure: { complete, shots, pending } from the project's Q3 evidence. No shots means not complete.
export function productionStatus(project, shotIds) {
  const pending = shotIds.filter((id) => !shotQ3Passed(project, id));
  return { complete: shotIds.length > 0 && pending.length === 0, shots: shotIds, pending };
}

// Moves the project to `ready` when Q3 passed for every shot (12.1). Never publishes and never touches a
// `published` delivery item. If a `ready` project no longer satisfies Q3 it drops back to `pending`.
// opts: { shots?: string[], now? }
export function updateDelivery(dir, opts = {}) {
  const project = loadProject(dir);
  const shotIds = opts.shots ?? createContext(dir).story.shots.map((s) => s.id);
  const status = productionStatus(project, shotIds);
  const current = project.items?.[DELIVERY_ITEM_ID];
  if (sameState(current, "published")) return { state: "published", changed: false, ...status, errors: [] };
  const next = status.complete ? "ready" : "pending";
  if ((current?.state ?? "pending") === next) return { state: next, changed: false, ...status, errors: [] };
  if (!current && next === "pending") return { state: "pending", changed: false, ...status, errors: [] };
  project.items = { ...(project.items ?? {}), [DELIVERY_ITEM_ID]: { ...(current ?? { kind: "delivery", status: "pending" }), state: next } };
  saveProject(dir, project);
  const now = opts.now ?? new Date();
  const journal_id = appendJournal(dir, { command: "delivery", summary: `${DELIVERY_ITEM_ID} -> ${next}`, now });
  return { state: next, changed: true, journal_id, ...status, errors: [] };
}

// Publishes `file` (path relative to the project, or absolute) to `platform` (12.2-12.5).
// Needs a `publication` Consent_Record scoped to the platform whose fileHash equals the file's actual SHA-256.
// Any refusal leaves the project untouched. opts: { platform, file, now }
export function publishPlatform(dir, { platform, file, now = new Date() } = {}) {
  const project = loadProject(dir);
  const consents = (project.consents ?? []).filter((c) => c.kind === "publication" && c.scope === platform);
  if (!platform || consents.length === 0) {
    return { published: false, errors: [err("CONSENT-REQUIRED", "NEEDS_USER", platform ?? null, `publishing to ${platform ?? "a platform"} needs a publication Consent_Record from the user`)] };
  }
  const consent = consents[consents.length - 1];
  const abs = typeof file === "string" && file ? (isAbsolute(file) ? file : join(dir, file)) : null;
  const actual = abs && existsSync(abs) ? sha256File(abs) : null;
  if (actual === null || consent.fileHash !== actual) {
    const why = actual === null ? "the file to publish does not exist" : consent.fileHash === undefined ? "the publication consent records no file hash" : "the file changed since the user authorized it";
    return { published: false, errors: [err("PUBLICATION-HASH-MISMATCH", "HARD", platform, `${why}; a new Publication_Authorization for ${platform} is required`)] };
  }
  const current = project.items?.[DELIVERY_ITEM_ID];
  project.items = { ...(project.items ?? {}), [DELIVERY_ITEM_ID]: { ...(current ?? { kind: "delivery", status: "pending" }), state: "published" } };
  saveProject(dir, project);
  const rel = abs.startsWith(dir) ? relative(dir, abs) : abs;
  const journal_id = appendJournal(dir, { command: "publish", summary: `published ${rel} to ${platform} sha256=${actual}`, now });
  return { published: true, platform, fileHash: actual, journal_id, errors: [] };
}
