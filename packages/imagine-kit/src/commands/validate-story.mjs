import { err } from "../envelope.mjs";
import { UsageError } from "../errors.mjs";
import { resolveProject } from "../project.mjs";
import { createContext } from "../sources.mjs";
import { checkStoryIntegrity } from "../story/commit.mjs";
import { inputsFrom, validateStory } from "../story/validate.mjs";

export default {
  options: { stage: { type: "string" } },
  async run({ values }, ctx) {
    const { dir, rel } = resolveProject(ctx.cwd, values.project);
    if (values.stage !== undefined && !["storyboard", "previz", "fx"].includes(values.stage)) throw new UsageError("--stage must be storyboard, previz or fx");
    const sctx = createContext(dir);
    const errors = [];
    const integrity = checkStoryIntegrity(dir);
    if (!integrity.ok) {
      errors.push(err("HARD-STORY-WRITERS", "KEY_NOT_OWNED", null, "STORY.md was changed outside patch apply", integrity.reason));
      if (integrity.reason === "STORY.md is missing") {
        return { project: rel, errors, data: { target: "story", checked: [] } };
      }
    }
    if (sctx.story.errors.length) {
      for (const e of sctx.story.errors) errors.push(err("HARD-STORY-IDS", "HARD", null, `STORY.md line ${e.line}: ${e.message}`));
      return { project: rel, errors, data: { target: "story", checked: [] } };
    }
    const result = validateStory(inputsFrom(sctx, values.stage));
    return { project: rel, errors: [...errors, ...result.errors], advice: result.advice, not_run: result.not_run, data: { target: "story", checked: result.checked } };
  },
};
