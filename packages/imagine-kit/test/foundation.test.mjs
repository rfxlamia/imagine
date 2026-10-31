import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { envelope, exitCode, err } from "../src/envelope.mjs";
import { hashValue } from "../src/hash.mjs";
import { withLock, writeAtomic } from "../src/fsx.mjs";
import { appendJournal } from "../src/journal.mjs";
import { loadValidator } from "../src/schemas.mjs";
import { slugify, parseDuration } from "../src/project.mjs";
import { run } from "../src/cli.mjs";

const tmp = () => mkdtempSync(join(tmpdir(), "imagine-kit-"));
const validEnvelope = loadValidator("envelope");

test("envelope: ok follows errors and code; exit codes follow the contract", () => {
  const ok = envelope({ command: "status" });
  assert.equal(ok.ok, true);
  assert.equal(exitCode(ok), 0);
  assert.equal(validEnvelope(ok).valid, true);
  const table = { HARD: 1, HARD_NOT_RUN: 1, KEY_NOT_OWNED: 1, PLACEHOLDER: 1, USAGE: 2, BLOCKED: 3,
    STALE_INPUTS: 4, CONFLICT: 4, REFS_NOT_APPROVED: 6, NEEDS_USER: 7 };
  for (const [code, exit] of Object.entries(table)) {
    const e = envelope({ command: "x", errors: [err("R", code, null, "m")] });
    assert.equal(e.ok, false);
    assert.equal(e.code, code);
    assert.equal(exitCode(e), exit);
    assert.equal(validEnvelope(e).valid, true, code);
  }
  const needsUser = envelope({ command: "gate", code: "NEEDS_USER" });
  assert.equal(needsUser.ok, false);
  assert.equal(exitCode(needsUser), 7);
  assert.equal(validEnvelope(needsUser).valid, true);
});

test("canonical hashing ignores key order", () => {
  assert.equal(hashValue({ a: 1, b: [1, { c: 2, d: 3 }] }), hashValue({ b: [1, { d: 3, c: 2 }], a: 1 }));
  assert.notEqual(hashValue({ a: 1 }), hashValue({ a: 2 }));
});

test("PROC-ATOMIC-COMMIT: a failure before rename leaves the target untouched and no temp file", () => {
  const dir = tmp();
  const f = join(dir, "a.txt");
  writeAtomic(f, "old");
  assert.throws(() => writeAtomic(f, "new", { beforeRename() { throw new Error("boom"); } }), /boom/);
  assert.equal(readFileSync(f, "utf8"), "old");
  assert.deepEqual(readdirSync(dir), ["a.txt"]);
  writeAtomic(f, "new");
  assert.equal(readFileSync(f, "utf8"), "new");
});

test("PROC-LOCK-HASHED-WRITES: the project write lock fails fast, is always released and expires when stale", async () => {
  const dir = tmp();
  await withLock(dir, async () => {
    await assert.rejects(() => withLock(dir, async () => {}), (e) => e.code === "LOCKED");
  });
  assert.equal(existsSync(join(dir, ".lock")), false);
  mkdirSync(join(dir, ".lock"));
  const old = new Date(Date.now() - 60_000);
  utimesSync(join(dir, ".lock"), old, old);
  assert.equal(await withLock(dir, async () => "ok"), "ok");
  await assert.rejects(() => withLock(dir, async () => { throw new Error("boom"); }), /boom/);
  assert.equal(existsSync(join(dir, ".lock")), false);
});

test("PROC-JOURNAL: entries get sequential ids and the file only grows", () => {
  const dir = tmp();
  const now = new Date("2026-11-01T10:00:00Z");
  assert.equal(appendJournal(dir, { command: "new", summary: "created", now }), "j-000001");
  assert.equal(appendJournal(dir, { command: "gate", summary: "G0\napproved", now }), "j-000002");
  const text = readFileSync(join(dir, "journal.md"), "utf8");
  assert.match(text, /^- j-000001 2026-11-01T10:00:00.000Z new: created$/m);
  assert.match(text, /^- j-000002 .* gate: G0 approved$/m);
});

test("project helpers: slugify and parseDuration", () => {
  assert.equal(slugify("The Last Keeper!"), "the-last-keeper");
  assert.equal(slugify("Café 2"), "cafe-2");
  assert.equal(slugify("日本"), "");
  assert.deepEqual(parseDuration("12-15"), { min: 12, max: 15 });
  assert.throws(() => parseDuration("15-12"), /duration/);
  assert.throws(() => parseDuration("abc"), /duration/);
});

test("cli: an unknown command is a one-line USAGE envelope", async () => {
  const r = await run(["bogus"], { cwd: tmp() });
  assert.equal(r.exit, 2);
  assert.equal(r.stdout.includes("\n"), false);
  const e = JSON.parse(r.stdout);
  assert.equal(e.code, "USAGE");
  assert.equal(validEnvelope(e).valid, true);
});

test("cli: the bin prints the envelope as the last stdout line", () => {
  const bin = fileURLToPath(new URL("../bin/imagine-kit.mjs", import.meta.url));
  const r = spawnSync(process.execPath, [bin, "bogus"], { cwd: tmp(), encoding: "utf8" });
  assert.equal(r.status, 2);
  assert.equal(JSON.parse(r.stdout.trim().split("\n").at(-1)).code, "USAGE");
});
