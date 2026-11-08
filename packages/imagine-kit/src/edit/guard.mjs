import { createHash } from "node:crypto";
import { createReadStream, lstatSync, readdirSync, readlinkSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { hashValue } from "../hash.mjs";

// Exclusions from the protected set.
// Every entry is documented and verified against imagine-kit code and contracts.
export const EXCLUSIONS = [
  // 1. stage/edit/** - Shadow projects for scene-builder execution (all shots).
  // Verified in packages/imagine-kit/src/commands/stage-shot.mjs:102, packages/imagine-kit/src/commands/promote-shot.mjs:51, docs/contracts/source-formats.md:16.
  {
    name: "stage-edit",
    description: "stage/edit/**: scene-builder shadow workspaces for all shots",
    match: (rel) => rel === "stage/edit" || rel.startsWith("stage/edit/"),
  },
  // 2. stage/guard/** - Guard baseline snapshot storage.
  // Verified in packages/imagine-kit/src/commands/stage-shot.mjs:139, packages/imagine-kit/src/commands/promote-shot.mjs:167.
  {
    name: "stage-guard",
    description: "stage/guard/**: detective guard baseline files",
    match: (rel) => rel === "stage/guard" || rel.startsWith("stage/guard/"),
  },
  // 3. edit/compositions/** (except own shot) - Promoted compositions of other shots rewritten on promote.
  // Verified in packages/imagine-kit/src/commands/promote-shot.mjs:159.
  {
    name: "other-compositions",
    description: "edit/compositions/** (except own shot): other shots promoted compositions",
    match: (rel, shotId) => {
      if (!rel.startsWith("edit/compositions/")) return false;
      if (shotId && rel === `edit/compositions/${shotId}.html`) return false;
      return true;
    },
  },
  // 4. edit/index.motion.json - Merged root motion assertions, rewritten on promote-shot.
  // Verified in packages/imagine-kit/src/commands/promote-shot.mjs:161.
  {
    name: "root-motion",
    description: "edit/index.motion.json: merged motion assertions rewritten on promote-shot",
    match: (rel) => rel === "edit/index.motion.json",
  },
  // 5. project.yaml - Real project state file written by saveProject.
  // Verified in packages/imagine-kit/src/project.mjs:16, packages/imagine-kit/src/commands/promote-shot.mjs:166.
  {
    name: "project-state",
    description: "project.yaml: project state file written by saveProject in project.mjs",
    match: (rel) => rel === "project.yaml",
  },
  // 6. journal.md - Append-only project journal written by appendJournal.
  // Verified in packages/imagine-kit/src/journal.mjs:12, packages/imagine-kit/src/commands/stage-shot.mjs:142, packages/imagine-kit/src/commands/promote-shot.mjs:168.
  {
    name: "journal",
    description: "journal.md: append-only journal written by appendJournal in journal.mjs",
    match: (rel) => rel === "journal.md",
  },
  // 7. .lock - Exclusive project write lock directory used by withLock.
  // Verified in packages/imagine-kit/src/fsx.mjs:42.
  {
    name: "lock",
    description: ".lock: exclusive write lock directory used by withLock in fsx.mjs",
    match: (rel) => rel === ".lock" || rel.startsWith(".lock/"),
  },
  // 8. tmp/** (except tmp/scratch-vo/**) - Ephemeral working directory for audition, renders, img temp.
  // tmp/scratch-vo/** is preserved and hashed as a derivation input for scratch VO.
  // Verified in packages/imagine-kit/src/commands/new.mjs:10, packages/imagine-kit/src/commands/render.mjs:62, packages/imagine-kit/src/commands/img.mjs:69.
  {
    name: "tmp-except-scratch-vo",
    description: "tmp/** except tmp/scratch-vo/**: working files (audition, render, img temp)",
    match: (rel) => (rel === "tmp" || rel.startsWith("tmp/")) && rel !== "tmp/scratch-vo" && !rel.startsWith("tmp/scratch-vo/"),
  },
  // 9. Junk by pattern - OS metadata (.DS_Store, Thumbs.db), editor swap/backup (*~, .*.swp), and writeAtomic temp files (.<name>.tmp-<pid>-<hex>).
  // Verified in packages/imagine-kit/src/fsx.mjs:13 (atomic write temp files), OS/editor conventions.
  {
    name: "junk-patterns",
    description: "Junk files (.DS_Store, Thumbs.db, *~, .*.swp, atomic write temp files)",
    match: (rel) => {
      const base = basename(rel);
      if (base === ".DS_Store" || base === "Thumbs.db") return true;
      if (base.endsWith("~") || (base.startsWith(".") && base.endsWith(".swp")) || base.endsWith(".swp")) return true;
      if (/^\..*\.tmp-\d+-[0-9a-fA-F]+$/.test(base)) return true;
      if (/^.*\.tmp-\d+-[0-9a-fA-F]+$/.test(base)) return true;
      return false;
    },
  },
  // 10. VCS directories - Version control metadata (.git, .hg, .svn).
  // Verified as environment metadata.
  {
    name: "vcs-dirs",
    description: "VCS directories: .git, .hg, .svn",
    match: (rel) => rel.split("/").some((part) => [".git", ".hg", ".svn"].includes(part)),
  },
  // 11. node_modules - Dependency directories created by npm or tooling.
  // Verified as environment dependencies.
  {
    name: "node-modules",
    description: "node_modules/**: dependencies installed by npm or tooling",
    match: (rel) => rel.split("/").includes("node_modules"),
  },
  // 12. post/** - Final render outputs written by render.mjs.
  // Verified in packages/imagine-kit/src/commands/render.mjs:79, docs/contracts/source-formats.md:181.
  {
    name: "post-renders",
    description: "post/**: final render outputs written by render.mjs",
    match: (rel) => rel === "post" || rel.startsWith("post/"),
  },
  // 13. review/qc.json and single-level review/*.draft.mp4.
  // Verified in packages/imagine-kit/src/commands/qc.mjs:121 (review/qc.json),
  // packages/imagine-kit/src/commands/render.mjs:79 (review/<slug>.draft.mp4), docs/contracts/source-formats.md:181.
  // review/REVIEW.md (gate quotes) and nested files remain strictly protected.
  {
    name: "review-qc-draft",
    description: "review/qc.json and single-level review/*.draft.mp4: QC report and draft render outputs",
    match: (rel) => {
      if (rel === "review/qc.json") return true;
      if (rel.startsWith("review/")) {
        const sub = rel.slice(7);
        if (!sub.includes("/") && sub.endsWith(".draft.mp4")) return true;
      }
      return false;
    },
  },
];

export function isExcluded(rel, shotId) {
  for (const exclusion of EXCLUSIONS) {
    if (exclusion.match(rel, shotId)) return true;
  }
  return false;
}

export function baselinePath(dir, shotId) {
  return join(dir, "stage", "guard", `${shotId}.json`);
}

export function canonicalDigest(baselineDoc) {
  const shot = baselineDoc?.shot ?? null;
  const files = baselineDoc?.files ?? {};
  return hashValue({ shot, files });
}

function sha256Stream(path) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

export async function snapshotProtected(dir, shotId) {
  const files = {};

  async function walk(currentDir) {
    let entries;
    try {
      entries = readdirSync(currentDir, { withFileTypes: true });
    } catch (e) {
      if (e.code === "ENOENT" || e.code === "ENOTDIR") return;
      throw e;
    }

    for (const ent of entries) {
      const fullPath = join(currentDir, ent.name);
      const rel = relative(dir, fullPath).replace(/\\/g, "/");

      let st;
      try {
        st = lstatSync(fullPath);
      } catch (e) {
        if (e.code === "ENOENT") continue;
        throw e;
      }

      if (st.isSymbolicLink()) {
        // Never follow symlinks; do not descend into directory symlinks.
        if (!isExcluded(rel, shotId)) {
          files[rel] = `symlink:${readlinkSync(fullPath)}`;
        }
        continue;
      }

      if (st.isDirectory()) {
        // Check if directory itself is excluded and should not be traversed
        // Note: 'tmp' is excluded but tmp/scratch-vo is NOT, so we must traverse tmp.
        // For other directories, if it's excluded and has no sub-inclusions, we can skip it.
        if (isExcluded(rel, shotId) && rel !== "tmp" && !rel.startsWith("tmp")) {
          continue;
        }
        await walk(fullPath);
      } else if (st.isFile()) {
        if (!isExcluded(rel, shotId)) {
          files[rel] = await sha256Stream(fullPath);
        }
      }
    }
  }

  await walk(dir);

  // Own-shot composition: edit/compositions/<shotId>.html (hash, or "absent" when it does not exist yet)
  if (shotId) {
    const ownCompRel = `edit/compositions/${shotId}.html`;
    const ownCompPath = join(dir, ownCompRel);
    try {
      const st = lstatSync(ownCompPath);
      if (st.isSymbolicLink()) {
        files[ownCompRel] = `symlink:${readlinkSync(ownCompPath)}`;
      } else if (st.isFile()) {
        files[ownCompRel] = await sha256Stream(ownCompPath);
      } else {
        files[ownCompRel] = "absent";
      }
    } catch (e) {
      if (e.code === "ENOENT" || e.code === "ENOTDIR") {
        files[ownCompRel] = "absent";
      } else {
        throw e;
      }
    }
  }

  // Deterministic sorting of files object
  const sortedFiles = {};
  for (const k of Object.keys(files).sort()) {
    sortedFiles[k] = files[k];
  }

  return { shot: shotId, files: sortedFiles };
}

export function diffSnapshot(before, after) {
  const bFiles = before?.files ?? before ?? {};
  const aFiles = after?.files ?? after ?? {};

  const modified = [];
  const created = [];
  const deleted = [];

  const allKeys = new Set([...Object.keys(bFiles), ...Object.keys(aFiles)]);
  for (const p of allKeys) {
    const bVal = bFiles[p];
    const aVal = aFiles[p];

    if (bVal === undefined || bVal === "absent") {
      if (aVal !== undefined && aVal !== "absent") {
        created.push(p);
      }
    } else {
      if (aVal === undefined || aVal === "absent") {
        deleted.push(p);
      } else if (bVal !== aVal) {
        modified.push(p);
      }
    }
  }

  return {
    modified: modified.sort(),
    created: created.sort(),
    deleted: deleted.sort(),
  };
}
