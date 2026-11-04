import { strict as assert } from "node:assert";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  bundleMarkdown,
  bundleShaAt,
  checkAnswerPatch,
  checkGreenAgainstRed,
  extractAnswer,
  extractSection,
  nextRound,
  packFiles,
  parseHeader,
  promptSha,
  yamlBlockErrors,
} from "./run.mjs";

const here = join(fileURLToPath(import.meta.url), "..");
const scenario = "# S\n\n## Targets\n\nA, B\n\n## Prompt\n\n````text\nhello\n````\n\n## Pass criteria\n\n- A: ok\n";
const red = (sha, model = "M1") => `# RED: s (gemini)\n\n- model: ${model}\n- date: 2026-11-01\n- prompt sha256: ${sha}\n\n## Answer\n\nx\n\n## Grade\n\n| Rule | Result |\n`;

// Defects that are known and recorded in the stored answers. The machine check
// must report exactly these, so a new defect fails the test and a fixed one
// has to be re-baselined on purpose.
const KNOWN_DEFECTS = {
  "fx-designer.gemini.md": [
    "yaml block 1: line 76: indented deeper than the value on line 75",
    'patch is missing the required top-level key "brief_hash"',
  ],
};

test("extractSection returns the body up to the next heading", () => {
  assert.equal(extractSection(scenario, "Targets"), "A, B");
  assert.equal(extractSection(scenario, "Pass criteria"), "- A: ok");
  assert.equal(extractSection(scenario, "Grade"), null);
});

test("extractAnswer keeps the answer's own subheadings", () => {
  const answer = "# GREEN: s (gemini)\n\n## Answer\n\n## 1. Actions\n\ndo it\n\n## 2. Notes\n\nnote\n\n## Grade\n\n| Rule | Result |\n";
  assert.equal(extractAnswer(answer), "## 1. Actions\n\ndo it\n\n## 2. Notes\n\nnote");
  assert.equal(extractAnswer("# GREEN: s\n\n## Answer\n\nbody\n"), "body");
  assert.equal(extractAnswer("# GREEN: s\n\nno answer\n"), null);
});

test("yamlBlockErrors accepts a well-formed patch", () => {
  const block = [
    "stage: fx",
    "author: fx-designer",
    "inputs:",
    "  style:",
    '    texture: "5a10"',
    "ops:",
    "  - shot: s02",
    "    set:",
    "      fx:",
    "        - id: a",
    "          tool: registry",
    "          name: dust-motes",
    '          serialized: "effect-id=registry:dust-motes"',
    "          range: \"0%-100%\"",
    "          fallback: null",
  ].join("\n");
  assert.deepEqual(yamlBlockErrors(block), []);
});

test("yamlBlockErrors rejects a key indented deeper than a sibling value", () => {
  const block = ["ops:", "  - shot: s07", "    set:", "      overlays:", "        - id: s07-motes", "          name: dust-motes", '           serialized: "effect-id=registry:dust-motes"'].join("\n");
  assert.deepEqual(yamlBlockErrors(block), ["line 7: indented deeper than the value on line 6"]);
});

test("yamlBlockErrors rejects duplicate top-level keys", () => {
  assert.deepEqual(yamlBlockErrors("stage: fx\nstage: previz\n"), ['duplicate top-level key "stage"']);
});

test("checkAnswerPatch reports a patch missing a required key", () => {
  const withKeys = "# S\n\n## Required patch keys\n\nstage\nbrief_hash\n";
  const answer = "```yaml\nstage: fx\n```\n";
  assert.deepEqual(checkAnswerPatch(withKeys, answer), ['patch is missing the required top-level key "brief_hash"']);
  assert.deepEqual(checkAnswerPatch(withKeys, "```yaml\nstage: fx\nbrief_hash: abc\n```\n"), []);
});

test("a re-run archives the previous round instead of overwriting it", () => {
  const dir = mkdtempSync(join(tmpdir(), "imagine-rounds-"));
  assert.deepEqual(nextRound(dir, "s", "gemini"), { round: 1, archive: 1 });
  writeFileSync(join(dir, "s.gemini.md"), "round 1");
  assert.deepEqual(nextRound(dir, "s", "gemini"), { round: 2, archive: 1 });
  writeFileSync(join(dir, "s.gemini.r1.md"), "round 1");
  assert.deepEqual(nextRound(dir, "s", "gemini"), { round: 3, archive: 2 });
});

test("every committed RED run matches its current scenario prompt", () => {
  const runs = readdirSync(join(here, "red")).filter((f) => f !== "SUMMARY.md" && !/\.r\d+\.md$/.test(f)).map((f) => f.replace(/\.md$/, ""));
  assert.equal(runs.length, 11);
  for (const f of runs) {
    const name = f.split(".")[0];
    const sha = promptSha(readFileSync(join(here, "scenarios", `${name}.md`), "utf8"));
    assert.equal(checkGreenAgainstRed(readFileSync(join(here, "red", `${f}.md`), "utf8"), sha, "x").error, undefined, f);
  }
});

test("stored GREEN answers report exactly the known defects", () => {
  const dir = join(here, "green");
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".md") && f !== "SUMMARY.md" && !/\.r\d+\.md$/.test(f))) {
    const name = f.split(".")[0];
    const scenario = readFileSync(join(here, "scenarios", `${name}.md`), "utf8");
    const errors = checkAnswerPatch(scenario, readFileSync(join(dir, f), "utf8"));
    assert.deepEqual(errors, KNOWN_DEFECTS[f] ?? [], f);
  }
});

test("every GREEN result is bound to the bundle and commit it was tested against", () => {
  const dir = join(here, "green");
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".md") && f !== "SUMMARY.md")) {
    const header = parseHeader(readFileSync(join(dir, f), "utf8"));
    assert.match(header.commit, /^[0-9a-f]{40}$/, f);
    assert.match(header.bundle, /^[0-9a-f]{64}$/, f);
    // The recorded bundle must be the bundle as it stood at the recorded commit.
    const scope = header.chat.includes("imagine-green upload attached") ? null : f.split(".")[0];
    assert.equal(header.bundle, bundleShaAt(header.commit, scope), f);
  }
});

test("the rounds of a re-run are kept, not overwritten", () => {
  const dir = join(here, "green");
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".md") && f !== "SUMMARY.md" && !/\.r\d+\.md$/.test(f))) {
    const name = f.split(".")[0];
    const header = parseHeader(readFileSync(join(dir, f), "utf8"));
    const rounds = readdirSync(dir).filter((x) => x.startsWith(`${name}.`) && /\.\w+\.r\d+\.md$/.test(x));
    const archived = rounds.map((x) => Number(x.match(/\.r(\d+)\.md$/)[1])).sort((a, b) => a - b);
    assert.equal(Number(header.round), archived.length + 1, f);
    for (const [i, n] of archived.entries()) assert.equal(n, i + 1, f);
  }
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
