import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { HOSTS, checkStage } from "../../host/capabilities.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..");

describe("manifest tests", () => {
  test(".antigravity-plugin/plugin.json parses and satisfies required manifest fields", () => {
    const agyManifestPath = resolve(repoRoot, ".antigravity-plugin", "plugin.json");
    const claudeManifestPath = resolve(repoRoot, ".claude-plugin", "plugin.json");

    const agyContent = readFileSync(agyManifestPath, "utf8");
    const agyManifest = JSON.parse(agyContent);
    const claudeContent = readFileSync(claudeManifestPath, "utf8");
    const claudeManifest = JSON.parse(claudeContent);

    assert.equal(agyManifest.name, "imagine");
    assert.equal(agyManifest.version, claudeManifest.version);
    assert.equal(typeof agyManifest.description, "string");
    assert.ok(agyManifest.description.trim().length > 0, "description must be non-empty");
    assert.ok(agyManifest.author, "author must be present");
    assert.equal(typeof agyManifest.author.name, "string");
    assert.ok(agyManifest.author.name.trim().length > 0, "author.name must be present and non-empty");
    assert.equal(typeof agyManifest.repository, "string");
  });
});

describe("capability characterization tests", () => {
  // Antigravity has no host-native write hook, so it must never claim hook enforcement.
  // Stage 8b passes through the detective kit-guard path, backed by the recorded live run
  // in docs/harnesses/evidence/antigravity-8b-run.md.
  test("HOSTS.antigravity has no hook claim and checkStage returns ok via kit-guard", () => {
    assert.notEqual(HOSTS.antigravity.scene_builder_enforcement, "VERIFIED-RUN");
    assert.equal(HOSTS.antigravity.subagents, "VERIFIED-RUN");

    const stageCheck = checkStage({ host: "antigravity", stage: "scene-builder", env: {} });
    assert.equal(stageCheck.status, "ok");
    assert.equal(stageCheck.isolation, "kit-guard");
    assert.equal(stageCheck.reason, null);
  });
});
