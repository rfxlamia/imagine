import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBrief, checkTarget, excerpt, loadRules, parseBundle, parseFrontmatter } from "./gate.mjs";
import { ORDER, TARGETS } from "./allocation.mjs";
import { loadPatterns } from "../check-forbidden-names.mjs";

const rules = loadRules();
const patterns = loadPatterns();
const byId = new Map(rules.map((r) => [r.id, r]));

// A minimal file that satisfies every mechanical check for a target.
function passing(name) {
  const t = TARGETS[name];
  const fmName = t.kind === "skill" ? t.path.split("/").pop() : t.path.split("/").pop().replace(/\.md$/, "");
  const fm = ["---", `name: ${fmName}`, "description: Use when testing the gate.", ...(t.kind === "agent" ? [`tools: ${t.tools.allowed.join(", ")}`, "model: sonnet"] : []), "---", ""];
  const body = [
    ...t.cite.map((id) => `- Follow this rule in prose here. <!-- rule:${id} -->`),
    ...t.literals.map((l) => `Literal: ${l}`),
  ];
  const path = t.kind === "skill" ? `${t.path}/SKILL.md` : t.path;
  return [{ path, text: [...fm, ...body].join("\n") + "\n" }];
}

test("allocation: every cited id exists, is active and instruction-covered", () => {
  for (const [name, t] of Object.entries(TARGETS)) {
    assert.equal(new Set(t.cite).size, t.cite.length, `${name} has duplicate ids`);
    for (const id of t.cite) {
      const r = byId.get(id);
      assert.ok(r, `${name}: unknown ${id}`);
      assert.notEqual(r.status, "deferred", `${name}: ${id} deferred`);
      assert.notEqual(r.cover ?? "instructions", "tests", `${name}: ${id} test-only`);
    }
  }
});

test("allocation: union covers every active HARD and GATE rule needing a marker", () => {
  const cited = new Set(Object.values(TARGETS).flatMap((t) => t.cite));
  const need = rules.filter((r) => r.status !== "deferred" && (r.cover ?? "instructions") !== "tests" && /^(HARD|GATE)-/.test(r.id));
  assert.deepEqual(need.filter((r) => !cited.has(r.id)).map((r) => r.id), []);
});

test("allocation: union covers every active instruction rule", () => {
  const cited = new Set(Object.values(TARGETS).flatMap((t) => t.cite));
  const need = rules.filter((r) => r.status !== "deferred" && (r.cover ?? "instructions") !== "tests");
  assert.deepEqual(need.filter((r) => !cited.has(r.id)).map((r) => r.id), []);
});

test("allocation: ORDER lists each target once", () => {
  assert.deepEqual([...ORDER].sort(), Object.keys(TARGETS).sort());
});

test("checkTarget: synthetic passing file passes for every target", () => {
  for (const name of ORDER) assert.deepEqual(checkTarget(name, passing(name), rules, patterns), [], name);
});

test("checkTarget: missing marker and literal", () => {
  const [f] = passing("fx-designer");
  const text = f.text.replace("<!-- rule:HARD-FX-TOOL-ENUM -->", "").replace("Literal: unsupported", "");
  const p = checkTarget("fx-designer", [{ ...f, text }], rules, patterns);
  assert.ok(p.includes("missing marker <!-- rule:HARD-FX-TOOL-ENUM -->"));
  assert.ok(p.includes("missing literal: unsupported"));
});

test("checkTarget: unknown, deferred and test-only markers fail", () => {
  const [f] = passing("fx-designer");
  const text = f.text + "Ghost. <!-- rule:PROC-GHOST -->\nOld. <!-- rule:CAP-FALLBACK-LIST -->\nTest. <!-- rule:AC-01 -->\n";
  const p = checkTarget("fx-designer", [{ ...f, text }], rules, patterns).join("\n");
  assert.match(p, /unknown rule PROC-GHOST/);
  const deferred = rules.find((r) => r.status === "deferred" && (r.cover ?? "instructions") !== "tests");
  if (deferred) {
    const p2 = checkTarget("fx-designer", [{ ...f, text: f.text + `x <!-- rule:${deferred.id} -->\n` }], rules, patterns).join("\n");
    assert.match(p2, /is deferred/);
  }
  const testOnly = rules.find((r) => r.status !== "deferred" && r.cover === "tests");
  const p3 = checkTarget("fx-designer", [{ ...f, text: f.text + `x <!-- rule:${testOnly.id} -->\n` }], rules, patterns).join("\n");
  assert.match(p3, /test-only/);
});

