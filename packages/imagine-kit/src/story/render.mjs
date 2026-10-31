import YAML from "yaml";
import { KEY_ORDER } from "./keys.mjs";

export function renderStory({ front, shots }) {
  const out = ["---", YAML.stringify(front, { lineWidth: 0 }).trimEnd(), "---", ""];
  for (const s of shots) {
    out.push(`## Scene ${s.id} — ${s.title}`);
    for (const k of KEY_ORDER) if (Object.hasOwn(s.keys, k)) out.push(`- ${k}: ${s.keys[k]}`);
    out.push("");
    if (s.narrative) out.push(s.narrative, "");
  }
  return `${out.join("\n").replace(/\n+$/, "")}\n`;
}
