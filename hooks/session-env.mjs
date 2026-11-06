#!/usr/bin/env node
// SessionStart entry point. Always runs main() (same reason as
// scene-builder-scope.mjs: an argv/import.meta guard fails under symlinked
// plugin paths). A load failure exits 1 so the user sees the hook error.
// GROK_HOOK_EVENT is set by Grok and unset by Claude Code. The import stays
// inside the branch so a broken Grok module cannot take down the Claude path.
try {
  if (process.env.GROK_HOOK_EVENT) {
    const { main } = await import("./session-env-grok.mjs");
    main();
  } else {
    const { main } = await import("./session-env-lib.mjs");
    main();
  }
} catch (e) {
  process.stderr.write(`imagine session-env: hook failed (${e?.message ?? e}); HYPERFRAMES_NO_TELEMETRY=1 is not active for this session\n`);
  process.exitCode = 1;
}
