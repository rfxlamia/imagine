import { err } from "../envelope.mjs";
import { deriveAll, reviewHints } from "../derive.mjs";
import { renderStyleOutput } from "../docs.mjs";
import { resolveProject } from "../project.mjs";
import { isBlankQuote } from "../gates.mjs";
import { createContext, enumerateSources, resolveRef } from "../sources.mjs";
import { checkStoryIntegrity } from "../story/commit.mjs";

export default {
  options: { item: { type: "string" }, ref: { type: "string" } },
  async run({ values }, ctx) {
    const { dir, rel } = resolveProject(ctx.cwd, values.project);
    const sctx = createContext(dir);
    const project = sctx.project;
    const errors = [];
    const integrity = checkStoryIntegrity(dir);
    if (!integrity.ok) errors.push(err("HARD-STORY-WRITERS", "KEY_NOT_OWNED", null, "STORY.md was changed outside patch apply", integrity.reason));
    if (sctx.style.output !== renderStyleOutput(project.g0)) {
      errors.push(err("HARD-STYLE-OUTPUT-READONLY", "HARD", "style:output", "style.md#output differs from the text generated from G0"));
    }
    for (const [id, rec] of Object.entries(project.items)) {
      if (rec.status === "approved" && isBlankQuote(rec.decision?.quote)) {
        errors.push(err("HARD-GATES-RECORDED", "HARD", id, "approved item has no recorded user quote"));
      }
    }
    const { items, gates, stage } = deriveAll(sctx);
    const sources = enumerateSources(sctx);
    const unresolved = [];
    for (const spec of (values.ref ?? "").split(",").map((s) => s.trim()).filter(Boolean)) {
      const [ref, label] = spec.split("=");
      const v = resolveRef(sctx, ref, label ? `${label}:` : undefined);
      if (v === null || v === undefined) unresolved.push(spec);
      else sources[ref] = v;
    }
    const decisions = Object.entries(project.items).filter(([, r]) => r.decision)
      .map(([item, r]) => ({ item, gate: r.gate ?? null, decision: r.decision.decision, quote: r.decision.quote, at: r.decision.at }));
    return { project: rel, errors,
      data: { stage, gates, items: values.item ? items.filter((i) => i.id === values.item) : items, blocked: project.blocked, sources, unresolved,
        decisions, review_hints: reviewHints(items) } };
  },
};
