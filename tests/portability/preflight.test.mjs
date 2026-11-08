import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { probeTool, preflight, TOOLS } from "../../host/preflight.mjs";

test("a found tool returns found: true and first non-empty stdout line", () => {
  const fakeSpawn = () => ({ status: 0, stdout: "\n  uv 0.5.0\nsecond line\n" });
  const r = probeTool({ name: "uv", args: ["--version"] }, { spawn: fakeSpawn });
  assert.equal(r.found, true);
  assert.equal(r.version, "uv 0.5.0");
});

test("a missing tool (spawn returns error.code === 'ENOENT')", () => {
  const fakeSpawn = () => ({ error: { code: "ENOENT" } });
  const r = probeTool({ name: "codex", args: ["--version"] }, { spawn: fakeSpawn });
  assert.equal(r.found, false);
  assert.equal(r.version, null);
});

test("a required tool that is missing gives ok: false", () => {
  const fakeSpawn = (cmd) => {
    if (cmd === "uv") return { error: { code: "ENOENT" } };
    return { status: 0, stdout: "1.0.0\n" };
  };
  const r = preflight({ require: ["uv"], spawn: fakeSpawn, nodeVersion: "v22.0.0" });
  assert.equal(r.ok, false);
  const uv = r.tools.find((t) => t.name === "uv");
  assert.equal(uv.required, true);
  assert.equal(uv.found, false);
});

test("an unknown required name throws", () => {
  assert.throws(() => preflight({ require: ["unknown-tool-name"] }), /unknown required tool/);
});

test("the node version check passes for >= 22 and fails for < 22", () => {
  const probeOld = probeTool({ name: "node" }, { nodeVersion: "v20.10.0" });
  assert.equal(probeOld.found, true);
  assert.equal(probeOld.ok_version, false);

  const resOld = preflight({ nodeVersion: "v20.10.0", spawn: () => ({ status: 0, stdout: "1.0.0\n" }) });
  assert.equal(resOld.ok, false);

  const probeNew = probeTool({ name: "node" }, { nodeVersion: "v22.14.0" });
  assert.equal(probeNew.found, true);
  assert.equal(probeNew.ok_version, true);

  const resNew = preflight({ nodeVersion: "v22.14.0", spawn: () => ({ status: 0, stdout: "1.0.0\n" }) });
  assert.equal(resNew.ok, true);
});

test("CLI prints JSON and handles exit codes", () => {
  const cliPath = join(fileURLToPath(import.meta.url), "..", "..", "..", "host", "preflight.mjs");

  const r0 = spawnSync(process.execPath, [cliPath, "--require", "node"], {
    encoding: "utf8",
  });
  assert.equal(r0.status, 0);
  const p0 = JSON.parse(r0.stdout.trim());
  assert.equal(p0.ok, true);
  assert.equal(Array.isArray(p0.tools), true);

  const r2 = spawnSync(process.execPath, [cliPath, "--invalid-flag"], {
    encoding: "utf8",
  });
  assert.equal(r2.status, 2);

  const r2Unknown = spawnSync(process.execPath, [cliPath, "--require", "bogus_tool"], {
    encoding: "utf8",
  });
  assert.equal(r2Unknown.status, 2);
});
