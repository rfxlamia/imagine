import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  TOOL_ACTIONS,
  MODEL_TIERS,
  POLICY,
  buildManifest,
  serialize,
} from "./agent-manifest.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = realpathSync(join(here, ".."));
const scriptPath = join(here, "agent-manifest.mjs");

test("TOOL_ACTIONS table matches spec and is frozen", () => {
  assert.equal(Object.isFrozen(TOOL_ACTIONS), true);
  assert.deepEqual(TOOL_ACTIONS, {
    Read: "read",
    Glob: "search",
    Grep: "search",
    Write: "write",
    Edit: "write",
    MultiEdit: "write",
    NotebookEdit: "write",
    Bash: "run-process",
  });
});

test("MODEL_TIERS table matches spec and is frozen", () => {
  assert.equal(Object.isFrozen(MODEL_TIERS), true);
  assert.deepEqual(MODEL_TIERS, {
    haiku: "small",
    sonnet: "standard",
    opus: "large",
  });
});

test("POLICY table contains all agents and matches spec", () => {
  assert.equal(Object.isFrozen(POLICY), true);
  const expectedNames = [
    "storyboard-artist",
    "previz-designer",
    "fx-designer",
    "continuity-reviewer",
    "scene-builder",
  ];
  assert.deepEqual(Object.keys(POLICY).sort(), expectedNames.sort());

  for (const name of ["storyboard-artist", "previz-designer", "fx-designer"]) {
    assert.deepEqual(POLICY[name], {
      writes: "none",
      requires_enforced_isolation: false,
      inline_fallback: "allowed-patch-only",
      output: "patch",
    });
  }

  assert.deepEqual(POLICY["continuity-reviewer"], {
    writes: "none",
    requires_enforced_isolation: false,
    inline_fallback: "blocked",
    output: "findings",
  });

  assert.deepEqual(POLICY["scene-builder"], {
    writes: "shadow-only",
    requires_enforced_isolation: true,
    inline_fallback: "blocked",
    output: "proposal",
  });
});

test("buildManifest on repo root returns valid structure", () => {
  const manifest = buildManifest(repoRoot);
  assert.equal(manifest.manifest_version, 1);
  assert.equal(manifest.generated_by, "tools/agent-manifest.mjs");
  assert.equal(manifest.source_dir, "agents");
  assert.equal(Array.isArray(manifest.agents), true);
  assert.equal(manifest.agents.length, 5);

  const names = manifest.agents.map((a) => a.name);
  const sortedNames = [...names].sort();
  assert.deepEqual(names, sortedNames);
});

test("scene-builder has writes shadow-only, requires_enforced_isolation true, and inline_fallback blocked", () => {
  const manifest = buildManifest(repoRoot);
  const sb = manifest.agents.find((a) => a.name === "scene-builder");
  assert.ok(sb, "scene-builder agent must exist");
  assert.equal(sb.portable.writes, "shadow-only");
  assert.equal(sb.portable.requires_enforced_isolation, true);
  assert.equal(sb.portable.inline_fallback, "blocked");
  assert.equal(sb.portable.output, "proposal");
  assert.deepEqual(sb.portable.actions, ["read", "search", "write", "run-process"]);
});

test("continuity-reviewer has output findings and inline_fallback blocked", () => {
  const manifest = buildManifest(repoRoot);
  const cr = manifest.agents.find((a) => a.name === "continuity-reviewer");
  assert.ok(cr, "continuity-reviewer agent must exist");
  assert.equal(cr.portable.output, "findings");
  assert.equal(cr.portable.inline_fallback, "blocked");
  assert.equal(cr.portable.writes, "none");
  assert.equal(cr.portable.requires_enforced_isolation, false);
  assert.deepEqual(cr.portable.actions, ["read", "search"]);
});

