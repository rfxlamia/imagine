import { err } from "../envelope.mjs";
import { UsageError } from "../errors.mjs";
import { deriveAll, reviewHints } from "../derive.mjs";
import { GATES, ancestors, gateItems, gateSatisfied, isBlankQuote, itemDeps, itemKind } from "../gates.mjs";
import { appendJournal } from "../journal.mjs";
import { resolveProject, saveProject } from "../project.mjs";
import { SUPERSEDED, createContext, resolveRef } from "../sources.mjs";

const USAGE = 'usage: gate <G0|G1|G2|G3|G4|G5r|G5a|G5b|G6|G7> approve|reject [--scope <id,…>] --quote "<user words>" [--note <text>]';

export default {
  locks: true,
  options: { scope: { type: "string" }, quote: { type: "string" }, note: { type: "string" } },
  async run({ values, positionals }, ctx) {
    const [gate, decision] = positionals;
    if (positionals.length !== 2 || !GATES.includes(gate) || !["approve", "reject"].includes(decision)) throw new UsageError(USAGE);
    const { dir, rel } = resolveProject(ctx.cwd, values.project);
    const quote = values.quote ?? "";
    if (isBlankQuote(quote)) {
      return { project: rel, code: "NEEDS_USER", data: { gate, decision },
        errors: [err("GATE-QUOTE", "NEEDS_USER", null, "a gate is recorded only after an explicit user answer: pass the user's verbatim words with --quote")] };
    }
    const sctx = createContext(dir);
    const { gates, items } = deriveAll(sctx);
    const blockers = ancestors(gate).filter((g) => !gateSatisfied(gates, g));
    if (blockers.length) {
      return { project: rel, data: { gate, decision },
        errors: blockers.map((g) => err("HARD-GATES-RECORDED", "HARD", g, `gate ${g} must be approved before ${gate} (state: ${gates[g].state})`)) };
    }
    const allowed = gateItems(gate, sctx);
    if (allowed.length === 0) throw new UsageError(`gate ${gate} has no items yet; nothing to ${decision}`);
    let ids = allowed;
    if (values.scope !== undefined) {
      const wanted = values.scope.split(",").map((s) => s.trim()).filter(Boolean);
      if (wanted.length === 0) throw new UsageError("--scope needs at least one item id");
      ids = [...new Set(wanted.map((w) => {
        const hit = allowed.filter((a) => a === w || a.slice(a.indexOf(":") + 1) === w);
        if (hit.length !== 1) throw new UsageError(`"${w}" is not an item of gate ${gate} (items: ${allowed.join(", ")})`);
        return hit[0];
      }))];
    }
    const at = ctx.now().toISOString();
    const errors = [];
    const records = {};
    for (const id of ids) {
      const inputs = {};
      for (const dep of itemDeps(id, sctx)) {
        const v = resolveRef(sctx, dep, undefined);
        if (v === null || v === SUPERSEDED) {
          errors.push(err("HARD-GATES-RECORDED", "HARD", id, `cannot record ${dep}: ${v === null ? "source not found" : "not the current version"}`));
          continue;
        }
        inputs[dep] = v === undefined ? "item" : v;
      }
      records[id] = { kind: itemKind(id), status: decision === "approve" ? "approved" : "rejected", gate,
        decision: { decision, quote, ...(values.note ? { note: values.note } : {}), at }, inputs };
    }
    if (errors.length) return { project: rel, data: { gate, decision }, errors };
    const project = sctx.project;
    Object.assign(project.items, records);
    if (gate === "G0") project.g0.status = decision === "approve" ? "approved" : "pending";
    saveProject(dir, project);
    const journal_id = appendJournal(dir, { command: "gate", summary: `${gate} ${decision} ${ids.join(",")} quote=${JSON.stringify(quote)}`, now: ctx.now() });
    const advice = gate === "G4" && decision === "approve"
      ? reviewHints(items).map((h) => ({ rule: "DAG-STALE-VS-REVIEW", item: h.item, source: "project.yaml watch",
        message: `watched sources changed since this item was recorded: ${h.sources.join(", ")}; confirm they are still true or redo the item` }))
      : [];
    return { project: rel, journal_id, advice, data: { gate, decision, items: ids.map((id) => ({ id, status: records[id].status })) } };
  },
};
