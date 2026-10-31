import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { writeAtomic } from "./fsx.mjs";

const clean = (s) => String(s).replace(/\s+/g, " ").trim();

export function appendJournal(dir, { command, summary, now }) {
  const file = join(dir, "journal.md");
  if (!existsSync(file)) writeAtomic(file, "# Journal\n\n");
  let last = 0;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^- j-(\d{6}) /);
    if (m) last = Math.max(last, Number(m[1]));
  }
  const id = `j-${String(last + 1).padStart(6, "0")}`;
  appendFileSync(file, `- ${id} ${now.toISOString()} ${command}: ${clean(summary)}\n`);
  return id;
}
