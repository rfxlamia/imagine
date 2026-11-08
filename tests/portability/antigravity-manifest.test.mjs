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
  // NOTE: These assertions characterize unverified enforcement status for Antigravity.
  // These assertions are intentionally flipped by the future live-verification PR.
  test("HOSTS.antigravity has unverified scene_builder_enforcement and checkStage returns BLOCKED", () => {
    assert.notEqual(HOSTS.antigravity.scene_builder_enforcement, "VERIFIED-RUN");

    const stageCheck = checkStage({ host: "antigravity", stage: "scene-builder" });
    assert.equal(stageCheck.status, "BLOCKED");
    assert.equal(typeof stageCheck.reason, "string");
    assert.ok(stageCheck.reason.length > 0, "reason must be a non-empty string");
    assert.match(stageCheck.reason, /enforcement/i);
  });
});
