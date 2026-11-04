#!/usr/bin/env node
// Dev-side WP8 evidence probes. Probes that break an input run only on snapshot copies.
import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const here = dirname(fileURLToPath(import.meta.url));
const KIT = resolve(here, "..", "..", "packages", "imagine-kit", "bin", "imagine-kit.mjs");
const sliceHome = () => process.env.IMAGINE_SLICE_HOME ?? join(homedir(), "imagine-slice");
const sha = (f) => createHash("sha256").update(readFileSync(f)).digest("hex");
// A key each patch stage does not own (packages/imagine-kit/src/story/keys.mjs STAGE_KEYS).
const PROBE_QUOTE = "WP8 probe on a snapshot copy (dev session); not a production approval";

class UsageError extends Error {}

// Probes that write (a broken input, a gate record, a generated asset) run only on snapshot copies, so a mistyped
// --project can never touch a live slice project or record an approval the user did not give.
// The project must exist (a probe always acts on a snapshot that snapshot created) and its realpath must sit under the
// realpath of snapshots/. A path that does not exist is refused: an unresolved ancestor could be a symlink to a live dir.
function requireSnapshot(project) {
  const root = join(sliceHome(), "snapshots");
  const refuse = () => new UsageError(`refusing to write to ${project}: writing probes run only on a copy under ${root} (run snapshot first)`);
  if (!existsSync(root) || !existsSync(project)) throw refuse();
  if (!realpathSync(project).startsWith(realpathSync(root) + sep)) throw refuse();
}

// A relative path (--patch) must stay inside dir, lexically and by realpath: the deepest existing ancestor of the
// result (a dangling symlink counts as existing and is refused) must resolve inside realpath(dir), so a symlink
// inside a snapshot cannot carry a write out of it.
function within(dir, rel, what) {
  const abs = resolve(dir, rel);
  const leaves = () => new UsageError(`${what} ${rel} leaves ${dir}; use a path relative to the project`);
  if (!abs.startsWith(resolve(dir) + sep)) throw leaves();
  const realDir = realpathSync(dir);
  let cur = abs;
  while (!lstatExists(cur)) cur = dirname(cur);
  let real;
  try { real = realpathSync(cur); } catch { throw leaves(); }
  if (real !== realDir && !real.startsWith(realDir + sep)) throw leaves();
  return abs;
}
const lstatExists = (p) => { try { lstatSync(p); return true; } catch { return false; } };
const LABEL_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// pids whose full command line matches the extended regex, without this process.
const pgrep = (pattern) => (spawnSync("pgrep", ["-f", pattern], { encoding: "utf8" }).stdout ?? "")
  .split("\n").filter(Boolean).map(Number).filter((pid) => pid !== process.pid);
const realOrResolved = (p) => { try { return realpathSync(p); } catch { return resolve(p); } };
// Working directory of a process: lsof on macOS, /proc on Linux.
function procCwd(pid) {
  const r = spawnSync("lsof", ["-a", "-d", "cwd", "-p", String(pid), "-Fn"], { encoding: "utf8" });
  const line = (r.stdout ?? "").split("\n").find((l) => l.startsWith("n"));
  if (line) return line.slice(1);
  try { return realpathSync(`/proc/${pid}/cwd`); } catch { return null; }
}
// The project a running `imagine-kit img --batch` resolves to, mirroring resolveProject(cwd, flag) in
// packages/imagine-kit/src/project.mjs: --project is resolved against the process cwd, else cwd/.imagine/ACTIVE.
// Returns a realpath, or null when it cannot be determined (the process is gone, or there is no ACTIVE file).
// Limit: the command line is split on whitespace, so a project path containing spaces is not recognised.
function batchProject(pid) {
  const cwd = procCwd(pid);
  const args = (spawnSync("ps", ["-o", "args=", "-p", String(pid)], { encoding: "utf8" }).stdout ?? "").trim().split(/\s+/);
  if (!cwd || args.length < 2) return null;
  const i = args.findIndex((a) => a === "--project" || a.startsWith("--project="));
  const flag = i < 0 ? "" : args[i].startsWith("--project=") ? args[i].slice("--project=".length) : (args[i + 1] ?? "");
  if (flag) return realOrResolved(resolve(cwd, flag));
  const active = join(cwd, ".imagine", "ACTIVE");
  if (!existsSync(active)) return null;
  return realOrResolved(join(cwd, ".imagine", readFileSync(active, "utf8").trim()));
}
// Every running kit batch that targets this project, by exact realpath equality (not a substring of the command line).
const batchPids = (project) => pgrep("imagine-kit\\.mjs img --batch").filter((pid) => batchProject(pid) === realOrResolved(project));
const imgKeys = (project) => {
  const f = join(project, "assets", "manifest.yaml");
  if (!existsSync(f)) return [];
  return (YAML.parse(readFileSync(f, "utf8")).assets ?? []).filter((a) => a.kind === "img").map((a) => `${a.id}.v${a.v}`);
};

