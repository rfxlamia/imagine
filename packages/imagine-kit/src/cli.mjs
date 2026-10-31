import { parseArgs } from "node:util";
import { envelope, err, exitCode } from "./envelope.mjs";
import { KitError, UsageError } from "./errors.mjs";
import { withLock } from "./fsx.mjs";
import { resolveProject } from "./project.mjs";
import { COMMANDS } from "./commands/index.mjs";

function pick(argv) {
  const two = argv.slice(0, 2).join(" ");
  if (COMMANDS[two]) return [COMMANDS[two], argv.slice(2), two];
  if (argv[0] && COMMANDS[argv[0]]) return [COMMANDS[argv[0]], argv.slice(1), argv[0]];
  return [null, argv, argv.slice(0, 2).join(" ") || "(none)"];
}

const finish = (env, pretty = false) => ({ env, exit: exitCode(env), stdout: JSON.stringify(env, null, pretty ? 2 : 0) });
const usage = (command, message, pretty) => finish(envelope({ command, code: "USAGE", errors: [err("USAGE", "USAGE", null, message)] }), pretty);

export async function run(argv, ctx = {}) {
  const c = { cwd: process.cwd(), now: () => new Date(), hooks: {}, ...ctx };
  const [cmd, rest, name] = pick(argv);
  if (!cmd) return usage(name, `unknown command: ${name}`);
  let parsed;
  try {
    parsed = parseArgs({ args: rest, options: { ...cmd.options, project: { type: "string" }, pretty: { type: "boolean" } }, allowPositionals: true, strict: true });
  } catch (e) {
    return usage(name, e.message);
  }
  const pretty = parsed.values.pretty;
  try {
    const exec = () => cmd.run({ values: parsed.values, positionals: parsed.positionals }, c);
    const result = await (cmd.locks ? withLock(resolveProject(c.cwd, parsed.values.project).dir, exec) : exec());
    return finish(envelope({ command: name, ...result }), pretty);
  } catch (e) {
    if (e instanceof UsageError) return usage(name, e.message, pretty);
    if (e instanceof KitError) return finish(envelope({ command: name, code: e.code, errors: [err(e.rule ?? "HARD-INTERNAL", e.code, e.item ?? null, e.message, e.detail)] }), pretty);
    return finish(envelope({ command: name, code: "HARD_NOT_RUN", errors: [err("HARD-INTERNAL", "HARD_NOT_RUN", null, "unexpected failure", String(e?.message ?? e))] }), pretty);
  }
}
