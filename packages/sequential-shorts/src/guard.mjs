import { existsSync, readdirSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { ShortsError } from "./errors.mjs";
import { sha256File } from "./run/hash.mjs";

// Realpath of the longest existing prefix plus the not-yet-existing rest, so symlinks cannot hide where output lands.
export function resolveLoose(p) {
  let head = resolve(p);
  const rest = [];
  while (!existsSync(head)) {
    const up = dirname(head);
    if (up === head) break;
    rest.unshift(basename(head));
    head = up;
  }
  return join(realpathSync(head), ...rest);
}

export function imagineProjectOf(abs) {
  const parts = abs.split(sep);
  const i = parts.lastIndexOf(".imagine");
  if (i === -1 || i + 1 >= parts.length || !parts[i + 1]) return null;
  return { root: parts.slice(0, i + 2).join(sep), project: parts[i + 1], rel: parts.slice(i + 2).join(sep) };
}

const within = (child, parent) => {
  const r = relative(parent, child);
  return r === "" || (!r.startsWith("..") && !isAbsolute(r));
};

// Spec section 4.2.
export function checkOutputDir(input, output) {
  const inAbs = resolveLoose(input);
  const outAbs = resolveLoose(output);
  if (outAbs === dirname(inAbs)) {
    throw new ShortsError("HARD", "--output must not be the input's directory", { check: "write-boundary", item: outAbs });
  }
  const proj = imagineProjectOf(outAbs);
  if (proj && !within(outAbs, join(proj.root, "tmp"))) {
    throw new ShortsError("HARD", `--output resolves inside Imagine project ${proj.project}; use a path outside it or under ${join(proj.root, "tmp")}`, { check: "write-boundary", item: outAbs });
  }
  return { input: inAbs, output: outAbs };
}

export function findImagineProject(input) {
  const proj = imagineProjectOf(resolveLoose(input));
  return proj && existsSync(join(proj.root, "project.yaml")) ? proj.root : null;
}

function filesUnder(dir, base) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) out.push(...filesUnder(abs, base));
    else out.push(relative(base, abs).split(sep).join("/"));
  }
  return out;
}

export async function hashImagineRecords(root) {
  const rels = [...["project.yaml", "journal.md"].filter((f) => existsSync(join(root, f))), ...filesUnder(join(root, "review"), root)];
  const files = {};
  for (const rel of rels) files[rel] = await sha256File(join(root, rel));
  return { root, files };
}

export function diffRecords(before, after) {
  const names = [...new Set([...Object.keys(before.files), ...Object.keys(after.files)])].sort();
  return names.filter((f) => before.files[f] !== after.files[f]).map((file) => ({ file, before: before.files[file] ?? null, after: after.files[file] ?? null }));
}
