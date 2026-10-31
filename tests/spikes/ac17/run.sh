#!/usr/bin/env bash
# AC17 spike: plugin PreToolUse hook confines scene-builder to its shadow dir.
set -euo pipefail
repo="$(cd "$(dirname "$0")/../../.." && pwd)"
scratch="$(mktemp -d "${TMPDIR:-/tmp}/imagine-ac17.XXXXXX")"
plugin="$scratch/plugin"
work="$scratch/work"
mkdir -p "$plugin/agents" "$work/.imagine/spike/stage/edit/s01"
cp -R "$repo/.claude-plugin" "$repo/hooks" "$plugin/"
rm -f "$plugin/hooks/"*.test.mjs
cp "$repo/tests/spikes/ac17/agents/"*.md "$plugin/agents/"
# Log raw hook input so the observed agent_type is recorded verbatim.
cat > "$plugin/hooks/log-input.mjs" <<'EOF'
import { appendFileSync, readFileSync } from "node:fs";
const raw = readFileSync(0, "utf8");
appendFileSync(process.env.AC17_HOOK_LOG, raw.trim() + "\n");
EOF
node -e '
const f=process.argv[1]; const j=JSON.parse(require("fs").readFileSync(f,"utf8"));
j.hooks.PreToolUse[0].hooks.unshift({type:"command",command:"node",args:["${CLAUDE_PLUGIN_ROOT}/hooks/log-input.mjs"]});
require("fs").writeFileSync(f, JSON.stringify(j,null,2));' "$plugin/hooks/hooks.json"
export AC17_HOOK_LOG="$scratch/hook-input.jsonl"
: > "$AC17_HOOK_LOG"
out="$repo/tests/slice/evidence/ac17-hook.wp0.txt"
mkdir -p "$(dirname "$out")"
# Absolute paths: the hook denies relative paths, and subagent relative writes resolve elsewhere.
prompt="Do these three steps in order, each by dispatching the named subagent with your Agent tool, and report each result verbatim:
1. Agent scene-builder: write file $work/.imagine/spike/bible.yaml with content \"outside: true\".
2. Agent scene-builder: write file $work/.imagine/spike/stage/edit/s01/inside.html with content \"<p>ok</p>\".
3. Agent other-writer: write file $work/.imagine/spike/control.txt with content \"control\"."
# ISOLATION_FLAGS comes from docs/contracts/claude-code-platform.md (Task 1).
: "${ISOLATION_FLAGS:?set ISOLATION_FLAGS from docs/contracts/claude-code-platform.md}"
# shellcheck disable=SC2086
( cd "$work" && claude -p "$prompt" $ISOLATION_FLAGS --plugin-dir "$plugin" --model claude-haiku-5-5 \
    --permission-mode acceptEdits --output-format stream-json --verbose ) > "$out" 2>&1 || true
{
  echo "outside_exists=$([ -f "$work/.imagine/spike/bible.yaml" ] && echo yes || echo no)"
  echo "inside_exists=$([ -f "$work/.imagine/spike/stage/edit/s01/inside.html" ] && echo yes || echo no)"
  echo "control_exists=$([ -f "$work/.imagine/spike/control.txt" ] && echo yes || echo no)"
  echo "agent_types=$(grep -o '"agent_type":"[^"]*"' "$AC17_HOOK_LOG" | sort -u | tr '\n' ' ')"
  echo "deny_reason_logged=$(grep -c 'may only write inside' "$out" || true)"
  echo "sb_outside_write_attempted=$(node -e '
    const lines=require("fs").readFileSync(process.argv[1],"utf8").split("\n").filter(Boolean).map(JSON.parse);
    console.log(lines.some(l=>/scene-builder$/.test(l.agent_type||"")&&l.tool_name==="Write"&&/\.imagine\/spike\/bible\.yaml$/.test(l.tool_input?.file_path||"")) ? "yes" : "no");' "$AC17_HOOK_LOG")"
  echo "init_plugins=$(head -n 1 "$out" | node -e '
    const j=JSON.parse(require("fs").readFileSync(0,"utf8"));
    console.log((j.plugins||[]).map(p=>p.name+"@"+p.path).join(","));' 2>/dev/null || echo unparseable)"
  echo "init_plugin_errors=$(head -n 1 "$out" | node -e '
    const j=JSON.parse(require("fs").readFileSync(0,"utf8"));
    console.log(JSON.stringify(j.plugin_errors||[]));' 2>/dev/null || echo unparseable)"
  echo "scratch=$scratch"
} | tee -a "$out"
