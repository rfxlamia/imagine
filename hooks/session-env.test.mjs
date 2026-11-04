import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ENV_LINE, persistEnv } from "./session-env-lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const envFile = () => join(mkdtempSync(join(tmpdir(), "imagine-env-")), "env.sh");
const run = (env) =>
  spawnSync(process.execPath, [join(here, "session-env.mjs")], {
    input: JSON.stringify({ hook_event_name: "SessionStart", source: "startup" }),
    env: { PATH: process.env.PATH, ...env },
    encoding: "utf8",
  });

test("creates the env file with the telemetry export", () => {
  const f = envFile();
  assert.deepEqual(persistEnv(f), { ok: true, changed: true });
  assert.equal(readFileSync(f, "utf8"), `${ENV_LINE}\n`);
});

test("keeps lines written by other hooks and adds a missing newline", () => {
  const f = envFile();
  writeFileSync(f, "export OTHER=1");
  persistEnv(f);
  assert.equal(readFileSync(f, "utf8"), `export OTHER=1\n${ENV_LINE}\n`);
});

test("is idempotent across startup, resume, clear and compact", () => {
  const f = envFile();
  persistEnv(f);
  assert.deepEqual(persistEnv(f), { ok: true, changed: false });
  assert.equal(readFileSync(f, "utf8"), `${ENV_LINE}\n`);
});

test("unset CLAUDE_ENV_FILE is reported, not silent", () => {
  const r = persistEnv(undefined);
  assert.equal(r.ok, false);
  assert.match(r.reason, /CLAUDE_ENV_FILE is not set/);
});

test("entry point writes the file and nothing to stdout", () => {
  const f = envFile();
  const r = run({ CLAUDE_ENV_FILE: f });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, "");
  assert.equal(readFileSync(f, "utf8"), `${ENV_LINE}\n`);
});

test("entry point exits 1 with a reason when CLAUDE_ENV_FILE is unset", () => {
  const r = run({});
  assert.equal(r.status, 1);
  assert.equal(r.stdout, "");
  assert.match(r.stderr, /HYPERFRAMES_NO_TELEMETRY=1 is not active/);
});

test("entry point exits 1 when the env file cannot be written", () => {
  const dir = mkdtempSync(join(tmpdir(), "imagine-env-"));
  const r = run({ CLAUDE_ENV_FILE: join(dir, "missing-dir", "env.sh") });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /could not write CLAUDE_ENV_FILE/);
});

test("the sourced env file exports the variable to a child shell", () => {
  const f = envFile();
  persistEnv(f);
  const r = spawnSync("sh", ["-c", `. "${f}" && sh -c 'printf %s "$HYPERFRAMES_NO_TELEMETRY"'`], { encoding: "utf8" });
  assert.equal(r.stdout, "1");
});

test("hooks.json registers the SessionStart hook in exec form", () => {
  const cfg = JSON.parse(readFileSync(join(here, "hooks.json"), "utf8"));
  const cmds = (cfg.hooks.SessionStart ?? []).flatMap((m) => m.hooks);
  assert.ok(
    cmds.some((h) => h.type === "command" && h.command === "node" && h.args?.[0] === "${CLAUDE_PLUGIN_ROOT}/hooks/session-env.mjs"),
    "SessionStart must run hooks/session-env.mjs",
  );
  assert.ok(cfg.hooks.SessionStart.every((m) => m.matcher === undefined), "no matcher: every session source re-applies the env");
});
