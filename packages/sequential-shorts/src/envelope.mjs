export const VERSION = "0.1.0";

const EXIT = { HARD: 1, HARD_NOT_RUN: 1, USAGE: 2, BLOCKED: 3, CONFLICT: 4 };

export const err = (code, check, item, message, cause) => ({ code, check, item, message, ...(cause !== undefined ? { cause } : {}) });

export function envelope({ command, code = null, data = {}, errors = [], warnings = [], not_run = [] }) {
  const finalCode = code ?? errors[0]?.code ?? null;
  return { ok: finalCode === null && errors.length === 0, command, version: VERSION, code: finalCode, data, errors, warnings, not_run };
}

export const exitCode = (env) => (env.code === null ? 0 : EXIT[env.code] ?? 1);
