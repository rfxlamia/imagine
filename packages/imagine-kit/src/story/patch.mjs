import { err } from "../envelope.mjs";
import { normalizeValue } from "./keys.mjs";

export const STALE_KINDS = { storyboard: [], previz: ["unit", "clock", "style", "asset"], fx: ["style", "clock", "asset"] };
const STYLE_FOR_KEY = { camera: "camera", parallax: "camera", motion: "motion", transition_in: "motion", fx: "texture", grade: "texture", overlays: "texture", fx_notes: "texture" };
const MULTILINE = /[\r\n]/;

// shot id -> Set of source references the ops of that shot rely on (source-formats.md section 9)
export function requiredRefs(ops) {
  const byShot = new Map();
  const add = (shot, ref) => {
    if (!byShot.has(shot)) byShot.set(shot, new Set());
    byShot.get(shot).add(ref);
  };
  for (const op of ops) {
    const shot = op.shot ?? op.create_shot?.id;
    if (!shot) continue;
    const set = (op.create_shot ? op.create_shot.set : op.set) ?? {};
    const reasons = (op.create_shot ? op.create_shot.reasons : op.reasons) ?? {};
    for (const [k, v] of Object.entries(set)) {
      if (STYLE_FOR_KEY[k]) add(shot, `style:${STYLE_FOR_KEY[k]}`);
      if (k === "characters" || k === "location" || k === "voiceover") {
        const n = normalizeValue(k, v);
        if (n.error) continue;
        if (k === "characters") n.value.forEach((id) => add(shot, `bible:characters.${id}`));
        if (k === "location") add(shot, `bible:locations.${n.value}`);
        if (k === "voiceover") n.value.forEach((x) => add(shot, `unit:${x.unit}`));
      }
    }
    for (const text of Object.values(reasons)) for (const m of String(text).matchAll(/style\.md#([a-z][a-z0-9-]*)/g)) add(shot, `style:${m[1]}`);
  }
  return byShot;
}

function narrativeOf(v) {
  if (typeof v !== "string") return { error: "narrative must be text" };
  const text = v.trim();
  return /^#{1,3}\s/m.test(text) ? { error: "narrative must not contain headings" } : { text };
}

export function applyOps(story, patch) {
  const shots = story.shots.map((s) => ({ ...s, keys: { ...s.keys } }));
  const errors = [];
  const touched = new Set();
  const removed = new Set();
  const fail = (item, message) => errors.push(err("HARD-PATCH-KEYS", "HARD", item, message));
  const find = (id) => shots.find((s) => s.id === id);
  const apply = (shot, set) => {
    for (const [k, v] of Object.entries(set)) {
      if (k === "id") fail(shot.id, "shot ids are immutable: use create_shot or remove_shot");
      else if (k === "title") {
        const t = typeof v === "string" ? v.trim() : "";
        if (!t || MULTILINE.test(t)) fail(shot.id, "title must be a non-empty single line");
        else shot.title = t;
      } else if (k === "narrative") {
        const n = narrativeOf(v);
        if (n.error) fail(shot.id, n.error);
        else shot.narrative = n.text;
      } else {
        const n = normalizeValue(k, v);
        if (n.error) fail(shot.id, n.error);
        else shot.keys[k] = n.raw;
      }
    }
    touched.add(shot.id);
  };
  for (const op of patch.ops) {
    if (op.create_shot) {
      const c = op.create_shot;
      const title = String(c.title ?? "").trim();
      const narrative = narrativeOf(c.narrative ?? "");
      if (find(c.id)) { fail(c.id, `shot ${c.id} already exists`); continue; }
      if (!title || MULTILINE.test(title)) { fail(c.id, "title must be a non-empty single line"); continue; }
      if (narrative.error) { fail(c.id, narrative.error); continue; }
      let index = 0;
      if (c.after !== null) {
        const at = shots.findIndex((s) => s.id === c.after);
        if (at < 0) { fail(c.id, `after: ${c.after} does not exist`); continue; }
        index = at + 1;
      }
      const shot = { id: c.id, title, keys: {}, narrative: narrative.text, line: 0 };
      shots.splice(index, 0, shot);
      apply(shot, c.set ?? {});
    } else if (op.remove_shot) {
      const at = shots.findIndex((s) => s.id === op.remove_shot);
      if (at < 0) fail(op.remove_shot, `shot ${op.remove_shot} does not exist`);
      else { shots.splice(at, 1); removed.add(op.remove_shot); touched.delete(op.remove_shot); }
    } else if (op.reorder) {
      const now = shots.map((s) => s.id);
      const same = op.reorder.length === now.length && new Set(op.reorder).size === now.length && op.reorder.every((id) => now.includes(id));
      if (!same) fail(null, "reorder must list every current shot id exactly once");
      else shots.splice(0, shots.length, ...op.reorder.map(find));
    } else {
      const s = find(op.shot);
      if (!s) fail(op.shot, `shot ${op.shot} does not exist`);
      else apply(s, op.set);
    }
  }
  return { shots, touched, removed, errors };
}
