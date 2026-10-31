import newCmd from "./new.mjs";
import status from "./status.mjs";
import { resolveProject, loadProject, saveProject } from "../project.mjs";
import { isBlankQuote } from "../gates.mjs";
import { appendJournal } from "../journal.mjs";

const gate = {
  locks: true,
  options: { quote: { type: "string" }, note: { type: "string" }, scope: { type: "string" } },
  async run({ values, positionals }, ctx) {
    const { dir, rel } = resolveProject(ctx.cwd, values.project);
    const [gateName, decision] = positionals;
    if (isBlankQuote(values.quote)) {
      return { project: rel, code: "NEEDS_USER", errors: [{ rule: "GATE-QUOTE", code: "NEEDS_USER", item: gateName, message: "quote is required" }] };
    }
    const project = loadProject(dir);
    if (gateName === "G0") {
      project.items.g0 = {
        kind: "g0",
        status: decision === "approve" ? "approved" : "rejected",
        gate: "G0",
        decision: { decision, quote: values.quote, at: ctx.now().toISOString() },
        inputs: {},
      };
      saveProject(dir, project);
      const journal_id = appendJournal(dir, { command: `gate G0 ${decision}`, summary: `${decision} G0 with quote "${values.quote}"`, now: ctx.now() });
      return { project: rel, data: { gate: gateName, decision, items: ["g0"] }, journal_id };
    }
    return { project: rel, data: { gate: gateName, decision, items: [] } };
  },
};

export const COMMANDS = { new: newCmd, status, gate };
