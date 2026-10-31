#!/usr/bin/env node
try {
  const { run } = await import("../src/cli.mjs");
  const { stdout, exit } = await run(process.argv.slice(2), { cwd: process.cwd() });
  process.stdout.write(`${stdout}\n`);
  process.exitCode = exit;
} catch (e) {
  process.stderr.write(`imagine-kit: fatal: ${e?.message ?? e}\n`);
  const env = { ok: false, command: process.argv[2] ?? "(none)", kit_version: "0.1.0", contract: 1, project: null, code: "HARD_NOT_RUN",
    data: {}, errors: [{ rule: "HARD-INTERNAL", code: "HARD_NOT_RUN", item: null, message: "kit failed to start", cause: String(e?.message ?? e) }],
    advice: [], not_run: [], waived: [], journal_id: null };
  process.stdout.write(`${JSON.stringify(env)}\n`);
  process.exitCode = 1;
}