test("checkTarget: marker dumps are rejected", () => {
  const [f] = passing("fx-designer");
  const dump = "<!-- rule:PROC-STYLE-FIRST --> <!-- rule:ADV-BANNED -->\n<!-- rule:HARD-FX-TOOL-ENUM -->\n<!-- rule:HARD-FX-WEBGL-FALLBACK -->\n";
  const p = checkTarget("fx-designer", [{ ...f, text: f.text + dump }], rules, patterns).join("\n");
  assert.match(p, /several markers on a line with no prose/);
  assert.match(p, /stacked marker-only lines/);
});

test("checkTarget: agent frontmatter name, model and tools", () => {
  const [f] = passing("storyboard-artist");
  const text = f.text.replace("name: storyboard-artist", "name: storyboarder").replace("model: sonnet", "model: haiku").replace("tools: Read, Glob, Grep", "tools: Read, Write, Glob");
  const p = checkTarget("storyboard-artist", [{ ...f, text }], rules, patterns).join("\n");
  assert.match(p, /name must be storyboard-artist/);
  assert.match(p, /model must be sonnet/);
  assert.match(p, /tool Write not allowed/);
});

test("checkTarget: scene-builder keeps its exact name and rejects env-prefixed hyperframes", () => {
  const [f] = passing("scene-builder");
  const p = checkTarget("scene-builder", [{ ...f, text: f.text + "Run HYPERFRAMES_NO_TELEMETRY=1 npx hyperframes@0.8.223 lint /x\n" }], rules, patterns).join("\n");
  assert.match(p, /hook denies env-prefixed Bash/);
});

test("checkTarget: cut commands, unpinned hyperframes, section sign", () => {
  const [f] = passing("imagine");
  const text = f.text + "Run imagine-kit brief previz first.\nThen npx hyperframes check.\nSee § 6.2.\nAlso imagine-kit guard begin.\n";
  const p = checkTarget("imagine", [{ ...f, text }], rules, patterns).join("\n");
  assert.match(p, /cut or deferred command "imagine-kit brief"/);
  assert.match(p, /cut or deferred command "imagine-kit guard"/);
  assert.match(p, /unpinned hyperframes/);
  assert.match(p, /section-sign/);
});

test("checkTarget: replacement character from encoding damage fails", () => {
  const [f] = passing("imagine");
  const p = checkTarget("imagine", [{ ...f, text: f.text + "### 4.1 G1 \ufffd script units\n" }], rules, patterns).join("\n");
  assert.match(p, /U\+FFFD/);
});

test("checkTarget: kept commands are not flagged as cut", () => {
  const [f] = passing("imagine");
  const text = f.text + "imagine-kit validate story; imagine-kit patch apply; imagine-kit stage-shot s01; imagine-kit status\n";
  assert.deepEqual(checkTarget("imagine", [{ ...f, text }], rules, patterns), []);
});

test("checkTarget: naming a cut command without the kit prefix passes", () => {
  const [f] = passing("imagine");
  const text = f.text + "There is no guard command and no brief command; hash the protected files yourself.\n";
  assert.deepEqual(checkTarget("imagine", [{ ...f, text }], rules, patterns), []);
});

test("checkTarget: skill paths, size and named references", () => {
  const [f] = passing("imagine-edit");
  const text = f.text + "Read references/edit-protocol.md before stage 9.\n";
  const long = { path: "skills/imagine-edit/references/big.md", text: "x\n".repeat(600) };
  const stray = { path: "skills/imagine/SKILL.md", text: "x\n" };
  const p = checkTarget("imagine-edit", [{ ...f, text }, long, stray], rules, patterns).join("\n");
  assert.match(p, /names references\/edit-protocol.md but the bundle has no/);
  assert.match(p, /big.md: 601 lines/);
  assert.match(p, /skills\/imagine\/SKILL.md: outside target/);
});

test("checkTarget: waiver field keys are required in imagine and imagine-deliver", () => {
  for (const n of ["imagine", "imagine-deliver"]) {
    const [f] = passing(n);
    const p = checkTarget(n, [{ ...f, text: f.text.replace("Literal: - asked:", "") }], rules, patterns);
    assert.ok(p.includes("missing literal: - asked:"), n);
  }
});

