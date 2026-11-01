import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, rmdirSync, statSync, unlinkSync, writeSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { basename, dirname, join } from "node:path";
import YAML from "yaml";
import { KitError } from "./errors.mjs";

export function writeAtomic(path, text, hooks = {}) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = join(dirname(path), `.${basename(path)}.tmp-${process.pid}-${randomBytes(4).toString("hex")}`);
  const fd = openSync(tmp, "wx");
  try {
    writeSync(fd, text);
    fsyncSync(fd);
  } catch (e) {
    closeSync(fd);
    try { unlinkSync(tmp); } catch { /* already gone */ }
    throw e;
  }
  closeSync(fd);
  try {
    hooks.beforeRename?.(path);
    renameSync(tmp, path);
  } catch (e) {
    try { unlinkSync(tmp); } catch { /* already gone */ }
    throw e;
  }
  try {
    const dfd = openSync(dirname(path), "r");
    try {
      fsyncSync(dfd);
    } finally {
      closeSync(dfd);
    }
  } catch (e) {
    if (!["EISDIR", "EPERM", "EACCES", "EINVAL", "ENOTSUP"].includes(e.code)) throw e;
  }
}

// Fail-fast exclusive project write lock (a directory, so creation is atomic). A lock older than staleMs is treated as left by a dead process.
export async function withLock(dir, fn, staleMs = 30000) {
  const lock = join(dir, ".lock");
  const busy = () => new KitError("LOCKED", "another imagine-kit command is writing this project (.lock); retry in a moment", { rule: "PROC-LOCK-HASHED-WRITES" });
  try {
    mkdirSync(lock);
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
    let age = 0;
    try { age = Date.now() - statSync(lock).mtimeMs; } catch { /* released meanwhile */ }
    if (age <= staleMs) throw busy();
    try { rmdirSync(lock); mkdirSync(lock); } catch { throw busy(); }
  }
  try {
    return await fn();
  } finally {
    try { rmdirSync(lock); } catch { /* already gone */ }
  }
}

export const readText = (path) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
export const readYaml = (path) => YAML.parse(readText(path), { maxAliasCount: 0 });
export const toYaml = (value) => YAML.stringify(value, { lineWidth: 0 });
export const writeYamlAtomic = (path, value, hooks) => writeAtomic(path, toYaml(value), hooks);
