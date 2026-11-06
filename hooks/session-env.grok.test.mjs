import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { main } from "./session-env-grok.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const entry = join(here, "session-env.mjs");

function envFile(contents) {
  const file = join(mkdtempSync(join(tmpdir(), "imagine-grok-env-")), "env.sh");
  writeFileSync(file, contents);
  return file;
}

test("grok session module does not write CLAUDE_ENV_FILE", () => {
  const file = envFile("export OTHER=1\n");
  const result = main({ CLAUDE_ENV_FILE: file, GROK_HOOK_EVENT: "session_start" });
  assert.equal(result.ok, true);
  assert.equal(readFileSync(file, "utf8"), "export OTHER=1\n");
});

test("grok session start exits 0 with empty stdout and leaves the env file unchanged", () => {
  const file = envFile("export OTHER=1\n");
  const r = spawnSync(process.execPath, [entry], {
    input: JSON.stringify({ hook_event_name: "SessionStart", hookEventName: "session_start" }),
    encoding: "utf8",
    env: { PATH: process.env.PATH, GROK_HOOK_EVENT: "session_start", CLAUDE_ENV_FILE: file },
  });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, "");
  assert.equal(r.stderr, "");
  assert.equal(readFileSync(file, "utf8"), "export OTHER=1\n");
});

test("hooks.json still points SessionStart at the claude entry", () => {
  const cfg = JSON.parse(readFileSync(join(here, "hooks.json"), "utf8"));
  const cmds = (cfg.hooks.SessionStart ?? []).flatMap((group) => group.hooks);
  assert.ok(cmds.some((hook) => hook.command === "node" && hook.args?.[0] === "${CLAUDE_PLUGIN_ROOT}/hooks/session-env.mjs"));
  assert.ok(!JSON.stringify(cfg).includes("session-env-grok"));
});
