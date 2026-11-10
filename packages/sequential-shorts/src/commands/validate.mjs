import { UsageError } from "../errors.mjs";
import { validatePlanFile } from "../plan/validate.mjs";

export const validateCommand = {
  usage: "validate --plan <dir>/plan.json   validate an (edited) plan without rendering",
  options: { plan: { type: "string" } },
  async run(values, ctx) {
    if (!values.plan) throw new UsageError("--plan is required");
    const r = await validatePlanFile(ctx, values.plan);
    const data = { plan: r.planPath, parts: r.plan.parts?.length ?? 0, valid: r.errors.length === 0 };
    return r.errors.length ? { code: "HARD", data, errors: r.errors, warnings: r.warnings } : { data, warnings: r.warnings };
  },
};
