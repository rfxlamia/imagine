import { strict as assert } from "node:assert";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { bundleMarkdown, checkGreenAgainstRed, extractSection, packFiles, promptSha } from "./run.mjs";

const here = join(fileURLToPath(import.meta.url), "..");
const scenario = "# S\n\n## Targets\n\nA, B\n\n## Prompt\n\n````text\nhello\n````\n\n## Pass criteria\n\n- A: ok\n";
const red = (sha, model = "M1") => `# RED: s (gemini)\n\n- model: ${model}\n- date: 2026-11-01\n- prompt sha256: ${sha}\n\n## Answer\n\nx\n\n## Grade\n\n| Rule | Result |\n`;

test("extractSection returns the body up to the next heading", () => {
  assert.equal(extractSection(scenario, "Targets"), "A, B");
  assert.equal(extractSection(scenario, "Pass criteria"), "- A: ok");
  assert.equal(extractSection(scenario, "Grade"), null);
});

test("green save requires a RED run with the same prompt hash", () => {
  const sha = promptSha(scenario);
  assert.match(checkGreenAgainstRed(null, sha, "M1").error, /run RED first/);
  assert.match(checkGreenAgainstRed(red("000000000000"), sha, "M1").error, /prompt changed/);
  assert.deepEqual(checkGreenAgainstRed(red(sha), sha, "M1"), { warning: null });
  assert.match(checkGreenAgainstRed(red(sha), sha, "M2").warning, /differs from RED/);
});

test("every committed RED run matches its current scenario prompt", () => {
  const runs = readdirSync(join(here, "red")).filter((f) => f !== "SUMMARY.md").map((f) => f.replace(/\.md$/, ""));
  assert.equal(runs.length, 11);
  for (const f of runs) {
    const name = f.split(".")[0];
    const sha = promptSha(readFileSync(join(here, "scenarios", `${name}.md`), "utf8"));
    assert.equal(checkGreenAgainstRed(readFileSync(join(here, "red", `${f}.md`), "utf8"), sha, "x").error, undefined, f);
  }
});

test("pack ships skills, agents and the manifest only", () => {
  const files = packFiles();
  assert.ok(files.includes(".claude-plugin/plugin.json"));
  assert.ok(files.includes("skills/imagine/SKILL.md"));
  assert.ok(files.includes("agents/scene-builder.md"));
  assert.ok(files.every((f) => /^(skills|agents)\/|^\.claude-plugin\/plugin\.json$/.test(f)), files.join(","));
  assert.ok(!files.some((f) => f.includes("placeholder")));
});

test("pack --for ships one skill folder or one agent file plus the manifest", () => {
  const skill = packFiles("imagine");
  assert.ok(skill.includes("skills/imagine/SKILL.md") && skill.includes(".claude-plugin/plugin.json"));
  assert.ok(skill.every((f) => f.startsWith("skills/imagine/") || f === ".claude-plugin/plugin.json"), skill.join(","));
  assert.deepEqual(packFiles("scene-builder"), [".claude-plugin/plugin.json", "agents/scene-builder.md"]);
  assert.throws(() => packFiles("nope"), /no tracked skill or agent/);
});

test("every scenario has a packable skill or agent", () => {
  for (const f of readdirSync(join(here, "scenarios"))) {
    assert.ok(packFiles(f.replace(/\.md$/, "")).length <= 10, f);
  }
});

test("bundleMarkdown wraps each file in FILE/END markers", () => {
  const out = bundleMarkdown([{ path: "a.md", text: "one\n" }, { path: "b.md", text: "two" }]);
  assert.match(out, /===== FILE: a\.md =====\none\n===== END FILE =====\n\n===== FILE: b\.md =====\ntwo\n===== END FILE =====/);
});