test("three planning agents have actions ['read', 'search'] and inline_fallback allowed-patch-only", () => {
  const manifest = buildManifest(repoRoot);
  const planningAgents = ["storyboard-artist", "previz-designer", "fx-designer"];
  for (const name of planningAgents) {
    const ag = manifest.agents.find((a) => a.name === name);
    assert.ok(ag, `agent ${name} must exist`);
    assert.deepEqual(ag.portable.actions, ["read", "search"]);
    assert.equal(ag.portable.inline_fallback, "allowed-patch-only");
    assert.equal(ag.portable.output, "patch");
    assert.equal(ag.portable.writes, "none");
    assert.equal(ag.portable.requires_enforced_isolation, false);
  }
});

test("placeholder template is excluded", () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), "imagine-agent-placeholder-")));
  try {
    const agentsDir = join(tmp, "agents");
    mkdirSync(agentsDir, { recursive: true });
    // Write valid agent and placeholder
    writeFileSync(
      join(agentsDir, "storyboard-artist.md"),
      readFileSync(join(repoRoot, "agents", "storyboard-artist.md"))
    );
    writeFileSync(
      join(agentsDir, "placeholder.md"),
      "---\nname: placeholder\ndescription: Template\ntools: Read\nmodel: haiku\n---\n# Placeholder\n"
    );

    const manifest = buildManifest(tmp);
    const names = manifest.agents.map((a) => a.name);
    assert.deepEqual(names, ["storyboard-artist"]);
    assert.equal(names.includes("placeholder"), false);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("committed manifest is not stale: buildManifest on repo root serialises equal to file", () => {
  const manifestPath = join(repoRoot, "docs", "contracts", "agents.manifest.json");
  const committedText = readFileSync(manifestPath, "utf8");
  const manifest = buildManifest(repoRoot);
  const serialized = serialize(manifest);
  assert.equal(serialized, committedText);
});

test("validation errors throw on malformed fixtures in temp tree", () => {
  function createFixture(fileName, content) {
    const tmp = realpathSync(mkdtempSync(join(tmpdir(), "imagine-agent-val-")));
    const agentsDir = join(tmp, "agents");
    mkdirSync(agentsDir, { recursive: true });
    writeFileSync(join(agentsDir, fileName), content);
    return tmp;
  }

  // 1. Missing frontmatter
  {
    const tmp = createFixture("storyboard-artist.md", "# No frontmatter at all\nJust text.\n");
    try {
      assert.throws(() => buildManifest(tmp), /frontmatter/i);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }

  // 2. Unparsable frontmatter YAML
  {
    const tmp = createFixture("storyboard-artist.md", "---\nname: [unclosed\n---\n# Content\n");
    try {
      assert.throws(() => buildManifest(tmp), /frontmatter/i);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }

  // 3. Missing name
  {
    const tmp = createFixture("storyboard-artist.md", "---\ndescription: desc\ntools: Read\nmodel: sonnet\n---\n# Content\n");
    try {
      assert.throws(() => buildManifest(tmp), /name/i);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }

  // 4. Name differs from file basename
  {
    const tmp = createFixture("storyboard-artist.md", "---\nname: wrong-name\ndescription: desc\ntools: Read\nmodel: sonnet\n---\n# Content\n");
    try {
      assert.throws(() => buildManifest(tmp), /name/i);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }

  // 5. Tool not in TOOL_ACTIONS
  {
    const tmp = createFixture("storyboard-artist.md", "---\nname: storyboard-artist\ndescription: desc\ntools: Read, UnknownTool\nmodel: sonnet\n---\n# Content\n");
    try {
      assert.throws(() => buildManifest(tmp), /TOOL_ACTIONS|tool/i);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }

  // 6. Model empty or not in MODEL_TIERS
  {
    const tmp = createFixture("storyboard-artist.md", "---\nname: storyboard-artist\ndescription: desc\ntools: Read\nmodel: gpt-4\n---\n# Content\n");
    try {
      assert.throws(() => buildManifest(tmp), /MODEL_TIERS|model/i);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }

  // 7. Agent has no POLICY entry
  {
    const tmp = createFixture("unregistered-agent.md", "---\nname: unregistered-agent\ndescription: desc\ntools: Read\nmodel: sonnet\n---\n# Content\n");
    try {
      assert.throws(() => buildManifest(tmp), /POLICY|policy/i);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }

  // 8. Actions include write or run-process, but policy has writes: "none"
  {
    const tmp = createFixture("storyboard-artist.md", "---\nname: storyboard-artist\ndescription: desc\ntools: Read, Write\nmodel: sonnet\n---\n# Content\n");
    try {
      assert.throws(() => buildManifest(tmp), /write/i);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }

  {
    const tmp = createFixture("storyboard-artist.md", "---\nname: storyboard-artist\ndescription: desc\ntools: Read, Bash\nmodel: sonnet\n---\n# Content\n");
    try {
      assert.throws(() => buildManifest(tmp), /run-process|write/i);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }
});

test("CLI handles usage, --write, and --check in a temp tree", () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), "imagine-cli-test-")));
  try {
    const toolsDir = join(tmp, "tools");
    const docsDir = join(tmp, "docs", "contracts");
    const agentsDir = join(tmp, "agents");
    mkdirSync(toolsDir, { recursive: true });
    mkdirSync(docsDir, { recursive: true });
    mkdirSync(agentsDir, { recursive: true });
    symlinkSync(join(repoRoot, "node_modules"), join(tmp, "node_modules"), "dir");

    // Copy agent files
    for (const name of [
      "storyboard-artist.md",
      "previz-designer.md",
      "fx-designer.md",
      "continuity-reviewer.md",
      "scene-builder.md",
    ]) {
      writeFileSync(
        join(agentsDir, name),
        readFileSync(join(repoRoot, "agents", name))
      );
    }

    // Copy script
    cpSync(scriptPath, join(toolsDir, "agent-manifest.mjs"));

    const toolInTmp = join(toolsDir, "agent-manifest.mjs");

    // 1. Unknown or missing flag exits 2 with usage
    const rNoArgs = spawnSync(process.execPath, [toolInTmp], { encoding: "utf8" });
    assert.equal(rNoArgs.status, 2);
    assert.match(rNoArgs.stderr, /Usage:/);

    const rBadFlag = spawnSync(process.execPath, [toolInTmp, "--bogus"], { encoding: "utf8" });
    assert.equal(rBadFlag.status, 2);
    assert.match(rBadFlag.stderr, /Usage:/);

    // 2. --check on missing manifest exits 1 with stale message
    const rCheckMissing = spawnSync(process.execPath, [toolInTmp, "--check"], { encoding: "utf8" });
    assert.equal(rCheckMissing.status, 1);
    assert.match(rCheckMissing.stderr, /agents\.manifest\.json is stale; run node tools\/agent-manifest\.mjs --write/);

    // 3. --write creates the manifest
    const rWrite = spawnSync(process.execPath, [toolInTmp, "--write"], { encoding: "utf8" });
    assert.equal(rWrite.status, 0);
    const generated = readFileSync(join(docsDir, "agents.manifest.json"), "utf8");
    assert.ok(generated.length > 0);

    // 4. --check now exits 0
    const rCheckOk = spawnSync(process.execPath, [toolInTmp, "--check"], { encoding: "utf8" });
    assert.equal(rCheckOk.status, 0);

    // 5. --check exits 1 after the temp tree's agent file changes
    writeFileSync(
      join(agentsDir, "storyboard-artist.md"),
      readFileSync(join(agentsDir, "storyboard-artist.md"), "utf8") + "\n<!-- modification -->\n"
    );
    const rCheckModified = spawnSync(process.execPath, [toolInTmp, "--check"], { encoding: "utf8" });
    assert.equal(rCheckModified.status, 1);
    assert.match(rCheckModified.stderr, /agents\.manifest\.json is stale; run node tools\/agent-manifest\.mjs --write/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
