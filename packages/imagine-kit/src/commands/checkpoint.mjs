import { err } from "../envelope.mjs";
import { UsageError } from "../errors.mjs";
import { CHECKPOINT_IDS, resolveCheckpoint, runCheckpoint } from "../checkpoints.mjs";
import { resolveProject } from "../project.mjs";

const USAGE = `usage: checkpoint <${CHECKPOINT_IDS.join("|")}> run [--scope <id,…>]`;

// `checkpoint Q1|Q2|Q3 run` runs every Check of the Checkpoint and reports the aggregate state (Requirements 6.6, 6.8).
// Evidence_Records are written by runCheckpoint, hence `locks: true`.
export default {
  locks: true,
  options: { scope: { type: "string" } },
  async run({ values, positionals }, ctx) {
    const [id, verb] = positionals;
    if (positionals.length !== 2 || verb !== "run" || !resolveCheckpoint(id)) throw new UsageError(USAGE);
    const scope = values.scope === undefined ? [] : values.scope.split(",").map((s) => s.trim()).filter(Boolean);
    if (values.scope !== undefined && scope.length === 0) throw new UsageError("--scope needs at least one item id");
    const { dir, rel } = resolveProject(ctx.cwd, values.project);
    const r = await runCheckpoint(dir, id, { ctx, now: ctx.now(), scope });
    const errors = r.checks.flatMap((c) => [...c.errors, ...c.evidenceErrors]);
    const not_run = r.checks.filter((c) => c.not_run).map((c) => ({ rule: c.checkId, cause: c.not_run }));
    if (r.state === "failed" && errors.length === 0) {
      errors.push(err("CHECKPOINT-FAILED", "HARD", r.itemId, `${r.checkpoint} failed`));
    }
    return {
      project: rel, errors, not_run,
      journal_id: r.checks.map((c) => c.journal_id).filter(Boolean).at(-1) ?? null,
      data: { checkpoint: r.checkpoint, item: r.itemId, state: r.state, scope,
        checks: r.checks.map((c) => ({ checkId: c.checkId, result: c.result, errors: c.errors.length, not_run: c.not_run, proposal: c.proposal })) },
    };
  },
};
