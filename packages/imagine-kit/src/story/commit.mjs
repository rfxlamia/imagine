import { existsSync } from "node:fs";
import { join } from "node:path";
import { sha256 } from "../hash.mjs";
import { readText, writeAtomic } from "../fsx.mjs";
import { parseStory } from "./parse.mjs";
import { renderStory } from "./render.mjs";

export const storyPath = (dir) => join(dir, "STORY.md");
export const historyPath = (dir, rev) => join(dir, ".history", `STORY.r${rev}.md`);

export function checkStoryIntegrity(dir) {
  if (!existsSync(storyPath(dir))) return { ok: false, reason: "STORY.md is missing" };
  const text = readText(storyPath(dir));
  const parsed = parseStory(text);
  const rev = parsed.front?.imagine_rev;
  if (!Number.isInteger(rev)) return { ok: false, reason: `STORY.md has no readable revision: ${parsed.errors[0]?.message ?? "unknown"}` };
  if (!existsSync(historyPath(dir, rev))) return { ok: false, rev, reason: `.history/STORY.r${rev}.md is missing` };
  if (sha256(readText(historyPath(dir, rev))) !== sha256(text)) {
    return { ok: false, rev, reason: `STORY.md differs from .history/STORY.r${rev}.md; it was edited outside patch apply` };
  }
  return { ok: true, rev, text, parsed };
}

// Order: history snapshot, between() (the caller writes project.yaml), then the STORY.md rename (the commit point).
export function commitStory({ dir, front, shots, between, hooks = {} }) {
  const text = renderStory({ front, shots });
  writeAtomic(historyPath(dir, front.imagine_rev), text);
  between?.();
  writeAtomic(storyPath(dir), text, { beforeRename: hooks.beforeStoryRename });
  return { sha256: sha256(text), text };
}
