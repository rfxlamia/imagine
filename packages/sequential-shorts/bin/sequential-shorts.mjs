#!/usr/bin/env node
try {
  const { run } = await import("../src/cli.mjs");
  const { stdout, exit } = await run(process.argv.slice(2), { cwd: process.cwd() });
  process.stdout.write(`${stdout}\n`);
  process.exitCode = exit;
} catch (e) {
  process.stderr.write(`sequential-shorts: fatal: ${e?.message ?? e}\n`);
  const env = { ok: false, command: process.argv[2] ?? "(none)", version: "0.1.0", code: "HARD_NOT_RUN", data: {},
    errors: [{ code: "HARD_NOT_RUN", check: "internal", item: null, message: "sequential-shorts failed to start", cause: String(e?.message ?? e) }],
    warnings: [], not_run: [] };
  process.stdout.write(`${JSON.stringify(env)}\n`);
  process.exitCode = 1;
}
