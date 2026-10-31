export const KIT_VERSION = "0.1.0";

const EXIT = { HARD: 1, HARD_NOT_RUN: 1, KEY_NOT_OWNED: 1, PLACEHOLDER: 1, GUARD_VIOLATION: 1, INVALID_WAIVER: 1,
  USAGE: 2, BLOCKED: 3, STALE_INPUTS: 4, CONFLICT: 4, BRIEF_OUTDATED: 4, LOCKED: 5, REFS_NOT_APPROVED: 6, NEEDS_USER: 7 };

export function envelope({ command, project = null, code = null, data = {}, errors = [], advice = [], not_run = [], journal_id = null }) {
  const finalCode = code ?? errors[0]?.code ?? null;
  return { ok: finalCode === null && errors.length === 0, command, kit_version: KIT_VERSION, contract: 1, project,
    code: finalCode, data, errors, advice, not_run, waived: [], journal_id };
}

export const err = (rule, code, item, message, cause) => ({ rule, code, item, message, ...(cause ? { cause } : {}) });

export const exitCode = (env) => (env.code === null ? 0 : EXIT[env.code] ?? 1);
