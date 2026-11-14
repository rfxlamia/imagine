#!/usr/bin/env node
import { mkdtempSync, readFileSync, writeFileSync, realpathSync, statSync, symlinkSync, rmSync, existsSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import YAML from "yaml";
import { buildManifest } from "../tools/agent-manifest.mjs";
import { runTool } from "../packages/imagine-kit/src/tools.mjs";
import { loadValidator } from "../packages/imagine-kit/src/schemas.mjs";
import { safePath } from "../packages/imagine-kit/src/img/commit.mjs";
import { baselinePath, canonicalDigest, diffSnapshot, snapshotProtected } from "../packages/imagine-kit/src/edit/guard.mjs";

export const CODEX_VERSION = "0.169.0";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STAGES = { "storyboard-artist": "storyboard", "previz-designer": "previz", "fx-designer": "fx", "continuity-reviewer": null, "scene-builder": null };
const INVENTORY = "apply_patch, clock__curr_time, exec_command, list_mcp_resource_templates, list_mcp_resources, read_mcp_resource, view_image, web__run, write_stdin";
const ADAPTER = `Codex read-only transport: implement canonical Read/Glob/Grep actions with read/search-only cat and rg through exec_command. This permits source inspection, not general execution. Never write files, apply patches, approve gates, delegate, use web/MCP/resources or generate media. First enumerate ALL_TOOLS through functions.exec. Stop with status: blocked if enumeration is unavailable or any name is outside this tested inventory: ${INVENTORY}. Inventory presence is not authorization to call a tool. Return only the canonical role's final proposal/findings. Patch roles return one YAML mapping without Markdown fences or prose. Missing inputs require status: blocked, never fabricated values.\n\n`;
const SCENE_ADAPTER = `Codex scene transport: canonical Read/Glob/Grep map to read/search-only cat and rg through exec_command; Write/Edit map to apply_patch, confined to the assigned absolute shadow_root. Canonical Bash maps only to the permitted pinned HyperFrames commands through exec_command. No other execution, web/MCP/resources, delegation, gates, kit commands or media generation is authorized. The canonical PreToolUse enforcement sentence is replaced for this host: hooks are disabled; the parent uses the detective kit guard before/after dispatch and at promotion. The worker cwd is the shadow root under workspace-write; this is not a universal per-file write boundary (runtime temporary/cache paths may be writable). Do not rely on a hook or claim preventive enforcement. First enumerate ALL_TOOLS through functions.exec and return status: blocked if unavailable or any name is outside this tested inventory: ${INVENTORY}. Tool presence is not authorization. Return exactly one canonical scene handoff YAML mapping without Markdown fences or prose.\n\n`;
const blocked = (message, extra = {}) => ({ ok: false, status: "BLOCKED", message, ...extra });
const sha = text => createHash("sha256").update(text).digest("hex");

export function workerOverrides({ project, model, reasoningEffort, instructions, scene = false }) {
  const config = {
    model, model_reasoning_effort: reasoningEffort, developer_instructions: instructions,
    sandbox_mode: scene ? "workspace-write" : "read-only", approval_policy: "never", web_search: "disabled",
    "agents.enabled": false, "apps._default.enabled": false,
  };
  for (const feature of ["apps", "plugins", "hooks", "memories", "request_permissions_tool", "image_generation", "goals"]) config[`features.${feature}`] = false;
  // Scene lint must use a parent-provisioned cache, without registry access from the worker.
  if (scene) {
    config["shell_environment_policy.set.npm_config_offline"] = "true";
    config["shell_environment_policy.set.npm_config_cache"] = join(project, ".npm-cache");
    config["shell_environment_policy.set.HYPERFRAMES_NO_TELEMETRY"] = "1";
  }
  // Disable every possible project config layer for this invocation only.
  for (let path = project;; path = dirname(path)) {
    config[`projects.${JSON.stringify(path)}.trust_level`] = "untrusted";
    if (dirname(path) === path) break;
  }
  return Object.entries(config).flatMap(([key, value]) => ["-c", `${key}=${JSON.stringify(value)}`]);
}

async function verifySceneGuard(project, shotId, guardDigest) {
  const path = safePath(project, `stage/guard/${shotId}.json`);
  if (!path || path !== baselinePath(project, shotId)) throw new Error("Unsafe kit guard baseline path.");
  const baseline = JSON.parse(readFileSync(path, "utf8"));
  if (baseline.shot !== shotId || canonicalDigest(baseline) !== guardDigest.toLowerCase()) throw new Error("Kit guard baseline identity/digest mismatch.");
  const diff = diffSnapshot(baseline, await snapshotProtected(project, shotId));
  const changed = [...diff.modified, ...diff.created, ...diff.deleted];
  if (changed.length) throw new Error(`Kit guard protected paths changed: ${changed.slice(0, 20).join(", ")}`);
}

export async function runCodexWorker(options, ctx = {}) {
  let home;
  const cleanup = () => { if (home) rmSync(home, { recursive: true, force: true }); };
  try {
    const { role, model, reasoningEffort, timeoutMs = 300000 } = options;
    if (!Object.hasOwn(STAGES, role)) return blocked("Unsupported canonical role.");
    const scene = role === "scene-builder";
    if ((ctx.platform ?? process.platform) !== "darwin" || (ctx.arch ?? process.arch) !== "arm64") return blocked("This adapter is verified only on macOS arm64.");
    if (options.provider !== "openai") return blocked("Pass --provider openai only when it is the main agent's actual provider; other providers are unsupported.");
    if (typeof model !== "string" || !model.trim() || !["none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"].includes(reasoningEffort)) return blocked("Pass the main agent's current model and reasoning effort explicitly.");
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 3600000) return blocked("timeout-ms must be an integer from 1 to 3600000.");
    const root = realpathSync(ctx.rootDir ?? ROOT);
    const project = realpathSync(options.project), briefPath = realpathSync(options.brief);
    if (!statSync(project).isDirectory() || project === root || !statSync(join(project, "project.yaml")).isFile() || !statSync(briefPath).isFile()) return blocked("Expected a project directory and a regular brief file, not the plugin root.");
    let workdir = project;
    if (scene) {
      if (!/^s\d{2}$/.test(options.shotId ?? "") || !/^[0-9a-fA-F]{64}$/.test(options.guardDigest ?? "") || !/^[0-9a-fA-F]{64}$/.test(options.briefHash ?? "")) return blocked("Scene dispatch requires shot-id (sNN), original stage-shot guard-digest and brief-hash (64 hex).");
      const expected = join(project, "stage/edit", options.shotId);
      workdir = safePath(project, `stage/edit/${options.shotId}`);
      if (!workdir || realpathSync(workdir) !== expected || !statSync(workdir).isDirectory()) return blocked("Scene shadow root is missing or unsafe.");
      await verifySceneGuard(project, options.shotId, options.guardDigest);
    } else if (options.shotId !== undefined || options.guardDigest !== undefined || options.briefHash !== undefined) return blocked("Scene options are only supported for scene-builder.");
    // CLI trust overrides are insufficient to suppress project MCP on the tested client.
    // The normal home is a user config location, replaced by our private CODEX_HOME.
    for (let path = workdir; path !== homedir(); path = dirname(path)) {
      if (["config.toml", "hooks.json"].some(file => existsSync(join(path, ".codex", file)))) return blocked("Codex project config/hook layers are unsupported by this worker; use a project without those layers.");
      if (dirname(path) === path) break;
    }
    const brief = readFileSync(briefPath, "utf8");
    if (!brief.trim()) return blocked("The dispatch brief is empty.");
    const manifest = buildManifest(root);
    const agent = manifest.agents.find(a => a.name === role);
    if (!agent || agent.portable.writes !== (scene ? "shadow-only" : "none")) return blocked("The canonical role has an unsupported write policy.");
    const source = readFileSync(join(root, agent.source), "utf8");
    const header = source.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
    if (!header) return blocked("Canonical agent frontmatter is invalid.");
    const env = ctx.env ?? process.env;
    const version = await runTool(ctx, "codex", ["--version"], { cwd: project, timeoutMs: 10000 });
    if (version.status !== 0 || version.stdout.trim() !== `codex-cli ${CODEX_VERSION}`) return blocked(`Requires the tested Codex CLI ${CODEX_VERSION}; no automatic upgrade or fallback.`);
    const auth = realpathSync(join(env.CODEX_HOME ?? join(homedir(), ".codex"), "auth.json"));
    if (!statSync(auth).isFile()) return blocked("An existing OpenAI Codex auth.json is required.");
    home = mkdtempSync(join(tmpdir(), "imagine-codex-worker-"));
    symlinkSync(auth, join(home, "auth.json"));
    writeFileSync(join(home, "config.toml"), "# Isolated Imagine worker; configuration is pinned through CLI overrides.\n", { mode: 0o600 });
    const overrides = workerOverrides({ project: workdir, model, reasoningEffort, scene, instructions: (scene ? SCENE_ADAPTER : ADAPTER) + source.slice(header[0].length) });
    const base = [...overrides, "-C", workdir];
    const callOptions = { cwd: workdir, env: { CODEX_HOME: home }, timeoutMs, onSignal: cleanup };
    const servers = await runTool(ctx, "codex", [...base, "mcp", "list", "--json"], callOptions);
    if (servers.status !== 0 || servers.timedOut) return blocked("Could not inspect effective MCP configuration.");
    let list;
    try { list = JSON.parse(servers.stdout); } catch { return blocked("Effective MCP inventory was not valid JSON."); }
    if (!Array.isArray(list) || list.some(server => !server || server.enabled !== false)) return blocked("Worker cannot start with an active or unrecognized MCP server configuration.");
    const outputFile = join(home, "output.txt");
    const result = await runTool(ctx, "codex", [...base, "exec", "--json", "--skip-git-repo-check", "--output-last-message", outputFile, "-"], {
      ...callOptions, input: `Dispatch brief (supplied verbatim by the main agent):\n${brief}\n\n${scene ? `Transport identity: shot_id=${options.shotId}; shadow_root=${workdir}; brief_hash=${options.briefHash}. Build only this staged shot; the main agent owns promotion and approvals.` : "Read all mandatory sources. Return the proposal only; the main agent owns staging and patch application."}`,
    });
    if (scene) await verifySceneGuard(project, options.shotId, options.guardDigest);
    if (result.timedOut || result.status !== 0) return blocked(result.timedOut ? "Worker timed out; process group terminated." : "Codex worker failed.", { exit_code: result.status });
    let output;
    try { output = readFileSync(outputFile, "utf8"); } catch { return blocked("Worker did not return an output file."); }
    if (!output.trim()) return blocked("Worker returned empty output.");
    let parsed;
    if (STAGES[role] || scene) {
      try { parsed = YAML.parse(output, { maxAliasCount: 0 }); } catch { /* Invalid patch output is rejected below. */ }
    }
    // The canonical reviewer may use YAML, Markdown bullets or a table for outcome.
    const blockedOutcome = /\b(?:outcome|status)\s*(?::|\|)\s*["']?blocked\b/i.test(output.replace(/[`*]/g, ""));
    if (parsed?.status === "blocked" || parsed?.blocked || blockedOutcome || /^blocked\b/i.test(output)) return blocked("Worker reported missing inputs or authority.", { output });
    if (STAGES[role] && (output.includes("```") || !parsed || parsed.stage !== STAGES[role] || parsed.author !== role || !loadValidator("patch")(parsed).valid)) return blocked("Worker output is not a patch envelope for its role; no repair was attempted.", { output });
    if (scene) {
      const validArtifacts = Array.isArray(parsed?.artifacts) && parsed.artifacts.length > 0 && parsed.artifacts.every(a => {
        if (typeof a?.path !== "string" || !a.path.startsWith(`${workdir}/`)) return false;
        const path = safePath(workdir, a.path.slice(workdir.length + 1));
        return path && existsSync(path) && statSync(path).isFile();
      });
      if (output.includes("```") || parsed?.status !== "proposed" || parsed.shot_id !== options.shotId || parsed.shadow_root !== workdir || parsed.brief_hash !== options.briefHash || parsed.validation?.lint_clean !== true || !Number.isInteger(parsed.validation?.lint_attempts) || parsed.validation.lint_attempts < 1 || parsed.validation.lint_attempts > 3 || !validArtifacts || !parsed.artifacts.some(a => a.path === join(workdir, "compositions", `${options.shotId}.html`))) return blocked("Worker output is not a verified scene handoff for the dispatched identity; no repair was attempted.", { output });
    }
    return { ok: true, status: "proposed", role, output, source_sha256: sha(source), dispatch_sha256: sha(brief) };
  } catch (error) {
    return blocked(`Worker setup failed: ${error.code ?? error.message}`);
  } finally { cleanup(); }
}

async function main() {
  const values = {};
  const names = { "--role": "role", "--project": "project", "--brief": "brief", "--provider": "provider", "--model": "model", "--reasoning-effort": "reasoningEffort", "--timeout-ms": "timeoutMs", "--shot-id": "shotId", "--guard-digest": "guardDigest", "--brief-hash": "briefHash" };
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 2) {
    const key = names[args[i]];
    if (!key || values[key] !== undefined || args[i + 1] === undefined) {
      console.log(JSON.stringify(blocked("Usage: codex-worker.mjs --role ROLE --project DIR --brief FILE --provider openai --model MODEL --reasoning-effort EFFORT [--timeout-ms N]")));
      process.exitCode = 2; return;
    }
    values[key] = key === "timeoutMs" ? Number(args[i + 1]) : args[i + 1];
  }
  const result = await runCodexWorker(values);
  console.log(JSON.stringify(result)); process.exitCode = result.ok ? 0 : 3;
}
let entry = false;
try { entry = Boolean(process.argv[1]) && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { /* Imported without a filesystem entry point. */ }
if (entry) await main();
