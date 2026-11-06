import { constants, copyFileSync, existsSync, lstatSync, mkdirSync, readlinkSync, realpathSync, renameSync, unlinkSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { withLock } from "../fsx.mjs";
import { saveManifest } from "../docs.mjs";
import { appendJournal } from "../journal.mjs";
import { saveProject } from "../project.mjs";
import { sha256File } from "../hash.mjs";
import { createContext } from "../sources.mjs";
import { KitError } from "../errors.mjs";

// Resolves a project-relative path to an absolute one, or null when it is absolute, contains "..", or its real location
// (following symlinks, also through the nearest existing parent for a file that does not exist yet) leaves the project.
export function safePath(dir, rel) {
  if (typeof rel !== "string" || rel === "" || isAbsolute(rel) || rel.split(/[\\/]/).includes("..")) return null;
  const root = realpathSync(dir);
  const abs = resolve(dir, rel);
  let target = abs;
  const seen = new Set();
  while (true) {
    const st = lstatSync(target, { throwIfNoEntry: false });
    if (!st?.isSymbolicLink()) break;
    if (seen.has(target) || seen.size > 40) return null;
    seen.add(target);
    target = resolve(dirname(target), readlinkSync(target));
  }
  let probe = target;
  while (!existsSync(probe)) {
    const st = lstatSync(probe, { throwIfNoEntry: false });
    if (st?.isSymbolicLink()) {
      if (seen.has(probe) || seen.size > 40) return null;
      seen.add(probe);
      probe = resolve(dirname(probe), readlinkSync(probe));
      continue;
    }
    const parent = dirname(probe);
    if (parent === probe) break;
    probe = parent;
  }
  if (!existsSync(probe)) return null;
  const real = realpathSync(probe);
  return real === root || real.startsWith(root + sep) ? abs : null;
}

// Copies a finished file into the project without ever exposing a half-written file at the final path.
export function placeFile(src, dest) {
  mkdirSync(dirname(dest), { recursive: true });
  // Unpredictable name plus exclusive creation: a pre-existing entry at the temp path (for example a symlink planted by
  // a concurrent process) makes copyFileSync fail instead of writing through it.
  const tmp = `${dest}.tmp-${process.pid}-${randomBytes(6).toString("hex")}`;
  copyFileSync(src, tmp, constants.COPYFILE_EXCL);
  renameSync(tmp, dest);
}

// Short critical section: re-read project and manifest under the lock, add one pending version, write manifest then project.
// A version that appeared meanwhile (another process, or a crash we are resuming) is kept and nothing is overwritten.
export async function commitAsset(ctx, dir, { entry, source, summary, clearBlocked }) {
  return withLock(dir, async () => {
    const fresh = createContext(dir);
    const manifest = fresh.manifest;
    const dest = safePath(dir, entry.path);
    if (!dest) throw new KitError("HARD", `${entry.path} is outside the project`, { rule: "HARD-ASSETS-APPROVED", item: `${entry.id}.v${entry.v}` });
    const existing = manifest.assets.find((a) => a.id === entry.id && a.v === entry.v);
    if (existing) return { kept: true, entry: existing };
    if (source) {
      if (existsSync(dest)) unlinkSync(dest);
      placeFile(source, dest);
    }
    entry.sha256 = sha256File(dest);
    manifest.assets.push(entry);
    saveManifest(dir, manifest);
    const project = fresh.project;
    if (clearBlocked) project.blocked = project.blocked.filter((b) => b.step !== clearBlocked);
    saveProject(dir, project);
    return { kept: false, entry, journal_id: appendJournal(dir, { command: summary.command, summary: summary.text, now: ctx.now() }) };
  });
}

export async function commitAssets(ctx, dir, { items, extraFiles = [], summary, clearBlocked }) {
  return withLock(dir, async () => {
    const fresh = createContext(dir);
    const manifest = fresh.manifest;

    for (const extra of extraFiles) {
      const dest = safePath(dir, extra.rel);
      if (!dest) throw new KitError("HARD", `${extra.rel} is outside the project`, { rule: "HARD-ASSETS-APPROVED", item: extra.rel });
      if (existsSync(dest) && sha256File(dest) === sha256File(extra.source)) {
        // already exists with matching hash; do not copy again
      } else {
        if (existsSync(dest)) unlinkSync(dest);
        placeFile(extra.source, dest);
      }
    }

    const resultEntries = [];
    for (const item of items) {
      const entry = item.entry;
      const dest = safePath(dir, entry.path);
      if (!dest) throw new KitError("HARD", `${entry.path} is outside the project`, { rule: "HARD-ASSETS-APPROVED", item: `${entry.id}.v${entry.v}` });
      const existing = manifest.assets.find((a) => a.id === entry.id && a.v === entry.v);
      if (existing) {
        resultEntries.push({ kept: true, entry: existing });
        continue;
      }
      if (item.source) {
        if (existsSync(dest)) unlinkSync(dest);
        placeFile(item.source, dest);
      }
      entry.sha256 = sha256File(dest);
      manifest.assets.push(entry);
      resultEntries.push({ kept: false, entry });
    }

    saveManifest(dir, manifest);
    const project = fresh.project;
    if (clearBlocked) project.blocked = project.blocked.filter((b) => b.step !== clearBlocked);
    saveProject(dir, project);
    const journal_id = appendJournal(dir, { command: summary.command, summary: summary.text, now: ctx.now() });
    return { entries: resultEntries.map((r) => r.entry), journal_id };
  });
}

export async function recordBlocked(ctx, dir, { step, command }) {
  return withLock(dir, async () => {
    const project = createContext(dir).project;
    project.blocked = project.blocked.filter((b) => b.step !== step);
    project.blocked.push({ step, command, since: ctx.now().toISOString() });
    saveProject(dir, project);
  });
}
