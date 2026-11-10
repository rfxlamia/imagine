import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

export function writeFileAtomic(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = join(dirname(path), `.${basename(path)}.${process.pid}.tmp`);
  writeFileSync(tmp, data);
  renameSync(tmp, path);
}

export const writeJsonAtomic = (path, value) => writeFileAtomic(path, `${JSON.stringify(value, null, 2)}\n`);
export const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
export const readJsonIfExists = (path) => (existsSync(path) ? readJson(path) : null);
export const round6 = (x) => Math.round(x * 1e6) / 1e6;
