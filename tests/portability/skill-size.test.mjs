import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const skillsDir = join(repoRoot, "skills");

// Frontmatter regex copied from tools/agent-manifest.mjs (parseFrontmatter)
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

function getSkillFiles() {
  const entries = readdirSync(skillsDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name !== "placeholder") {
      const skillPath = join(skillsDir, entry.name, "SKILL.md");
      try {
        if (statSync(skillPath).isFile()) {
          files.push({ name: entry.name, path: skillPath });
        }
      } catch {}
    }
  }
  return files;
}

test("skills body sizes comply with agy 24000 byte limit and imagine-generate stub cap", (t) => {
  const skills = getSkillFiles();
  assert.ok(skills.length > 0, "expected to find SKILL.md files under skills/");

  for (const { name, path } of skills) {
    const text = readFileSync(path, "utf8");
    const match = text.match(FRONTMATTER_RE);
    assert.ok(match, `${name}/SKILL.md is missing frontmatter`);

    const body = text.slice(match[0].length);
    const bodyBytes = Buffer.byteLength(body, "utf8");

    t.diagnostic(`${name}: ${bodyBytes} bytes`);

    // agy loads only the first 24000 body bytes
    assert.ok(
      bodyBytes < 24000,
      `${name} body size ${bodyBytes} >= 24000 limit (agy loads only the first 24000 body bytes)`
    );

    if (name === "imagine-generate") {
      // Stub cap, target margin for imagine-generate. Other skills deliberately have no margin assertion (imagine-edit has ~1530 B headroom).
      assert.ok(
        bodyBytes <= 22500,
        `imagine-generate body size ${bodyBytes} > 22500 (exceeds stub cap / target margin)`
      );
    }
  }
});

test("imagine-generate reference files exist", () => {
  const refDir = join(skillsDir, "imagine-generate", "references");
  const requiredRefs = [
    "image-and-resolution.md",
    "audio-and-modes.md",
    "state-and-review.md",
  ];

  for (const refFile of requiredRefs) {
    const refPath = join(refDir, refFile);
    assert.ok(
      existsSync(refPath) && statSync(refPath).isFile(),
      `Expected reference file to exist: ${refPath}`
    );
  }
});
