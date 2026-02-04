#!/bin/bash
# Ralph Wiggum: Single Iteration
# Runs ONE iteration then stops. Task: .cursor/RALPH_TASK.md
#
# Usage: ./ralph-once.sh [options] [workspace]
#   -m, --model MODEL   Model to use

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/ralph-common.sh"

show_help() {
  cat << 'EOF'
Ralph Wiggum: Single Iteration

Runs exactly ONE iteration, then stops for review.

Usage:
  ./ralph-once.sh [options] [workspace]

Options:
  -m, --model MODEL   Model (default: opus-4.5-thinking)
  -h, --help          Show this help
EOF
}

WORKSPACE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    -m|--model) MODEL="$2"; shift 2 ;;
    -h|--help)  show_help; exit 0 ;;
    -*)         echo "Unknown option: $1"; exit 1 ;;
    *)          WORKSPACE="$1"; shift ;;
  esac
done

main() {
  if [[ -z "$WORKSPACE" ]]; then WORKSPACE="$(pwd)"
  elif [[ "$WORKSPACE" == "." ]]; then WORKSPACE="$(pwd)"
  else WORKSPACE="$(cd "$WORKSPACE" && pwd)"
  fi

  local task_file
  task_file=$(get_task_file "$WORKSPACE")

  echo "═══════════════════════════════════════════════════════════════════"
  echo "🐛 Ralph Wiggum: Single Iteration"
  echo "═══════════════════════════════════════════════════════════════════"
  echo ""

  if ! check_prerequisites "$WORKSPACE"; then
    exit 1
  fi

  init_ralph_dir "$WORKSPACE"

  echo "Workspace: $WORKSPACE"
  echo "Model: $MODEL"
  echo ""
  echo "📋 Task Summary:"
  echo "─────────────────────────────────────────────────────────────────"
  head -30 "$task_file"
  echo "─────────────────────────────────────────────────────────────────"
  echo ""

  local total_criteria done_criteria remaining
  total_criteria=$(grep -cE '^[[:space:]]*([-*]|[0-9]+\.)[[:space:]]+\[(x| )\]' "$task_file" 2>/dev/null) || total_criteria=0
  done_criteria=$(grep -cE '^[[:space:]]*([-*]|[0-9]+\.)[[:space:]]+\[x\]' "$task_file" 2>/dev/null) || done_criteria=0
  remaining=$((total_criteria - done_criteria))
  echo "Progress: $done_criteria / $total_criteria ($remaining remaining)"
  echo ""

  if [[ $remaining -eq 0 ]] && [[ $total_criteria -gt 0 ]]; then
    echo "🎉 Task already complete!"
    exit 0
  fi

  read -p "Run single iteration? [Y/n] " -n 1 -r
  echo ""
  if [[ $REPLY =~ ^[Nn]$ ]]; then
    echo "Aborted."
    exit 0
  fi

  cd "$WORKSPACE" || exit 1
  if [[ -n "$(git status --porcelain 2>/dev/null)" ]]; then
    echo "📦 Committing uncommitted changes..."
    git add -A
    git commit -m "ralph: checkpoint before single iteration" || true
  fi

  echo ""
  echo "🚀 Running single iteration..."
  echo ""

  local signal
  signal=$(run_iteration "$WORKSPACE" "1" "" "$SCRIPT_DIR")
  local task_status
  task_status=$(check_task_complete "$WORKSPACE")

  echo ""
  echo "═══════════════════════════════════════════════════════════════════"
  echo "📋 Single Iteration Complete"
  echo "═══════════════════════════════════════════════════════════════════"
  echo ""

  case "$signal" in
    COMPLETE)
      if [[ "$task_status" == "COMPLETE" ]]; then
        echo "🎉 Task completed in single iteration!"
      else
        echo "⚠️ Agent signaled complete but some criteria remain."
      fi
      ;;
    GUTTER)
      echo "🚨 Gutter detected. Review .cursor/.ralph/errors.log"
      ;;
    ROTATE)
      echo "🔄 Context rotation was triggered."
      ;;
    *)
      if [[ "$task_status" == "COMPLETE" ]]; then
        echo "🎉 Task completed!"
      else
        echo "Agent finished with ${task_status#INCOMPLETE:} criteria remaining."
      fi
      ;;
  esac

  echo ""
  echo "Review: git log --oneline -5; cat .cursor/.ralph/progress.md"
  echo "Next: ./ralph-setup.sh for full loop"
  echo ""
}

main
