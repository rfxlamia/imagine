import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import YAML from "yaml";
import {
  TOOL_ACTIONS,
  POLICY,
  buildManifest,
  parseFrontmatter,
} from "./agent-manifest.mjs";
import {
  AGY_TOOL_MAP,
  VERIFIED_AGY_TOOLS,
  mapClaudeToolToAgy,
} from "./agent-antigravity.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = realpathSync(join(here, ".."));
const scriptPath = join(here, "agent-antigravity.mjs");

test("for each agent in manifest, generated frontmatter parses and matches requirements, and body is identical", () => {
  const manifest = buildManifest(repoRoot);
  assert.equal(manifest.agents.length, 5);

  for (const agent of manifest.agents) {
    const srcPath = join(repoRoot, "agents", `${agent.name}.md`);
    const genPath = join(repoRoot, "agy-agents", `${agent.name}.md`);
    assert.ok(existsSync(genPath), `Generated file ${genPath} must exist`);

    const srcText = readFileSync(srcPath, "utf8");
    const genText = readFileSync(genPath, "utf8");

    const srcFm = parseFrontmatter(srcText, srcPath);
    const genFm = parseFrontmatter(genText, genPath);

    assert.equal(genFm.name, agent.name);
    assert.equal(genFm.description, srcFm.description);
    assert.ok(Array.isArray(genFm.tools), "tools must be a YAML list");
    assert.ok(genFm.tools.length > 0, "tools must not be empty");
    for (const tool of genFm.tools) {
      assert.ok(
        VERIFIED_AGY_TOOLS.includes(tool),
        `Tool ${tool} must be in VERIFIED_AGY_TOOLS`
      );
    }
    assert.equal(genFm.subagent, true);
    assert.equal(genFm.mainAgent, false);
    assert.equal(genFm.model, "inherit");

    // Same regex match length as parseFrontmatter
    const srcMatch = srcText.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    const genMatch = genText.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    assert.ok(srcMatch, "srcMatch must exist");
    assert.ok(genMatch, "genMatch must exist");

    const srcBody = srcText.slice(srcMatch[0].length);
    const genBody = genText.slice(genMatch[0].length);
    assert.equal(genBody, srcBody, `Body of ${agent.name} must be identical to source`);
  }
});

test("scene-builder is generated with expected verified tools", () => {
  const genPath = join(repoRoot, "agy-agents", "scene-builder.md");
  assert.equal(existsSync(genPath), true, "agy-agents/scene-builder.md must exist");

  const manifest = buildManifest(repoRoot);
  const sb = manifest.agents.find((a) => a.name === "scene-builder");
  assert.ok(sb, "scene-builder must exist in manifest");
  assert.equal(POLICY[sb.name].requires_enforced_isolation, true);

  const genText = readFileSync(genPath, "utf8");
  const genFm = parseFrontmatter(genText, genPath);

  const derivedTools = sb.claude.tools.map(mapClaudeToolToAgy);
  assert.deepEqual(derivedTools, [
    "view_file",
    "find_by_name",
    "grep_search",
    "write_to_file",
    "replace_file_content",
    "run_command",
  ]);
  assert.deepEqual(genFm.tools, derivedTools);
  for (const tool of genFm.tools) {
    assert.ok(
      VERIFIED_AGY_TOOLS.includes(tool),
      `Tool ${tool} must be in VERIFIED_AGY_TOOLS`
    );
  }
  assert.equal(genFm.subagent, true);
  assert.equal(genFm.mainAgent, false);
  assert.equal(genFm.model, "inherit");

  for (const agent of manifest.agents) {
    const agyExists = existsSync(join(repoRoot, "agy-agents", `${agent.name}.md`));
    assert.equal(agyExists, true, `Agent ${agent.name} must be generated`);
  }
});

test("agy tool map keys are a subset of TOOL_ACTIONS and every source tool used by all 5 emitted agents is mapped", () => {
  for (const key of Object.keys(AGY_TOOL_MAP)) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(TOOL_ACTIONS, key),
      `Key ${key} in AGY_TOOL_MAP must be in TOOL_ACTIONS`
    );
  }

  const manifest = buildManifest(repoRoot);
  assert.equal(manifest.agents.length, 5);
  for (const agent of manifest.agents) {
    for (const tool of agent.claude.tools) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(AGY_TOOL_MAP, tool),
        `Tool ${tool} from ${agent.name} must be mapped in AGY_TOOL_MAP`
      );
    }
  }
});

test("unmapped tool throws from mapping function with clear error message", () => {
  const unmappedTools = Object.keys(TOOL_ACTIONS).filter(
    (t) => !Object.prototype.hasOwnProperty.call(AGY_TOOL_MAP, t)
  );
  assert.ok(unmappedTools.includes("MultiEdit"));
  assert.ok(unmappedTools.includes("NotebookEdit"));

  for (const tool of unmappedTools) {
    assert.throws(
      () => mapClaudeToolToAgy(tool),
      (err) => {
        assert.match(err.message, new RegExp(`No Antigravity tool mapping for Claude tool: ${tool}`));
        return true;
      }
    );
  }
});

