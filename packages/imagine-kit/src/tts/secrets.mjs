import { lstatSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { KitError } from "../errors.mjs";

export function redact(text, secret) {
  const str = String(text ?? "");
  if (!secret) return str;
  const s = String(secret);
  if (!s) return str;
  return str.split(s).join("[redacted]");
}

export function loadElevenLabsKey(ctx) {
  const env = ctx?.env ?? process.env;
  if (typeof env.ELEVENLABS_API_KEY === "string" && env.ELEVENLABS_API_KEY.trim()) {
    return env.ELEVENLABS_API_KEY.trim();
  }
  const home = env.HOME ?? homedir();
  const keyPath = join(home, ".config", "elevenlabs", "key");
  let st;
  try {
    st = lstatSync(keyPath);
  } catch (err) {
    if (err && (err.code === "ENOENT" || err.code === "ENOTDIR")) {
      throw new KitError("NEEDS_USER", "no ElevenLabs API key: set ELEVENLABS_API_KEY or write the key to ~/.config/elevenlabs/key with mode 600", { rule: "HARD-SECRET-NEVER-WRITTEN" });
    }
    throw err;
  }
  if (!st.isFile() || (st.mode & 0o077) !== 0) {
    throw new KitError("NEEDS_USER", "ElevenLabs API key file must be a regular file with mode 600: chmod 600 ~/.config/elevenlabs/key", { rule: "HARD-SECRET-NEVER-WRITTEN" });
  }
  const content = readFileSync(keyPath, "utf8").trim();
  if (!content) {
    throw new KitError("NEEDS_USER", "no ElevenLabs API key: ~/.config/elevenlabs/key is empty", { rule: "HARD-SECRET-NEVER-WRITTEN" });
  }
  return content;
}
