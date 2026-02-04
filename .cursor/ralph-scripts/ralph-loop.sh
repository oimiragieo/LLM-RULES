#!/bin/bash
# Ralph Wiggum: The Loop (CLI Mode)
# Cursor layout: .cursor/RALPH_TASK.md, .cursor/.ralph/
#
# Usage:
#   ./ralph-loop.sh [options] [workspace]
#   -n, --iterations N   Max iterations (default: 20)
#   -m, --model MODEL   Model (default: opus-4.5-thinking)
#   --branch NAME       Create/work on branch
#   --pr                Open PR when complete (requires --branch)
#   -y, --yes           Skip confirmation

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/ralph-common.sh"

show_help() {
  cat << 'EOF'
Ralph Wiggum: The Loop (CLI Mode)

Usage:
  ./ralph-loop.sh [options] [workspace]

Options:
  -n, --iterations N   Max iterations (default: 20)
  -m, --model MODEL    Model (default: opus-4.5-thinking)
  --branch NAME        Create/work on branch
  --pr                 Open PR when complete (requires --branch)
  -y, --yes            Skip confirmation
  -h, --help           Show this help

Task file: .cursor/RALPH_TASK.md
State: .cursor/.ralph/
EOF
}

WORKSPACE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    -n|--iterations) MAX_ITERATIONS="$2"; shift 2 ;;
    -m|--model)      MODEL="$2"; shift 2 ;;
    --branch)        USE_BRANCH="$2"; shift 2 ;;
    --pr)            OPEN_PR=true; shift ;;
    -y|--yes)        SKIP_CONFIRM=true; shift ;;
    -h|--help)       show_help; exit 0 ;;
    -*)              echo "Unknown option: $1"; echo "Use -h for help."; exit 1 ;;
    *)               WORKSPACE="$1"; shift ;;
  esac
done

main() {
  if [[ -z "$WORKSPACE" ]]; then
    WORKSPACE="$(pwd)"
  elif [[ "$WORKSPACE" == "." ]]; then
    WORKSPACE="$(pwd)"
  else
    WORKSPACE="$(cd "$WORKSPACE" && pwd)"
  fi

  local task_file
  task_file=$(get_task_file "$WORKSPACE")

  show_banner
  if ! check_prerequisites "$WORKSPACE"; then
    exit 1
  fi

  if [[ "$OPEN_PR" == "true" ]] && [[ -z "$USE_BRANCH" ]]; then
    echo "❌ --pr requires --branch"
    exit 1
  fi

  init_ralph_dir "$WORKSPACE"

  echo "Workspace: $WORKSPACE"
  echo "Task: $task_file"
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

  echo "Progress: $done_criteria / $total_criteria criteria ($remaining remaining)"
  echo "Model: $MODEL"
  echo "Max iter: $MAX_ITERATIONS"
  [[ -n "$USE_BRANCH" ]] && echo "Branch: $USE_BRANCH"
  [[ "$OPEN_PR" == "true" ]] && echo "Open PR: Yes"
  echo ""

  if [[ $remaining -eq 0 ]] && [[ $total_criteria -gt 0 ]]; then
    echo "🎉 Task already complete!"
    exit 0
  fi

  if [[ "$SKIP_CONFIRM" != "true" ]]; then
    echo "This will run cursor-agent to work on this task."
    echo "Use -y to skip this prompt."
    read -p "Start Ralph loop? [y/N] " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
      echo "Aborted."
      exit 0
    fi
  fi

  run_ralph_loop "$WORKSPACE" "$SCRIPT_DIR"
  exit $?
}

main