test("root agents.json deep-equals expected entry", () => {
  const agentsJsonPath = join(repoRoot, "agents.json");
  assert.ok(existsSync(agentsJsonPath), "agents.json must exist");
  const content = JSON.parse(readFileSync(agentsJsonPath, "utf8"));
  assert.deepEqual(content, { entries: [{ path: "agy-agents" }] });
});

test("CLI exits 2 on missing or unknown arguments", () => {
  const rNoArgs = spawnSync(process.execPath, [scriptPath], { encoding: "utf8" });
  assert.equal(rNoArgs.status, 2);
  assert.match(rNoArgs.stderr, /Usage:/);

  const rBadArg = spawnSync(process.execPath, [scriptPath, "--unknown"], { encoding: "utf8" });
  assert.equal(rBadArg.status, 2);
  assert.match(rBadArg.stderr, /Usage:/);
});

test("--check passes on real repo root", () => {
  const res = spawnSync(process.execPath, [scriptPath, "--check"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.equal(res.status, 0, `--check failed: ${res.stderr || res.stdout}`);
});

test("--check drift detection in a temporary copy", () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), "imagine-agy-drift-")));
  try {
    const agentsDir = join(tmp, "agents");
    const agyAgentsDir = join(tmp, "agy-agents");
    mkdirSync(agentsDir, { recursive: true });
    mkdirSync(agyAgentsDir, { recursive: true });

    for (const file of [
      "storyboard-artist.md",
      "previz-designer.md",
      "fx-designer.md",
      "continuity-reviewer.md",
      "scene-builder.md",
    ]) {
      writeFileSync(join(agentsDir, file), readFileSync(join(repoRoot, "agents", file)));
      const agyPath = join(repoRoot, "agy-agents", file);
      if (existsSync(agyPath)) {
        writeFileSync(join(agyAgentsDir, file), readFileSync(agyPath));
      }
    }
    writeFileSync(join(tmp, "agents.json"), readFileSync(join(repoRoot, "agents.json")));

    const runCheck = () =>
      spawnSync(process.execPath, [scriptPath, "--check"], {
        cwd: tmp,
        env: { ...process.env, IMAGINE_REPO_ROOT: tmp },
        encoding: "utf8",
      });

    // Initial check: in sync -> exit 0
    let res = runCheck();
    assert.equal(res.status, 0, `Initial sync check failed: ${res.stderr || res.stdout}`);

    // (a) generated body changed
    const targetFile = join(agyAgentsDir, "storyboard-artist.md");
    const originalContent = readFileSync(targetFile, "utf8");
    writeFileSync(targetFile, originalContent + "\n<!-- drifted body -->\n");
    res = runCheck();
    assert.notEqual(res.status, 0, "Drift (a): modified body should fail check");
    writeFileSync(targetFile, originalContent);

    // (b) generated tools list changed
    const fm = parseFrontmatter(originalContent, targetFile);
    const match = originalContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    const body = originalContent.slice(match[0].length);
    const modifiedFm = { ...fm, tools: ["view_file"] };
    writeFileSync(targetFile, `---\n${YAML.stringify(modifiedFm)}---\n${body}`);
    res = runCheck();
    assert.notEqual(res.status, 0, "Drift (b): modified tools list should fail check");
    writeFileSync(targetFile, originalContent);

    // (c) generated file is missing
    rmSync(targetFile);
    res = runCheck();
    assert.notEqual(res.status, 0, "Drift (c): missing file should fail check");
    writeFileSync(targetFile, originalContent);

    // (d) extra stale file exists in agy-agents/
    const staleFile = join(agyAgentsDir, "stale-agent.md");
    writeFileSync(staleFile, originalContent);
    res = runCheck();
    assert.notEqual(res.status, 0, "Drift (d): extra stale file should fail check");
    rmSync(staleFile);

    // (e1) agents.json is missing
    const agentsJsonPath = join(tmp, "agents.json");
    const originalAgentsJson = readFileSync(agentsJsonPath, "utf8");
    rmSync(agentsJsonPath);
    res = runCheck();
    assert.notEqual(res.status, 0, "Drift (e1): missing agents.json should fail check");
    writeFileSync(agentsJsonPath, originalAgentsJson);

    // (e2) agents.json is altered
    writeFileSync(agentsJsonPath, JSON.stringify({ entries: [] }, null, 2) + "\n");
    res = runCheck();
    assert.notEqual(res.status, 0, "Drift (e2): altered agents.json should fail check");
    writeFileSync(agentsJsonPath, originalAgentsJson);

    // Back in sync
    res = runCheck();
    assert.equal(res.status, 0, "Restored sync should pass check");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
