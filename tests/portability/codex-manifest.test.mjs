import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkStage, HOSTS } from "../../host/capabilities.mjs";
test("Codex packaging keeps version parity and explicitly disables Claude hooks", () => {
  const manifest = JSON.parse(readFileSync(new URL("../../.codex-plugin/plugin.json", import.meta.url)));
  const claude = JSON.parse(readFileSync(new URL("../../.claude-plugin/plugin.json", import.meta.url)));
  assert.equal(manifest.name, claude.name); assert.equal(manifest.version, claude.version);
  assert.equal(manifest.skills, "./skills/"); assert.deepEqual(manifest.hooks, { hooks: {} });
});
test("Codex native scene-builder passes only through recorded native runtime evidence", () => {
  const result = checkStage({ host: "codex", stage: "scene-builder" });
  assert.equal(result.status, "ok"); assert.equal(result.isolation, "kit-guard");
  assert.equal(HOSTS.codex.scene_builder_enforcement, "UNKNOWN");
  assert.equal(HOSTS.codex.kit_guard_run, "docs/harnesses/evidence/codex-native-run.md");
  const missing = checkStage({ host: "codex", stage: "scene-builder", hosts: { codex: { ...HOSTS.codex, kit_guard_run: null } } });
  assert.equal(missing.status, "BLOCKED"); assert.match(missing.reason, /kit_guard_run evidence missing/);
});
