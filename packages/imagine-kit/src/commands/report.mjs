import { generateQualityReport, renderQualityReport } from "../quality-report.mjs";
import { resolveProject } from "../project.mjs";

// `report [--scope <id,…>]` builds the quality report from Evidence_Records only. Read-only (Requirements 2.6, 5.6, 10.7).
export default {
  options: { scope: { type: "string" } },
  async run({ values }, ctx) {
    const { dir, rel } = resolveProject(ctx.cwd, values.project);
    const scope = values.scope === undefined ? undefined : values.scope.split(",").map((s) => s.trim()).filter(Boolean);
    const report = generateQualityReport(dir, { scope });
    return { project: rel, errors: [], data: { report, markdown: renderQualityReport(report) } };
  },
};
