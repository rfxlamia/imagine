import { UsageError } from "../errors.mjs";
import { USER_CONSENT_KINDS, recordConsent } from "../consent.mjs";
import { resolveProject } from "../project.mjs";

const USAGE = `usage: consent record --kind <${USER_CONSENT_KINDS.join("|")}> --scope <item-or-platform> --quote "<user words>" [--file-hash <sha256>]`;

// Records the user's verbatim words as a Consent_Record (Requirements 6.6, 12.2).
export default {
  locks: true,
  options: { kind: { type: "string" }, scope: { type: "string" }, quote: { type: "string" }, "file-hash": { type: "string" } },
  async run({ values, positionals }, ctx) {
    // The registry key "consent record" already consumed the subcommand word.
    if (positionals.length !== 0) throw new UsageError(USAGE);
    const { dir, rel } = resolveProject(ctx.cwd, values.project);
    const r = recordConsent(dir, { kind: values.kind, scope: values.scope, quote: values.quote, fileHash: values["file-hash"], now: ctx.now() });
    return { project: rel, errors: r.errors, journal_id: r.journal_id ?? null, data: r.consent ? { consent: r.consent } : {} };
  },
};
