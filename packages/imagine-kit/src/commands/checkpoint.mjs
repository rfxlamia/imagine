import { err } from "../envelope.mjs";
import { UsageError } from "../errors.mjs";
import { CHECKPOINT_IDS, loadCheckpointView, resolveCheckpoint, runCheckpoint } from "../checkpoints.mjs";
import { updateDelivery } from "../delivery.mjs";
import { mapReviewResponse } from "../evaluators.mjs";
import { isAbsolute, join } from "node:path";
import { promoteCheckpoint } from "../promotion.mjs";
import { resolveProject } from "../project.mjs";

const REVIEWED = ["visual-continuity", "visual-review"]; // Checks that need a reviewer, not a validator
const USAGE = `usage: checkpoint <${CHECKPOINT_IDS.join("|")}> run [--scope <id,…>] [--mp4 <file>] [--mix <file>] | checkpoint <${CHECKPOINT_IDS.join("|")}> review --check <id> --response <json>`;

// `checkpoint Q1|Q2|Q3 run` runs every Check of the Checkpoint and reports the aggregate state (Requirements 6.6, 6.8).
// Evidence_Records are written by runCheckpoint, hence `locks: true`.
export default {
  locks: true,
  options: { scope: { type: "string" }, mp4: { type: "string" }, mix: { type: "string" }, check: { type: "string" }, response: { type: "string" } },
  async run({ values, positionals }, ctx) {
    const [id, verb] = positionals;
    const { dir, rel } = resolveProject(ctx.cwd, values.project);
    if (positionals.length !== 2 || !["run", "review"].includes(verb) || !resolveCheckpoint(id)) throw new UsageError(USAGE);
    const cp = resolveCheckpoint(id);
    const file = (p) => (p === undefined ? null : isAbsolute(p) ? p : join(dir, p));
    const scope = values.scope === undefined ? [] : values.scope.split(",").map((s) => s.trim()).filter(Boolean);
    if (values.scope !== undefined && scope.length === 0) throw new UsageError("--scope needs at least one item id");
    // A reviewer's answer (the continuity-reviewer or visual-review agent) is submitted as JSON and mapped to one Evidence_Record.
    // The mapping never passes a review without inspected files and verified coverage (mapReviewResponse).
    let extra = {};
    if (verb === "review") {
      const judged = cp.checks.filter((c) => REVIEWED.includes(c.id));
      const check = judged.find((c) => c.id === values.check);
      if (!check) throw new UsageError(`--check must be one of: ${judged.map((c) => c.id).join(", ") || "(none; this checkpoint has no reviewed checks)"}`);
      let resp;
      try { resp = JSON.parse(values.response ?? ""); } catch { throw new UsageError("--response must be the reviewer's JSON answer"); }
      extra = { only: [check.id], evaluators: { [check.id]: async () => mapReviewResponse(check.id, check.evaluator, resp) } };
    }
    const r = await runCheckpoint(dir, id, { ctx, now: ctx.now(), scope, mp4: file(values.mp4), mix: file(values.mix), ...extra });
    // A passed, unscoped Checkpoint replaces the user's approval of the gates it covers (promotion.mjs).
    const promotion = loadCheckpointView(dir, r.checkpoint).state === "passed" ? promoteCheckpoint(dir, r.checkpoint, { now: ctx.now() }) : null;
    // Q3 is the last Checkpoint: move delivery:film to ready when every shot passed, or back to pending.
    const delivery = r.checkpoint === "Q3" ? updateDelivery(dir, { now: ctx.now() }) : null;
    const errors = [...r.checks.flatMap((c) => [...c.errors, ...c.evidenceErrors]), ...(promotion?.errors ?? [])];
    const not_run = r.checks.filter((c) => c.not_run).map((c) => ({ rule: c.checkId, cause: c.not_run }));
    if (r.state === "failed" && errors.length === 0) {
      errors.push(err("CHECKPOINT-FAILED", "HARD", r.itemId, `${r.checkpoint} failed`));
    }
    return {
      project: rel, errors, not_run,
      journal_id: r.checks.map((c) => c.journal_id).filter(Boolean).at(-1) ?? null,
      data: { recorded: promotion?.promoted ?? [], not_recorded: promotion?.skipped ?? [], delivery: delivery?.state ?? null, checkpoint: r.checkpoint, item: r.itemId, state: r.state, scope,
        checks: r.checks.map((c) => ({ checkId: c.checkId, result: c.result, errors: c.errors.length, not_run: c.not_run, proposal: c.proposal })) },
    };
  },
};
