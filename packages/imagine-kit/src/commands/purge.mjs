import { lstatSync, readdirSync, unlinkSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { err } from "../envelope.mjs";
import { UsageError } from "../errors.mjs";
import { deriveAll } from "../derive.mjs";
import { isBlankQuote } from "../gates.mjs";
import { withLock } from "../fsx.mjs";
import { appendJournal } from "../journal.mjs";
import { loadProject, resolveProject, saveProject } from "../project.mjs";
import { createContext } from "../sources.mjs";
import { safePath } from "../img/commit.mjs";

const EXTENSIONS = new Set([".png", ".mp4", ".jpg", ".jpeg"]);
const stat = (path) => lstatSync(path, { throwIfNoEntry: false });
const relPath = (dir, path) => relative(dir, path).split(sep).join("/");

function collect(dir) {
  const kept = [];
  const targets = [];
  const skipped_symlinks = [];
  const post = join(dir, "post");
  const postStat = stat(post);
  if (postStat?.isDirectory()) {
    for (const name of readdirSync(post)) {
      const path = join(post, name);
      if (stat(path)?.isFile() && name.toLowerCase().endsWith(".mp4")) kept.push(relPath(dir, path));
    }
  }

  function walk(directory) {
    for (const name of readdirSync(directory)) {
      const path = join(directory, name);
      const rel = relPath(dir, path);
      if (rel === "post" || rel.startsWith("post/")) continue;
      const info = stat(path);
      if (!info) continue;
      if (info.isSymbolicLink()) {
        skipped_symlinks.push(rel);
      } else if (info.isDirectory()) {
        if (name === ".git" || name === "node_modules") continue;
        walk(path);
      } else if (info.isFile() && EXTENSIONS.has(name.slice(name.lastIndexOf(".")).toLowerCase())) {
        const safe = safePath(dir, rel);
        if (safe) targets.push({ path, rel, bytes: info.size });
      }
    }
  }
  walk(dir);
  targets.sort((a, b) => a.rel.localeCompare(b.rel));
  kept.sort();
  skipped_symlinks.sort();
  const byDirectory = new Map();
  for (const item of targets) {
    const directory = item.rel.includes("/") ? item.rel.slice(0, item.rel.lastIndexOf("/")) : ".";
    const group = byDirectory.get(directory) ?? { dir: directory, files: 0, bytes: 0 };
    group.files += 1;
    group.bytes += item.bytes;
    byDirectory.set(directory, group);
  }
  const by_dir = [...byDirectory.values()].sort((a, b) => b.bytes - a.bytes || a.dir.localeCompare(b.dir));
  return { kept, targets, skipped_symlinks, by_dir,
    total_files: targets.length, total_bytes: targets.reduce((sum, item) => sum + item.bytes, 0) };
}

function hardFinalError(rel) {
  return { project: rel, data: {}, errors: [err("HARD-PURGE-FINAL-EXISTS", "HARD", "post", "purge requires at least one regular .mp4 file directly inside project-root post/")] };
}

function summary(scan, mode) {
  return { mode, kept: scan.kept, total_files: scan.total_files, total_bytes: scan.total_bytes,
    by_dir: scan.by_dir, skipped_symlinks: scan.skipped_symlinks };
}

export default {
  locks: false,
  options: { apply: { type: "boolean" }, quote: { type: "string" } },
  async run({ values }, ctx) {
    if (values.quote !== undefined && !values.apply) throw new UsageError("--quote requires --apply");
    const { dir, rel } = resolveProject(ctx.cwd, values.project);
    const quote = values.quote ?? "";
    if (values.apply && isBlankQuote(quote)) {
      return { project: rel, data: { mode: "apply" }, errors: [err("PROC-PURGE-QUOTE", "NEEDS_USER", null,
        "purge apply requires the user's explicit verbatim answer with --quote")] };
    }
    const sctx = createContext(dir);
    const advice = deriveAll(sctx).gates.G7.state === "approved" ? [] : [{
      rule: "ADV-PURGE-G7-PENDING", item: "G7", source: "project.yaml",
      message: "The final was not accepted at G7; purge can still continue.",
    }];
    if (!values.apply) {
      const scan = collect(dir);
      if (scan.kept.length === 0) return hardFinalError(rel);
      return { project: rel, data: summary(scan, "dry-run"), advice };
    }
    return withLock(dir, async () => {
      const scan = collect(dir);
      if (scan.kept.length === 0) return hardFinalError(rel);
      const project = loadProject(dir);
      project.purges ??= [];
      const at = ctx.now().toISOString();
      project.purges.push({ at, quote, files: scan.total_files, bytes: scan.total_bytes });
      saveProject(dir, project);
      for (const item of scan.targets) {
        const safe = safePath(dir, item.rel);
        const current = safe && stat(safe);
        if (current?.isFile() && !current.isSymbolicLink()) {
          ctx.hooks?.beforePurgeUnlink?.(safe);
          unlinkSync(safe);
        }
      }
      const journal_id = appendJournal(dir, { command: "purge", summary: `${scan.total_files} files, ${scan.total_bytes} bytes`, now: ctx.now() });
      return { project: rel, journal_id, data: summary(scan, "apply"), advice };
    });
  },
};