test("checkTarget: another skill's reference is checked on disk, not in the bundle", () => {
  const [f] = passing("imagine-canon");
  const text = f.text + "Read `R/skills/imagine/references/voice-cloning.md` in full.\nAlso skills/imagine/references/ghost.md.\n";
  const exists = (rel) => rel === "skills/imagine/references/voice-cloning.md";
  const p = checkTarget("imagine-canon", [{ ...f, text }], rules, patterns, { exists });
  assert.deepEqual(p, ["skills/imagine-canon/SKILL.md: names skills/imagine/references/ghost.md but that file does not exist"]);
});

test("checkTarget: own skill path prefix still requires the bundle file", () => {
  const [f] = passing("imagine-canon");
  const text = f.text + "See skills/imagine-canon/references/casting.md.\n";
  const p = checkTarget("imagine-canon", [{ ...f, text }], rules, patterns, { exists: () => true });
  assert.ok(p.some((x) => /names references\/casting.md but the bundle has no/.test(x)), p.join());
});

test("checkTarget: skill frontmatter name must match its directory", () => {
  const [f] = passing("imagine-plan");
  const p = checkTarget("imagine-plan", [{ ...f, text: f.text.replace("name: imagine-plan", "name: plan") }], rules, patterns).join("\n");
  assert.match(p, /name must be imagine-plan/);
});

test("parseBundle: blocks, outside text ignored, errors", () => {
  const ok = parseBundle("Here you go:\n=== FILE: agents/fx-designer.md ===\n---\nname: x\n---\nbody\n=== END FILE ===\nthanks\n");
  assert.deepEqual(ok.problems, []);
  assert.equal(ok.files[0].path, "agents/fx-designer.md");
  assert.equal(ok.files[0].text, "---\nname: x\n---\nbody\n");
  assert.match(parseBundle("=== FILE: a.md ===\nx\n").problems.join(), /missing === END FILE ===/);
  assert.match(parseBundle("just prose").problems.join(), /no === FILE/);
  assert.match(parseBundle("=== FILE: a.md ===\n=== END FILE ===\n=== FILE: a.md ===\n=== END FILE ===\n").problems.join(), /duplicate/);
});

test("parseBundle: tolerates backticks and spaces around delimiters", () => {
  const r = parseBundle("  === FILE: `agents/fx-designer.md` ===  \nbody\n`=== END FILE ===`\n");
  assert.deepEqual(r.problems, []);
  assert.equal(r.files[0].path, "agents/fx-designer.md");
  assert.equal(r.files[0].text, "body\n");
});

test("parseFrontmatter: keys and quotes", () => {
  assert.deepEqual(parseFrontmatter('---\nname: a\ndescription: "b c"\n---\nx'), { name: "a", description: "b c" });
  assert.equal(parseFrontmatter("no frontmatter"), null);
});

test("excerpt: section bounds", () => {
  const doc = "## 3. Sub\nintro\n### 3.1 A\na\n### 3.2 B\nb\n## 4. Next\nn\n";
  assert.equal(excerpt(doc, "3.1"), "### 3.1 A\na");
  assert.equal(excerpt(doc, "3"), "## 3. Sub\nintro\n### 3.1 A\na\n### 3.2 B\nb");
  assert.equal(excerpt(doc, "9.9"), null);
});

test("buildBrief: carries every cited rule, literal and the bundle format", () => {
  for (const name of ORDER) {
    const b = buildBrief(name, rules);
    for (const id of TARGETS[name].cite) assert.ok(b.includes(`- ${id} (`), `${name} brief misses ${id}`);
    for (const l of TARGETS[name].literals) assert.ok(b.includes(l), `${name} brief misses ${l}`);
    assert.ok(b.includes("=== END FILE ==="));
    assert.ok(!b.includes("§"));
  }
  for (const n of ["imagine", "imagine-deliver"]) {
    const b = buildBrief(n, rules);
    assert.match(b, /## Waivers/);
    assert.match(b, /proposed \| active \| revoked \| invalid/);
  }
  assert.doesNotMatch(buildBrief("imagine-edit", rules), /## Waivers/);
});