// The plugin pin that produced a piece of evidence: the last plugin_commit line of session.txt (a re-pin appends one).
function currentPin() {
  const f = process.env.IMAGINE_SLICE_SESSION ?? join(here, "evidence", "session.txt");
  if (!existsSync(f)) return null;
  const pins = readFileSync(f, "utf8").split("\n").filter((l) => /^plugin_commit(_\w+)?=/.test(l));
  return pins.length ? pins.at(-1).split("=")[1] : null;
}

const FOREIGN = { storyboard: ["camera", "hold"], previz: ["characters", ["mara"]], fx: ["characters", ["mara"]] };

export function kit(projectDir, args, env = {}) {
  const r = spawnSync(process.execPath, [KIT, ...args, "--project", projectDir], {
    cwd: dirname(projectDir), encoding: "utf8", env: { ...process.env, ...env },
  });
  let envelope;
  try { envelope = JSON.parse(r.stdout.trim()); } catch { envelope = { ok: false, code: "UNPARSEABLE", errors: [{ message: r.stdout + r.stderr }] }; }
  return { exit: r.status, env: envelope };
}

function listFiles(root) {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile()).map((e) => join(e.parentPath, e.name)).sort();
}

function copyOf(dir, label) {
  const dst = join(mkdtempSync(join(tmpdir(), `imagine-probe-${label}-`)), basename(dir));
  cpSync(dir, dst, { recursive: true });
  return dst;
}

const newlyStale = (beforeItems, afterItems) => {
  const prior = Object.fromEntries(beforeItems.map((i) => [i.id, i.status]));
  return afterItems.filter((i) => i.status === "stale" && prior[i.id] !== "stale")
    .map(({ id, kind, reasons, watch }) => ({ id, kind, reasons, watch }));
};

// Adds a probe field to one bible entity ("characters.mara" -> characters[id=mara]) so its hash changes.
export function editBibleEntity(dir, path, field, value) {
  const file = join(dir, "bible.yaml");
  const doc = YAML.parseDocument(readFileSync(file, "utf8"));
  const [section, id] = path.split(".");
  const idx = doc.get(section)?.items?.findIndex((n) => n.get?.("id") === id) ?? -1;
  if (idx < 0) throw new Error(`bible entity ${path} not found`);
  doc.setIn([section, idx, field], value);
  writeFileSync(file, doc.toString());
}

