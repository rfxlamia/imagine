import { UsageError } from "../errors.mjs";
import { beginRepair } from "../repair.mjs";
import { resolveProject } from "../project.mjs";

// `repair <item> --class <error class> [--strategy <id>]` starts the next Auto_Repair attempt (Requirements 7.1-7.10).
// The kit counts attempts against the Repair_Budget, picks an untried strategy, and escalates to needs_input when the budget is spent.
export default {
  locks: true,
  options: { class: { type: "string" }, strategy: { type: "string" } },
  async run({ values, positionals }, ctx) {
    if (positionals.length !== 1 || !values.class) throw new UsageError("usage: repair <item-id> --class <error-class> [--strategy <id>]");
    const { dir, rel } = resolveProject(ctx.cwd, values.project);
    const r = beginRepair(dir, positionals[0], values.class, { now: ctx.now(), strategy: values.strategy });
    const blocked = r.errors.some((e) => e.code === "NEEDS_USER");
    const code = r.escalated ? "NEEDS_USER" : blocked ? "NEEDS_USER" : undefined;
    return { project: rel, ...(code ? { code } : {}), errors: r.errors, journal_id: r.journal_id ?? null,
      data: r.escalated
        ? { item: positionals[0], class: values.class, escalated: true, state: r.state, failing_evidence: r.failingEvidence, strategies_tried: r.strategiesTried }
        : { item: positionals[0], class: values.class, escalated: false, strategy: r.strategy ?? null, attempts: r.attempts ?? null, scope: r.scope ?? null } };
  },
};
