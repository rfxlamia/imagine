#!/usr/bin/env node
// PreToolUse entry point. Always runs main() (an argv/import.meta guard failed
// open under symlinked plugin paths). Any load or runtime failure exits 2 so
// Claude Code blocks the call instead of treating it as a non-blocking error.
// GROK_HOOK_EVENT is set by Grok and unset by Claude Code. The import stays
// inside the branch so a broken Grok module cannot take down the Claude path.
try {
  if (process.env.GROK_HOOK_EVENT) {
    const { main } = await import("./scene-builder-scope-grok.mjs");
    main();
  } else {
    const { main } = await import("./scene-builder-scope-lib.mjs");
    main();
  }
} catch (e) {
  process.stderr.write(`scene-builder-scope: hook failed (${e?.message ?? e}); blocked\n`);
  process.exitCode = 2;
}