const cmds = {
  snapshot({ project, label }) {
    if (!LABEL_RE.test(label) || label.includes("..")) throw new UsageError(`--label ${JSON.stringify(label)} must match ${LABEL_RE} and not contain ..`);
    if (!existsSync(project)) throw new UsageError(`project ${project} does not exist`);
    const root = join(sliceHome(), "snapshots");
    mkdirSync(root, { recursive: true });
    const dst = join(realpathSync(root), label, basename(project));
    within(realpathSync(root), join(label, basename(project)), "snapshot destination");
    if (existsSync(dst)) throw new UsageError(`snapshot ${dst} already exists; pick another --label`);
    // cpSync keeps symlinks, so one that leaves the project would let later writes on the snapshot reach the original target.
    const realProject = realpathSync(project);
    for (const e of readdirSync(project, { withFileTypes: true, recursive: true }).filter((x) => x.isSymbolicLink())) {
      const link = join(e.parentPath, e.name);
      let target;
      try { target = realpathSync(link); } catch { target = null; }
      if (target !== realProject && !target?.startsWith(realProject + sep)) {
        throw new UsageError(`project holds a symlink that leaves it (${link}); remove it before snapshotting`);
      }
    }
    mkdirSync(dirname(dst), { recursive: true });
    cpSync(project, dst, { recursive: true });
    return { path: dst };
  },

  status({ project }) { return kit(project, ["status"]).env; },

  "diff-status"({ before, after }) {
    const b = JSON.parse(readFileSync(before, "utf8")).data.items;
    const a = JSON.parse(readFileSync(after, "utf8")).data.items;
    const newly = newlyStale(b, a);
    return { newly_stale: newly, others_count: a.length - newly.length };
  },

  adopt({ project, from, patch, gate }) {
    requireSnapshot(project);
    const dstFile = within(project, patch, "--patch");
    const srcFile = within(from, patch, "--patch");
    mkdirSync(dirname(dstFile), { recursive: true });
    cpSync(srcFile, dstFile);
    if (!gate) return { verdict: "PASS", patch, gate: null };
    const g = kit(project, ["gate", gate, "approve", "--quote", PROBE_QUOTE]);
    return { verdict: g.exit === 0 ? "PASS" : "FAIL", patch, gate, gate_exit: g.exit, gate_code: g.env.code ?? null, errors: g.env.errors };
  },

  ac02({ project, patch }) {
    requireSnapshot(project);
    const story = join(project, "STORY.md");
    const patchFile = within(project, patch, "--patch");
    const before = sha(story);
    const p = YAML.parse(readFileSync(patchFile, "utf8"));
    const [key, value] = FOREIGN[p.stage] ?? [];
    if (!key) throw new Error(`unknown patch stage ${p.stage}`);
    const set = p.ops[0].set ?? p.ops[0].create_shot?.set;
    if (!set) throw new Error("the first op of the patch has no set block");
    set[key] = value;
    const rel = join(dirname(patch), "ac02-forbidden.patch.yaml");
    writeFileSync(within(project, rel, "ac02 copy"), YAML.stringify(p));
    const r = kit(project, ["patch", "apply", rel]);
    const after = sha(story);
    const pass = r.exit === 1 && r.env.code === "KEY_NOT_OWNED" && before === after;
    return { verdict: pass ? "PASS" : "FAIL", injected: `${p.stage} op 1 set.${key}`, exit: r.exit, code: r.env.code,
      errors: r.env.errors, story_sha_before: before, story_sha_after: after };
  },

  ac12({ project, patch }) {
    requireSnapshot(project);
    const p = YAML.parse(readFileSync(within(project, patch, "--patch"), "utf8"));
    const entity = Object.keys(p.inputs?.bible ?? {})[0];
    if (!entity) throw new Error("the staged patch records no bible input; use the staged storyboard patch");
    const control = copyOf(project, "ac12-control");
    const c = kit(control, ["patch", "apply", patch]);
    const story = join(project, "STORY.md");
    const before = sha(story);
    editBibleEntity(project, entity, "ac12_probe", "edited after staging");
    const r = kit(project, ["patch", "apply", patch]);
    const after = sha(story);
    const pass = c.exit === 0 && r.exit === 4 && r.env.code === "STALE_INPUTS" && before === after;
    return { verdict: pass ? "PASS" : "FAIL", control: { exit: c.exit, code: c.env.code ?? null },
      probe: { exit: r.exit, code: r.env.code, errors: r.env.errors }, edited_entity: entity, story_sha_before: before, story_sha_after: after };
  },

  ac15a({ project }) {
    requireSnapshot(project);
    const plan = YAML.parse(readFileSync(join(project, "assets", "plan.yaml"), "utf8"));
    const ids = plan.assets.filter((a) => a.kind === "img").map((a) => a.id);
    const bin = mkdtempSync(join(tmpdir(), "ac15a-bin-"));
    const sentinel = join(bin, "codex-called");
    writeFileSync(join(bin, "codex"), `#!/bin/sh\ntouch "${sentinel}"\nexit 1\n`);
    chmodSync(join(bin, "codex"), 0o755);
    const watched = [join(project, "assets"), join(project, "tmp", "img")];
    const before = new Set(watched.flatMap(listFiles));
    const r = kit(project, ["img", "--batch", ids.join(",")], { PATH: `${bin}:${process.env.PATH}` });
    const newFiles = watched.flatMap(listFiles).filter((f) => !before.has(f)).map((f) => f.slice(project.length + 1));
    const called = existsSync(sentinel);
    const pass = r.exit === 6 && r.env.code === "REFS_NOT_APPROVED" && !called && newFiles.length === 0;
    return { verdict: pass ? "PASS" : "FAIL", exit: r.exit, code: r.env.code, batch: ids, tool_called: called, new_files: newFiles };
  },

  ac15b({ project, ref }) {
    requireSnapshot(project);
    const before = kit(project, ["status"]).env.data.items;
    // A new version needs --redo with a note; a plain --ref returns the existing version (PROC-RESUME-IDEMPOTENT).
    const g = kit(project, ["img", "--ref", ref, "--redo", ref, "--note", "AC15 probe: new ref version on a snapshot copy"]);
    const made = g.env.data?.assets?.[0];
    if (g.exit !== 0 || !made) return { verdict: "FAIL", step: "img --ref", exit: g.exit, code: g.env.code, errors: g.env.errors };
    const gate = kit(project, ["gate", "G5r", "approve", "--scope", `asset:${made.id}.v${made.v}`, "--quote", PROBE_QUOTE]);
    const newly = newlyStale(before, kit(project, ["status"]).env.data.items);
    // The superseded ref version always turns stale; the criterion is that something that cites the ref does too,
    // so any version of the ref itself does not count.
    const citing = newly.filter((i) => i.id.startsWith("asset:") && !i.id.startsWith(`asset:${made.id}.v`)).map((i) => i.id);
    const pass = gate.exit === 0 && citing.length > 0;
    return { verdict: pass ? "PASS" : "FAIL", new_ref: `${made.id}.v${made.v}`, gate_exit: gate.exit, gate_code: gate.env.code ?? null,
      newly_stale: newly, citing_stale: citing };
  },

  // AC8: waits until the running batch commits one new image, then signals the kit like a Ctrl-C and checks that
  // no kit or codex process for this project survives. It sends a signal only; it writes nothing to the project.
  async "interrupt-batch"({ project, signal = "INT", timeout = "900" }) {
    const before = new Set(imgKeys(project));
    process.stderr.write(`probe: watching ${project} for a new committed image\n`); // readiness: the baseline is taken
    const deadline = Date.now() + Number(timeout) * 1000;
    let committed;
    while (!(committed = imgKeys(project).find((k) => !before.has(k)))) {
      if (Date.now() > deadline) return { verdict: "FAIL", step: "no new image committed before the timeout" };
      await sleep(500);
    }
    // Only this project's batch, however the kit was told which project (absolute or relative --project, or ACTIVE).
    const pids = batchPids(project);
    if (pids.length === 0) return { verdict: "FAIL", step: "the batch finished before the signal", committed };
    for (const pid of pids) {
      try { process.kill(pid, `SIG${signal}`); } catch (e) { if (e.code !== "ESRCH") throw e; } // already gone is fine
    }
    await sleep(5000);
    const survivors = { kit: batchPids(project), codex: pgrep(`codex exec.*${escapeRe(project)}`) };
    const pass = survivors.kit.length === 0 && survivors.codex.length === 0;
    return { verdict: pass ? "PASS" : "FAIL", committed_before_signal: committed, signal, signalled: pids, survivors };
  },

  "manifest-check"({ project }) {
    const file = join(project, "assets", "manifest.yaml");
    if (!existsSync(file)) throw new UsageError(`${file} does not exist`);
    const m = YAML.parse(readFileSync(file, "utf8"));
    const count = new Map();
    for (const a of m.assets ?? []) count.set(`${a.id}.v${a.v}`, (count.get(`${a.id}.v${a.v}`) ?? 0) + 1);
    const duplicates = [...count].filter(([, n]) => n > 1).map(([k]) => k);
    return { verdict: duplicates.length === 0 ? "PASS" : "FAIL", duplicates, entries: [...count.keys()] };
  },

  // Copies a file into the evidence dir with the home path written as $HOME.
  redact({ in: input, out }) {
    if (!input || !out) throw new UsageError("redact needs --in and --out");
    const text = readFileSync(input, "utf8");
    const replaced = text.split(homedir()).length - 1;
    writeFileSync(out, text.replaceAll(homedir(), "$HOME"));
    return { in: input, replaced };
  },

  "index-check"({ index }) {
    const base = dirname(index);
    const paths = [...readFileSync(index, "utf8").matchAll(/`([^`]+\.(?:json|md|txt|log))`/g)].map((m) => m[1]);
    const missing = [...new Set(paths)].filter((p) => !existsSync(join(base, p)));
    return { verdict: missing.length === 0 ? "PASS" : "FAIL", missing };
  },
};

const options = { project: { type: "string" }, label: { type: "string" }, patch: { type: "string" }, ref: { type: "string" },
  before: { type: "string" }, after: { type: "string" }, index: { type: "string" }, out: { type: "string" },
  from: { type: "string" }, gate: { type: "string" }, in: { type: "string" }, signal: { type: "string" }, timeout: { type: "string" } };

const REQUIRED = { snapshot: ["project", "label"], status: ["project"], "diff-status": ["before", "after"],
  adopt: ["project", "from", "patch"], ac02: ["project", "patch"], ac12: ["project", "patch"], ac15a: ["project"],
  ac15b: ["project", "ref"], "interrupt-batch": ["project"], "manifest-check": ["project"], redact: ["in", "out"], "index-check": ["index"] };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [name, ...rest] = process.argv.slice(2);
  if (!cmds[name]) { process.stderr.write(`usage: probe.mjs <${Object.keys(cmds).join("|")}> [options]\n`); process.exit(2); }
  let values;
  try { ({ values } = parseArgs({ args: rest, options, strict: true })); } catch (e) {
    process.stderr.write(`probe: ${e.message}\n`);
    process.exit(2);
  }
  for (const k of ["project", "before", "after", "index", "from", "in"]) if (values[k]) values[k] = resolve(values[k]);
  const missing = (REQUIRED[name] ?? []).filter((k) => !values[k]);
  if (missing.length) {
    process.stderr.write(`probe: ${name} needs ${missing.map((k) => `--${k}`).join(", ")}\n`);
    process.exit(2);
  }
  let result;
  try {
    result = await cmds[name](values);
  } catch (e) {
    // 2 = usage error or refusal, 1 = FAIL verdict only. A crash is neither: exit 70 (EX_SOFTWARE) with the stack.
    if (e instanceof UsageError) { process.stderr.write(`probe: ${e.message}\n`); process.exit(2); }
    process.stderr.write(`probe: internal error: ${e.stack}\n`);
    process.exit(70);
  }
  if (name === "redact") { process.stdout.write(`${JSON.stringify(result)}\n`); process.exit(0); }
  const text = JSON.stringify(result, null, 2);
  // Evidence files record the pin and hide the home path; stdout keeps real paths so shell pipelines can use them.
  if (values.out) {
    const evidence = JSON.stringify({ _pin: currentPin(), ...result }, null, 2);
    writeFileSync(values.out, `${evidence.replaceAll(homedir(), "$HOME")}\n`);
  }
  process.stdout.write(`${text}\n`);
  process.exitCode = result.verdict === "FAIL" ? 1 : 0;
}
