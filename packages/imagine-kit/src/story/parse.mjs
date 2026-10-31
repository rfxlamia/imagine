import YAML from "yaml";
import { KEY_ORDER } from "./keys.mjs";

const SCENE_RE = /^## Scene (s\d{2}) — (\S.*)$/;
const HEADING_RE = /^#{1,3}\s/;
const BULLET_RE = /^- ([a-z_]+): (.*)$/;

export function parseStory(text) {
  const errors = [];
  const fail = (line, message) => errors.push({ line, message });
  const lines = text.split("\n");
  let i = 0;
  let front = null;
  if (lines[0] === "---") {
    const end = lines.indexOf("---", 1);
    if (end < 0) fail(1, "frontmatter is not closed");
    else {
      try { front = YAML.parse(lines.slice(1, end).join("\n"), { maxAliasCount: 0 }); } catch (e) { fail(1, `frontmatter is not valid YAML: ${e.message}`); }
      i = end + 1;
    }
  } else fail(1, "STORY.md must start with a frontmatter block");
  if (front !== null && (typeof front !== "object" || Array.isArray(front) || !Number.isInteger(front.imagine_rev) || front.imagine_rev < 0)) {
    fail(1, "frontmatter needs an integer imagine_rev >= 0");
    front = null;
  }
  const shots = [];
  let cur = null;
  let mode = "bullets";
  const flush = () => {
    if (!cur) return;
    cur.narrative = cur.narr.join("\n").trim();
    delete cur.narr;
    shots.push(cur);
  };
  for (; i < lines.length; i += 1) {
    const line = lines[i];
    const n = i + 1;
    if (HEADING_RE.test(line)) {
      const m = line.match(SCENE_RE);
      if (!m) { fail(n, `unrecognised heading (only "## Scene sNN — Title" is allowed): ${line}`); continue; }
      flush();
      cur = { id: m[1], title: m[2].trim(), keys: {}, narr: [], line: n };
      mode = "bullets";
      continue;
    }
    if (!cur) {
      if (line.trim() !== "") fail(n, "content before the first scene heading");
      continue;
    }
    if (mode === "bullets") {
      const b = line.match(BULLET_RE);
      if (b) {
        const key = b[1];
        if (key === "id" || key === "title") fail(n, `"${key}" lives in the heading, not in a bullet`);
        else if (!KEY_ORDER.includes(key)) fail(n, `unknown key "${key}"`);
        else if (Object.hasOwn(cur.keys, key)) fail(n, `duplicate key "${key}" in ${cur.id}`);
        else if (b[2].trim() === "") fail(n, `empty value for "${key}"`);
        else cur.keys[key] = b[2].trim();
        continue;
      }
      mode = "narrative";
    }
    cur.narr.push(line);
  }
  flush();
  return { front, shots, errors };
}
