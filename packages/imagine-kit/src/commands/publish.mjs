import { UsageError } from "../errors.mjs";
import { publishPlatform } from "../delivery.mjs";
import { resolveProject } from "../project.mjs";

// Publishes a file to a platform only with a matching publication Consent_Record (Requirements 12.2-12.5).
export default {
  locks: true,
  options: { platform: { type: "string" }, file: { type: "string" } },
  async run({ values }, ctx) {
    if (!values.platform || !values.file) throw new UsageError("usage: publish --platform <name> --file <path>");
    const { dir, rel } = resolveProject(ctx.cwd, values.project);
    const r = publishPlatform(dir, { platform: values.platform, file: values.file, now: ctx.now() });
    return { project: rel, errors: r.errors, journal_id: r.journal_id ?? null,
      data: r.published ? { published: true, platform: r.platform, fileHash: r.fileHash } : { published: false } };
  },
};
