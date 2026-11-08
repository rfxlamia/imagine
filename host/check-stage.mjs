#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { checkStage } from "./capabilities.mjs";

function usageError(message, host = null, stage = null) {
  console.log(JSON.stringify({
    ok: false,
    status: "error",
    host,
    stage,
    reason: message,
  }));
  process.exitCode = 2;
}

export function main(argv = process.argv.slice(2), env = process.env) {
  let host;
  let stage;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--host" || arg.startsWith("--host=")) {
      if (host !== undefined) {
        usageError("duplicate flag: --host", host, stage);
        return;
      }
      if (arg === "--host") {
        if (i + 1 >= argv.length) {
          usageError("missing value for --host", host, stage);
          return;
        }
        host = argv[++i];
      } else {
        host = arg.slice("--host=".length);
      }
    } else if (arg === "--stage" || arg.startsWith("--stage=")) {
      if (stage !== undefined) {
        usageError("duplicate flag: --stage", host, stage);
        return;
      }
      if (arg === "--stage") {
        if (i + 1 >= argv.length) {
          usageError("missing value for --stage", host, stage);
          return;
        }
        stage = argv[++i];
      } else {
        stage = arg.slice("--stage=".length);
      }
    } else {
      usageError(`unknown argument: ${arg}`, host, stage);
      return;
    }
  }

  if (host === undefined) {
    usageError("missing required flag: --host", host, stage);
    return;
  }
  if (stage === undefined) {
    usageError("missing required flag: --stage", host, stage);
    return;
  }

  let result;
  try {
    result = checkStage({ host, stage, env });
  } catch (err) {
    usageError(err.message, host, stage);
    return;
  }

  const ok = result.status === "ok";
  console.log(JSON.stringify({
    ok,
    status: result.status,
    host: result.host,
    stage: result.stage,
    reason: result.reason,
  }));
  process.exitCode = ok ? 0 : 3;
}

try {
  if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
    main();
  }
} catch {
  // Not main or path does not exist
}
