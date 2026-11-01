import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { approveThrough, cliWith, makeProject, put, seedCanon } from "./fixture.mjs";

export const PLAN = {
  assets: [
    { id: "mara-ref", kind: "ref", prompt: "Mara, grey braid, lighthouse keeper, full body", framing: "full body, neutral background", size: "1024x1536" },
    { id: "lamp-ref", kind: "ref", prompt: "The lighthouse lamp, close detail", framing: "close-up", size: "1024x1024" },
    { id: "hero", kind: "img", prompt: "Mara climbing the stairs", framing: "medium shot, camera low", size: "1536x1024", refs: ["mara-ref"], required_px: { w: 2172, h: 1188 } },
    { id: "bg", kind: "img", prompt: "Empty stairwell", framing: "wide", size: "1536x1024", required_px: { w: 1536, h: 1024 } },
  ],
};
export const FAKE_CODEX = fileURLToPath(new URL("../fakes/codex.mjs", import.meta.url));

// A narrated project with plan.yaml written before G4 (it is hashed into g4) and G4 approved.
export async function imgProject(plan = PLAN) {
  const p = await makeProject();
  seedCanon(p.dir);
  put(p.dir, "assets/plan.yaml", YAML.stringify(plan));
  await approveThrough(p.cwd, "G4");
  const home = mkdtempSync(join(tmpdir(), "imagine-codex-home-"));
  const log = join(home, "calls.jsonl");
  const ctxFor = (env = {}) => ({ tools: { codex: [process.execPath, FAKE_CODEX] },
    env: { ...process.env, CODEX_HOME: home, FAKE_CODEX_LOG: log, ...env } });
  const run = (env, ...args) => cliWith(p.cwd, ctxFor(env), ...args);
  const calls = () => (existsSync(log) ? readFileSync(log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
  return { ...p, home, run, calls, ctxFor };
}
