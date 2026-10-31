#!/usr/bin/env node
// PreToolUse entry point. Always runs main() (an argv/import.meta guard failed
// open under symlinked plugin paths). Any load or runtime failure exits 2 so
// Claude Code blocks the call instead of treating it as a non-blocking error.
try {
  const { main } = await import("./scene-builder-scope-lib.mjs");
  main();
} catch (e) {
  process.stderr.write(`scene-builder-scope: hook failed (${e?.message ?? e}); blocked\n`);
  process.exitCode = 2;
}
