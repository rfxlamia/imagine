import { parseArgs } from "node:util";
import { envelope, err, exitCode } from "./envelope.mjs";
import { ShortsError, UsageError } from "./errors.mjs";
import { COMMANDS } from "./commands/index.mjs";

export const usageText = () => [
  "sequential-shorts <command> [flags]   (every command prints one JSON envelope; add --pretty to indent)",
  ...Object.values(COMMANDS).map((c) => `  ${c.usage}`),
  "  --help",
].join("\n");

const finish = (env, pretty = false) => ({ env, exit: exitCode(env), stdout: JSON.stringify(env, null, pretty ? 2 : 0) });
const usage = (command, message, pretty) => finish(envelope({ command, code: "USAGE", errors: [err("USAGE", "usage", null, message)] }), pretty);

export async function run(argv, ctx = {}) {
  const c = { cwd: process.cwd(), now: () => new Date(), ...ctx };
  const name = argv[0] ?? "(none)";
  if (name === "--help" || name === "-h" || name === "help") return finish(envelope({ command: "help", data: { usage: usageText() } }));
  const cmd = COMMANDS[name];
  if (!cmd) return usage(name, `unknown command: ${name}`);
  let parsed;
  try {
    parsed = parseArgs({ args: argv.slice(1), options: { ...cmd.options, pretty: { type: "boolean" } }, allowPositionals: false, strict: true });
  } catch (e) {
    return usage(name, e.message);
  }
  const pretty = parsed.values.pretty;
  try {
    const result = await cmd.run(parsed.values, c);
    return finish(envelope({ command: name, ...result }), pretty);
  } catch (e) {
    if (e instanceof UsageError) return usage(name, e.message, pretty);
    if (e instanceof ShortsError) {
      return finish(envelope({ command: name, code: e.code, errors: [err(e.code, e.check, e.item, e.message, e.detail)], warnings: e.warnings, not_run: e.notRun }), pretty);
    }
    return finish(envelope({ command: name, code: "HARD_NOT_RUN", errors: [err("HARD_NOT_RUN", "internal", null, "unexpected failure", String(e?.stack ?? e))] }), pretty);
  }
}
