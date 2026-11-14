import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const skillsDir = join(repoRoot, "skills");

function getSkillFiles() {
  const entries = readdirSync(skillsDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
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

test("every skill read of claude-code-platform.md is conditional on claude-code host-id", () => {
  const skills = getSkillFiles();
  assert.ok(skills.length > 0, "expected to find SKILL.md files under skills/");

  const requiredSubstring = "read only when the active host-id is `claude-code`";
  let count = 0;

  for (const { name, path } of skills) {
    const content = readFileSync(path, "utf8");
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes("claude-code-platform.md")) {
        assert.ok(
          line.includes(requiredSubstring),
          `${name}/SKILL.md line ${i + 1} contains claude-code-platform.md without required conditionality: ${line}`
        );
        count++;
      }
    }
  }

  assert.ok(
    count >= 5,
    `expected at least 5 lines containing claude-code-platform.md across skills, found ${count}`
  );
});

test("every skill that mentions harness-portability.md as a read also mentions hosts/<host-id>.md", () => {
  const skills = getSkillFiles();
  assert.ok(skills.length > 0, "expected to find SKILL.md files under skills/");

  const readPattern = /^\s*-\s*`?(?:R\/)?docs\/contracts\/harness-portability\.md`?/m;
  let matchingSkills = 0;

  for (const { name, path } of skills) {
    const content = readFileSync(path, "utf8");
    if (readPattern.test(content)) {
      matchingSkills++;
      assert.ok(
        content.includes("docs/contracts/hosts/<host-id>.md"),
        `${name}/SKILL.md lists harness-portability.md as a read but does not mention docs/contracts/hosts/<host-id>.md`
      );
    }
  }

  assert.ok(
    matchingSkills >= 3,
    `expected at least 3 skills to mention harness-portability.md as a read, found ${matchingSkills}`
  );
});

test("all six direct entrypoints require the active host mapping before dispatch, including resume", () => {
  const skills = getSkillFiles().filter(s => s.name !== "placeholder");
  assert.equal(skills.length, 6);
  for (const skill of skills) {
    const body = readFileSync(skill.path, "utf8");
    assert.match(body, /Before any project action or agent dispatch.*direct invocation.*resume/);
    assert.match(body, /docs\/contracts\/hosts\/<host-id>\.md/);
    assert.doesNotMatch(body, /host\/codex-worker\.mjs/);
  }
});
