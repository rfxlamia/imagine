import { deriveAll } from "../derive.mjs";
import { appendJournal } from "../journal.mjs";
import { migrateProject } from "../migrate.mjs";
import { loadProject, resolveProject, saveProject } from "../project.mjs";
import { createContext } from "../sources.mjs";

// Converts Legacy_Gate records to Evidence_Records and Consent_Records (Requirements 13.1, 13.4).
// Dry run unless --apply. Items whose recorded input hashes no longer match the sources are reported as stale and left untouched.
export default {
  locks: true,
  options: { apply: { type: "boolean" } },
  async run({ values }, ctx) {
    const { dir, rel } = resolveProject(ctx.cwd, values.project);
    let staleIds = [];
    try {
      staleIds = deriveAll(createContext(dir)).items.filter((i) => i.status === "stale" || i.stale).map((i) => i.id);
    } catch { /* sources unreadable: hashes cannot be compared, so migrate every record */ }
    const { project, report } = migrateProject(loadProject(dir), { staleIds });
    const mode = values.apply ? "apply" : "dry-run";
    let journal_id = null;
    if (values.apply) {
      saveProject(dir, project);
      journal_id = appendJournal(dir, { command: "migrate", summary: `migrated ${report.migrated.length}, stale ${report.stale.length}, unmapped ${report.unmapped.length}`, now: ctx.now() });
    }
    const advice = report.stale.map((s) => ({ rule: "MIGRATE-STALE", item: s.id, source: "project.yaml", message: s.reason }));
    return { project: rel, journal_id, advice, data: { mode, report } };
  },
};
