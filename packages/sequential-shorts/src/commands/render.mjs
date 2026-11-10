import { UsageError } from "../errors.mjs";
import { renderFromPlan } from "./render-core.mjs";

export const renderCommand = {
  usage: "render --plan <dir>/plan.json [--replace]   validate an (edited) plan, re-check the source hash, render, QC",
  options: { plan: { type: "string" }, replace: { type: "boolean" } },
  async run(values, ctx) {
    if (!values.plan) throw new UsageError("--plan is required");
    return renderFromPlan(ctx, { planPath: values.plan, replace: Boolean(values.replace) });
  },
};
