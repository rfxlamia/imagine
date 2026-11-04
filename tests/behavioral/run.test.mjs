import { strict as assert } from "node:assert";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { parseRules } from "../../tools/check-traceability.mjs";
import {
  bundleMarkdown,
  bundleSha,
  bundleShaAt,
  checkAnswerPatch,
  checkGreenAgainstRed,
  checkPacked,
  committedRuns,
  CONTRACT_GROUPS,
  declaresBlocked,
  extractAnswer,
  extractSection,
  kitEnforcedRules,
  nextRound,
  nonWaivableFiles,
  packFiles,
  packIdentity,
  packMismatch,
  parseHeader,
  promptSha,
  readPackManifest,
  resultHeader,
  waiverOffers,
  writePackManifest,
  yamlBlockErrors,
} from "./run.mjs";

const here = join(fileURLToPath(import.meta.url), "..");
const repo = join(here, "..", "..");
const scenario = "# S\n\n## Targets\n\nA, B\n\n## Prompt\n\n````text\nhello\n````\n\n## Pass criteria\n\n- A: ok\n";
const red = (sha, model = "M1") => `# RED: s (gemini)\n\n- model: ${model}\n- date: 2026-11-01\n- prompt sha256: ${sha}\n\n## Answer\n\nx\n\n## Grade\n\n| Rule | Result |\n`;

// Defects that are known and recorded in the stored answers. The machine check
// must report exactly these, so a new defect fails the test and a fixed one
// has to be re-baselined on purpose.
const KNOWN_DEFECTS = {
  "fx-designer.gemini.md": [
    "yaml block 1: Nested mappings are not allowed in compact mappings at line 75, column 17",
    "yaml block 1: Implicit keys need to be on a single line at line 75, column 17",
    'patch is missing the required top-level key "brief_hash"',
  ],
  // The lint json is quoted with a shell-style escape, which yaml does not
  // accept; the report it belongs to still carries the json verbatim.
  "scene-builder.gemini.md": [
    "yaml block 1: Unexpected scalar at node end at line 20, column 154",
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
  assert.deepEqual(yamlBlockErrors(block), [
    "Nested mappings are not allowed in compact mappings at line 6, column 17",
    "Implicit keys need to be on a single line at line 6, column 17",
  ]);
});

test("yamlBlockErrors rejects duplicate top-level keys", () => {
  assert.deepEqual(yamlBlockErrors("stage: fx\nstage: previz\n"), ["Map keys must be unique at line 2, column 1"]);
});

test("yamlBlockErrors rejects malformed flow syntax", () => {
  const errors = yamlBlockErrors("inputs: [unclosed");
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Flow sequence .* end with a \]/);
  assert.deepEqual(yamlBlockErrors("inputs: {a: 1}"), []);
});

test("checkAnswerPatch reports a patch missing a required key", () => {
  const withKeys = "# S\n\n## Required patch keys\n\nstage\nbrief_hash\n";
  const answer = "```yaml\nstage: fx\n```\n";
  assert.deepEqual(checkAnswerPatch(withKeys, answer), ['patch is missing the required top-level key "brief_hash"']);
  assert.deepEqual(checkAnswerPatch(withKeys, "```yaml\nstage: fx\nbrief_hash: abc\n```\n"), []);
});

test("checkAnswerPatch reports a required key of the wrong type", () => {
  const withKeys = "# S\n\n## Required patch keys\n\nstage\nbase_story_rev\nops\n";
  const answer = "```yaml\nstage: fx\nbase_story_rev: nine\nops: []\n```\n";
  assert.deepEqual(checkAnswerPatch(withKeys, answer), ['patch key "base_story_rev" must be an integer']);
  assert.deepEqual(checkAnswerPatch(withKeys, "```yaml\nstage: fx\nbase_story_rev: 9\nops: []\n```\n"), []);
});

test("checkAnswerPatch fails closed when an applicable patch is missing", () => {
  const withKeys = "# S\n\n## Required patch keys\n\nstage\nbrief_hash\n";
  assert.deepEqual(checkAnswerPatch(withKeys, "### 1. Status\n\ndone - here is the patch.\n"), ["the answer returns no applicable patch"]);
  // A blocked report is an allowed diagnostic: the agent states it cannot
  // produce an applicable patch.
  assert.deepEqual(checkAnswerPatch(withKeys, "### 1. Status\n\nblocked - the dispatch carries no brief_hash.\n"), []);
  assert.equal(declaresBlocked("### 1. Status\n\nblocked - no brief_hash.\n"), true);
  assert.equal(declaresBlocked("### 1. Status\n\ndone with issues - provisional.\n"), false);
  assert.equal(declaresBlocked("### 1. Status\n\ndone.\n"), false);
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
  const runs = committedRuns(join(here, "red"));
  assert.equal(runs.length, 11);
  for (const f of runs) {
    const name = f.split(".")[0];
    const sha = promptSha(readFileSync(join(here, "scenarios", `${name}.md`), "utf8"));
    assert.equal(checkGreenAgainstRed(readFileSync(join(here, "red", `${f}.md`), "utf8"), sha, "x").error, undefined, f);
  }
});

