#!/usr/bin/env bash
# Pins the Imagine plugin at a commit and prepares the WP8 slice session.
# usage: setup.sh [<commit>] [<repin-label>]   e.g. setup.sh HEAD   or, after a mid-slice fix, setup.sh HEAD r2
set -euo pipefail
repo="$(cd "$(dirname "$0")/../.." && pwd)"
commit="$(git -C "$repo" rev-parse "${1:-HEAD}")"
label="${2:-}"
home="${IMAGINE_SLICE_HOME:-$HOME/imagine-slice}"
plugin="$home/plugin${label:+-$label}"
session="$repo/tests/slice/evidence/session.txt"
if [ -n "$label" ] && [ ! -f "$session" ]; then echo "a re-pin needs the first session.txt" >&2; exit 1; fi
if [ -z "$label" ] && [ -f "$session" ]; then echo "session.txt exists; re-pin with a label (setup.sh <commit> r2)" >&2; exit 1; fi
mkdir -p "$home"
if [ ! -d "$plugin" ]; then git -C "$repo" worktree add --detach "$plugin" "$commit"; fi
[ "$(git -C "$plugin" rev-parse HEAD)" = "$commit" ] || { echo "$plugin is not at $commit" >&2; exit 1; }
cp -R "$repo/node_modules" "$plugin/"
cp -R "$repo/packages/imagine-kit/node_modules" "$plugin/packages/imagine-kit/"
# A separate config dir keeps user memory, rules, agents, skills and plugins out of the slice
# session (--setting-sources does not govern user memory; 2026-11-04, imagine-z8p.6.8).
mkdir -p "$home/work" "$home/inputs" "$home/tmp" "$home/claude-config"
# Local permission settings (.claude/settings.local.json) are allowed; instruction files are not.
for f in CLAUDE.md AGENTS.md .claude/CLAUDE.md .claude/agents .claude/skills .claude/commands; do
  [ ! -e "$home/work/$f" ] || { echo "$home/work/$f must not exist" >&2; exit 1; }
done
if [ -z "$label" ]; then
  cp "$repo/tests/slice/scripts/keeper-3.md" "$repo/tests/slice/scripts/keeper-3-copy.md" "$home/inputs/"
  bash "$repo/tests/slice/make-sfx.sh" "$home/inputs"
fi
launch="cd $home/work && CLAUDE_CONFIG_DIR=$home/claude-config ENABLE_CLAUDEAI_MCP_SERVERS=false CLAUDE_CODE_DISABLE_CLAUDE_MDS=1 claude --plugin-dir $plugin --setting-sources project,local --strict-mcp-config --model claude-sonnet-5-5"
sfx="${label:+_$label}"
{
  echo "date$sfx=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "plugin_commit$sfx=$commit"
  echo "claude_version$sfx=$(claude --version 2>&1 | head -1)"
  echo "launch$sfx=$launch"
} | sed "s#$HOME#\$HOME#g" >> "$session"
echo "$launch"
