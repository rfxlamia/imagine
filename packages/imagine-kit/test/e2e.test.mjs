import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadValidator } from "../src/schemas.mjs";

const bin = fileURLToPath(new URL("../bin/imagine-kit.mjs", import.meta.url));
const kit = (cwd, ...args) => {
  const r = spawnSync(process.execPath, [bin, ...args], { cwd, encoding: "utf8" });
  const last = r.stdout.trim().split("\n").at(-1);
  return { exit: r.status, env: JSON.parse(last), lines: r.stdout.trim().split("\n").length };
};

test("e2e: new, gate and status through the real bin", () => {
  const cwd = mkdtempSync(join(tmpdir(), "imagine-kit-e2e-"));
  const made = kit(cwd, "new", "Keeper", "--format", "landscape", "--audio-mode", "text-led", "--duration", "12-15", "--silence", "intentional");
  assert.equal(made.exit, 0);
  assert.equal(made.lines, 1);
  assert.equal(loadValidator("envelope")(made.env).valid, true);
  const noQuote = kit(cwd, "gate", "G0", "approve");
  assert.equal(noQuote.exit, 7);
  const ok = kit(cwd, "gate", "G0", "approve", "--quote", "setuju");
  assert.equal(ok.exit, 0);
  const status = kit(cwd, "status");
  assert.equal(status.exit, 0);
  assert.equal(status.env.data.gates.G0.state, "approved");
  assert.equal(status.env.data.stage, "G1");
  assert.equal(kit(cwd, "validate").exit, 2);
});
