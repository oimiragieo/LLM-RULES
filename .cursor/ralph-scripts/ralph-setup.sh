#!/bin/bash
# Ralph Wiggum: Interactive Setup & Loop
# Cursor layout: .cursor/RALPH_TASK.md, .cursor/.ralph/
# Optional: gum for enhanced UI (brew install gum)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/ralph-common.sh"

HAS_GUM=false
command -v gum &> /dev/null && HAS_GUM=true

MODELS=("opus-4.5-thinking" "sonnet-4.5-thinking" "gpt-5.2-high" "Custom...")

select_model() {
  if [[ "$HAS_GUM" == "true" ]]; then
    local selected
    selected=$(gum choose --header "Select model:" "${MODELS[@]}")
    [[ "$selected" == "Custom..." ]] && selected=$(gum input --placeholder "Model name" --value "$DEFAULT_MODEL")
    echo "$selected"
  else
    echo ""
    echo "Select model:"
    local i=1
    for m in "${MODELS[@]}"; do
      [[ "$m" == "Custom..." ]] && echo " $i) Custom" || echo " $i) $m"
      ((i++))
    done
    read -p "Choice [1]: " choice
    choice="${choice:-1}"
    if [[ "$choice" =~ ^[0-9]+$ ]] && [[ $choice -ge 1 ]] && [[ $choice -le ${#MODELS[@]} ]]; then
      local selected="${MODELS[$((choice-1))]}"
      [[ "$selected" == "Custom..." ]] && read -p "Enter model name: " selected
      echo "$selected"
    else
      echo "${MODELS[0]}"
    fi
  fi
}

get_max_iterations() {
  if [[ "$HAS_GUM" == "true" ]]; then
    local value
    value=$(gum input --header "Max iterations:" --placeholder "20" --value "20")
    echo "${value:-20}"
  else
    read -p "Max iterations [20]: " value
    echo "${value:-20}"
  fi
}

get_branch_name() {
  if [[ "$HAS_GUM" == "true" ]]; then
    gum input --header "Branch name:" --placeholder "feature/my-feature"
  else
    read -p "Branch name: " branch
    echo "$branch"
  fi
}

confirm_action() {
  local message="$1"
  if [[ "$HAS_GUM" == "true" ]]; then
    gum confirm "$message"
  else
    read -p "$message [y/N] " -n 1 -r
    echo ""
    [[ $REPLY =~ ^[Yy]$ ]]
  fi
}

main() {
  local workspace="${1:-.}"
  [[ "$workspace" == "." ]] && workspace="$(pwd)" || workspace="$(cd "$workspace" && pwd)"

  local task_file
  task_file=$(get_task_file "$workspace")

  echo ""
  echo "═══════════════════════════════════════════════════════════════════"
  echo "🐛 Ralph Wiggum: Autonomous Development Loop"
  echo "═══════════════════════════════════════════════════════════════════"
  echo ""
  [[ "$HAS_GUM" != "true" ]] && echo "💡 Install gum for a better UI: https://github.com/charmbracelet/gum"
  echo ""

  if ! check_prerequisites "$workspace"; then
    exit 1
  fi

  init_ralph_dir "$workspace"

  echo "Workspace: $workspace"
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

  echo "Configure your Ralph session:"
  echo ""

  MODEL=$(select_model)
  echo "✓ Model: $MODEL"
  MAX_ITERATIONS=$(get_max_iterations)
  echo "✓ Max iterations: $MAX_ITERATIONS"

  echo ""
  echo "Options:"
  echo "  1) Commit to current branch"
  echo "  2) Work on new branch"
  echo "  3) Open PR when complete (requires branch)"
  echo "  4) Run single iteration first"
  read -p "Select (e.g. 1 2 or Enter for 1): " opts

  USE_BRANCH=""
  OPEN_PR=false
  RUN_SINGLE_FIRST=false
  for o in $opts; do
    case "$o" in
      2) USE_BRANCH=$(get_branch_name); echo "✓ Branch: $USE_BRANCH" ;;
      3) OPEN_PR=true; echo "✓ Open PR: Yes" ;;
      4) RUN_SINGLE_FIRST=true; echo "✓ Run single iteration first" ;;
    esac
  done

  if [[ "$OPEN_PR" == "true" ]] && [[ -z "$USE_BRANCH" ]]; then
    echo "⚠️ PR requires a branch."
    USE_BRANCH=$(get_branch_name)
  fi

  echo ""
  echo "─────────────────────────────────────────────────────────────────"
  echo "Summary: Model=$MODEL Iterations=$MAX_ITERATIONS"
  [[ -n "$USE_BRANCH" ]] && echo " Branch=$USE_BRANCH"
  [[ "$OPEN_PR" == "true" ]] && echo " Open PR=Yes"
  [[ "$RUN_SINGLE_FIRST" == "true" ]] && echo " Single iteration first=Yes"
  echo "─────────────────────────────────────────────────────────────────"
  echo ""

  if ! confirm_action "Start Ralph loop?"; then
    echo "Aborted."
    exit 0
  fi

  export MODEL MAX_ITERATIONS USE_BRANCH OPEN_PR

  if [[ "$RUN_SINGLE_FIRST" == "true" ]]; then
    echo ""
    echo "🧪 Running single iteration first..."
    echo ""
    local signal
    signal=$(run_iteration "$workspace" "1" "" "$SCRIPT_DIR")
    local task_status
    task_status=$(check_task_complete "$workspace")
    if [[ "$task_status" == "COMPLETE" ]]; then
      echo "🎉 Task completed in single iteration!"
      exit 0
    fi
    echo ""
    if ! confirm_action "Continue with full loop?"; then
      echo "Stopped after single iteration."
      exit 0
    fi
    local iteration=2
    local session_id=""
    while [[ $iteration -le $MAX_ITERATIONS ]]; do
      signal=$(run_iteration "$workspace" "$iteration" "$session_id" "$SCRIPT_DIR")
      task_status=$(check_task_complete "$workspace")
      [[ "$task_status" == "COMPLETE" ]] && { echo "🎉 RALPH COMPLETE!"; exit 0; }
      case "$signal" in
        ROTATE) iteration=$((iteration+1)); session_id="" ;;
        GUTTER) echo "🚨 Gutter detected."; exit 1 ;;
        *) [[ "$task_status" == INCOMPLETE:* ]] && iteration=$((iteration+1)) ;;
      esac
      sleep 2
    done
    echo "⚠️ Max iterations reached."
    exit 1
  fi

  run_ralph_loop "$workspace" "$SCRIPT_DIR"
  exit $?
}

main "$@"
