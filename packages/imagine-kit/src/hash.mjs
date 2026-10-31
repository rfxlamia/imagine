import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export const sha256 = (data) => createHash("sha256").update(data).digest("hex");
export const sha256File = (path) => sha256(readFileSync(path));

export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export const hashValue = (value) => sha256(canonical(value));
