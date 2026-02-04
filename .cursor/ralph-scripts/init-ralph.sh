#!/bin/bash
# Ralph Wiggum: Initialize Ralph state
# Cursor layout: .cursor/RALPH_TASK.md, .cursor/.ralph/

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# .cursor directory (parent of ralph-scripts)
CURSOR_DIR="$(dirname "$SCRIPT_DIR")"

echo "═══════════════════════════════════════════════════════════════════"
echo "🐛 Ralph Wiggum Initialization"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

# Run from project root (parent of .cursor)
if [[ ! -d "$CURSOR_DIR/.cursor" ]] && [[ -d "$SCRIPT_DIR/../.cursor" ]]; then
  CURSOR_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
fi

RALPH_DIR="$CURSOR_DIR/.ralph"
TASK_FILE="$CURSOR_DIR/RALPH_TASK.md"

if ! git rev-parse --git-dir > /dev/null 2>&1; then
  echo "⚠️ Not in a git repository. Ralph works best with git."
  read -p "Continue anyway? [y/N] " -n 1 -r
  echo ""
  [[ $REPLY =~ ^[Yy]$ ]] || exit 1
fi

if ! command -v cursor-agent &> /dev/null; then
  echo "⚠️ cursor-agent CLI not found."
  echo "   Install: curl https://cursor.com/install -fsS | bash"
  echo ""
fi

mkdir -p "$RALPH_DIR"

# Create RALPH_TASK.md if missing
if [[ ! -f "$TASK_FILE" ]]; then
  echo "📝 Creating .cursor/RALPH_TASK.md template..."
  cat > "$TASK_FILE" << 'EOF'
---
task: Your task description here
test_command: "pnpm test"
---

# Task

Describe what you want to accomplish.

## Success Criteria

1. [ ] First thing to complete
2. [ ] Second thing to complete
3. [ ] Third thing to complete

## Context

Any additional context the agent should know.
EOF
  echo "   Edit .cursor/RALPH_TASK.md to define your task."
else
  echo "✓ .cursor/RALPH_TASK.md already exists"
fi

echo "📁 Initializing .cursor/.ralph/ ..."

cat > "$RALPH_DIR/guardrails.md" << 'EOF'
# Ralph Guardrails (Signs)

> Lessons learned from past failures. READ THESE BEFORE ACTING.

## Core Signs

### Sign: Read Before Writing
- **Trigger**: Before modifying any file
- **Instruction**: Always read the existing file first
- **Added after**: Core principle

### Sign: Test After Changes
- **Trigger**: After any code change
- **Instruction**: Run tests to verify nothing broke
- **Added after**: Core principle

### Sign: Commit Checkpoints
- **Trigger**: Before risky changes
- **Instruction**: Commit current working state first
- **Added after**: Core principle

---

## Learned Signs

EOF

cat > "$RALPH_DIR/progress.md" << 'EOF'
# Progress Log

> Updated by the agent after significant work.

## Session History

EOF

echo "# Error Log - Failures detected by stream-parser." > "$RALPH_DIR/errors.log"
echo "# Activity Log - Tool call logging from stream-parser." > "$RALPH_DIR/activity.log"
echo "0" > "$RALPH_DIR/.iteration"

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "✅ Ralph initialized!"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "Files:"
echo "  • .cursor/RALPH_TASK.md - Define your task"
echo "  • .cursor/.ralph/guardrails.md - Lessons (agent updates)"
echo "  • .cursor/.ralph/progress.md - Progress log"
echo "  • .cursor/.ralph/activity.log - Tool call log"
echo "  • .cursor/.ralph/errors.log - Failure log"
echo ""
echo "Next:"
echo "  1. Edit .cursor/RALPH_TASK.md"
echo "  2. Run: .cursor/ralph-scripts/ralph-setup.sh"
echo "     Or: .cursor/ralph-scripts/ralph-loop.sh -y"
echo ""
echo "Monitor: tail -f .cursor/.ralph/activity.log"
echo ""