test("an archived RED round is not a run of its own", () => {
  const dir = mkdtempSync(join(tmpdir(), "imagine-red-"));
  writeFileSync(join(dir, "s.gemini.md"), "round 2");
  writeFileSync(join(dir, "s.gemini.r1.md"), "round 1");
  writeFileSync(join(dir, "SUMMARY.md"), "notes");
  assert.deepEqual(committedRuns(dir), ["s.gemini"]);
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
    const scope = header.chat.includes("imagine-green upload attached")
      ? null
      : header.chat.match(/imagine-green-(.+)\.md attached/)?.[1] ?? null;
    assert.equal(header.bundle, bundleShaAt(header.commit, scope), f);
  }
});

test("a result is bound to the bundle that was packed, not to the tree at save time", () => {
  // pack(A): the bundle as it stands, pinned to its identity.
  const packed = bundleSha("imagine");
  const a = { scope: "imagine", bundleSha256: packed, commit: "unknown" };
  assert.equal(packIdentity("imagine").bundleSha256, packed);
  // The upload is still the bundle on disk: the answer may be saved against it.
  assert.equal(checkPacked(a, packed, "imagine"), null);
  // The files change to B before the answer is saved.
  assert.match(checkPacked(a, "b".repeat(64), "imagine"), /changed since it was packed/);
  // A pack whose commit does not carry the bytes is refused too.
  assert.match(checkPacked({ ...a, commit: "0".repeat(40) }, packed, "imagine"), /not what commit/);
});

test("the pack manifest records the bundle identity a result is checked against", () => {
  const dir = mkdtempSync(join(tmpdir(), "imagine-manifest-"));
  const identity = { scope: "demo", bundleSha256: "a".repeat(64), commit: "b".repeat(40), files: [], packedAt: "2026-11-04T00:00:00.000Z" };
  writePackManifest(identity, dir);
  assert.deepEqual(readPackManifest("demo", dir), identity);
  assert.equal(readPackManifest("other", dir), null);
  assert.match(packMismatch(null, "demo", dir), /no packed bundle recorded/);
});

test("a GREEN header carries the bundle and commit of the pack, never a recomputed value", () => {
  const identity = { scope: "demo", bundleSha256: "a".repeat(64), commit: "b".repeat(40) };
  const head = resultHeader({ phase: "green", name: "demo", slug: "gemini", label: "M", sha: "s", round: 2, identity, date: "2026-11-04" });
  assert.match(head, /- bundle sha256: a{64}/);
  assert.match(head, /- tested commit: b{40}/);
  assert.match(head, /imagine-green-demo\.md attached/);
  // A RED run has no upload, so it carries no bundle.
  const redHead = resultHeader({ phase: "red", name: "demo", slug: "gemini", label: "M", sha: "s", round: 1, identity: null, date: "2026-11-04" });
  assert.doesNotMatch(redHead, /bundle sha256/);
  assert.doesNotMatch(redHead, /tested commit/);
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

test("a contract group packs the skills that read each other", () => {
  const files = packFiles("router");
  for (const s of CONTRACT_GROUPS.router) assert.ok(files.includes(`skills/${s}/SKILL.md`), s);
  assert.ok(files.includes(".claude-plugin/plugin.json"));
  assert.ok(files.every((f) => f.startsWith("skills/") || f === ".claude-plugin/plugin.json"), files.join(","));
});

test("every non-waivable enumeration and the rule registry agree", () => {
  const registry = parseRules(readFileSync(join(repo, "docs/contracts/rules.yaml"), "utf8"))
    .find((r) => r.id === "HARD-NON-WAIVABLE");
  const files = nonWaivableFiles();
  assert.ok(files.length >= 6, `only ${files.length} files carry the non-waivable rule`);
  // The text wraps, so the phrases are matched across the whole file.
  const flat = (s) => s.replace(/\s+/g, " ");
  for (const item of ["raster quality floor", "story validator"]) {
    assert.match(flat(registry.text), new RegExp(item, "i"), `registry: ${item}`);
    for (const f of files) assert.match(flat(f.text), new RegExp(item, "i"), `${f.path}: ${item}`);
  }
});

test("no instruction offers a waiver for a rule the kit decides", () => {
  const enforced = kitEnforcedRules();
  assert.ok(enforced.includes("HARD-STORY-UNIT-ONCE"), "the kit decides the story validators");
  for (const f of nonWaivableFiles()) {
    for (const offer of waiverOffers(f.text, enforced)) {
      assert.fail(`${f.path} offers ${offer.rule} as waivable: ${offer.sentence}`);
    }
  }
});
