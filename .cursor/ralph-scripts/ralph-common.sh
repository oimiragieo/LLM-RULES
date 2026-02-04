#!/bin/bash
# Ralph Wiggum: Common utilities and loop logic
# Cursor integration: task file at .cursor/RALPH_TASK.md, state at .cursor/.ralph/
#
# Shared functions for ralph-loop.sh and ralph-setup.sh

# =============================================================================
# CONFIGURATION
# =============================================================================

_RALPH_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Windows: ensure cursor-agent is on PATH when running from Git Bash (agent installs to LOCALAPPDATA)
if [[ -n "$LOCALAPPDATA" ]] && [[ -d "$LOCALAPPDATA/cursor-agent" ]]; then
  export PATH="$LOCALAPPDATA/cursor-agent:$PATH"
fi

# Token thresholds
WARN_THRESHOLD="${WARN_THRESHOLD:-70000}"
ROTATE_THRESHOLD="${ROTATE_THRESHOLD:-80000}"
MAX_ITERATIONS="${MAX_ITERATIONS:-20}"
DEFAULT_MODEL="opus-4.5-thinking"
MODEL="${RALPH_MODEL:-$DEFAULT_MODEL}"

USE_BRANCH="${USE_BRANCH:-}"
OPEN_PR="${OPEN_PR:-false}"
SKIP_CONFIRM="${SKIP_CONFIRM:-false}"

# Agent CLI: cursor-agent (Unix) or agent (Windows native) or full path to .cmd on Windows
if command -v cursor-agent &> /dev/null; then
  AGENT_CMD="cursor-agent"
elif command -v agent &> /dev/null; then
  AGENT_CMD="agent"
elif [[ -n "$LOCALAPPDATA" ]] && [[ -f "$LOCALAPPDATA/cursor-agent/cursor-agent.cmd" ]]; then
  AGENT_CMD="$LOCALAPPDATA/cursor-agent/cursor-agent.cmd"
else
  AGENT_CMD=""
fi

# Cursor layout: task and state live under .cursor/
get_ralph_dir() {
  local workspace="${1:-.}"
  echo "$workspace/.cursor/.ralph"
}

get_task_file() {
  local workspace="${1:-.}"
  echo "$workspace/.cursor/RALPH_TASK.md"
}

# =============================================================================
# HELPERS
# =============================================================================

sedi() {
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "$@"
  else
    sed -i "$@"
  fi
}

get_iteration() {
  local workspace="${1:-.}"
  local ralph_dir
  ralph_dir=$(get_ralph_dir "$workspace")
  local state_file="$ralph_dir/.iteration"
  if [[ -f "$state_file" ]]; then
    cat "$state_file"
  else
    echo "0"
  fi
}

set_iteration() {
  local workspace="${1:-.}"
  local iteration="$2"
  local ralph_dir
  ralph_dir=$(get_ralph_dir "$workspace")
  mkdir -p "$ralph_dir"
  echo "$iteration" > "$ralph_dir/.iteration"
}

increment_iteration() {
  local workspace="${1:-.}"
  local current
  current=$(get_iteration "$workspace")
  local next=$((current + 1))
  set_iteration "$workspace" "$next"
  echo "$next"
}

get_health_emoji() {
  local tokens="$1"
  local pct=$((tokens * 100 / ROTATE_THRESHOLD))
  if [[ $pct -lt 60 ]]; then
    echo "🟢"
  elif [[ $pct -lt 80 ]]; then
    echo "🟡"
  else
    echo "🔴"
  fi
}

# =============================================================================
# LOGGING
# =============================================================================

log_activity() {
  local workspace="${1:-.}"
  local message="$2"
  local ralph_dir
  ralph_dir=$(get_ralph_dir "$workspace")
  local timestamp
  timestamp=$(date '+%H:%M:%S')
  mkdir -p "$ralph_dir"
  echo "[$timestamp] $message" >> "$ralph_dir/activity.log"
}

log_error() {
  local workspace="${1:-.}"
  local message="$2"
  local ralph_dir
  ralph_dir=$(get_ralph_dir "$workspace")
  local timestamp
  timestamp=$(date '+%H:%M:%S')
  mkdir -p "$ralph_dir"
  echo "[$timestamp] $message" >> "$ralph_dir/errors.log"
}

log_progress() {
  local workspace="$1"
  local message="$2"
  local timestamp
  timestamp=$(date '+%Y-%m-%d %H:%M:%S')
  local ralph_dir
  ralph_dir=$(get_ralph_dir "$workspace")
  local progress_file="$ralph_dir/progress.md"
  echo "" >> "$progress_file"
  echo "### $timestamp" >> "$progress_file"
  echo "$message" >> "$progress_file"
}

# =============================================================================
# INITIALIZATION
# =============================================================================

init_ralph_dir() {
  local workspace="$1"
  local ralph_dir
  ralph_dir=$(get_ralph_dir "$workspace")
  mkdir -p "$ralph_dir"

  if [[ ! -f "$ralph_dir/progress.md" ]]; then
    cat > "$ralph_dir/progress.md" << 'EOF'
# Progress Log

> Updated by the agent after significant work.

---

## Session History

EOF
  fi

  if [[ ! -f "$ralph_dir/guardrails.md" ]]; then
    cat > "$ralph_dir/guardrails.md" << 'EOF'
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
  fi

  if [[ ! -f "$ralph_dir/errors.log" ]]; then
    echo "# Error Log - Failures detected by stream-parser." > "$ralph_dir/errors.log"
  fi
  if [[ ! -f "$ralph_dir/activity.log" ]]; then
    echo "# Activity Log - Tool call logging from stream-parser." > "$ralph_dir/activity.log"
  fi
}

# =============================================================================
# TASK MANAGEMENT
# =============================================================================

check_task_complete() {
  local workspace="$1"
  local task_file
  task_file=$(get_task_file "$workspace")
  if [[ ! -f "$task_file" ]]; then
    echo "NO_TASK_FILE"
    return
  fi
  _check_task_complete_direct "$workspace"
}

_check_task_complete_direct() {
  local workspace="$1"
  local task_file
  task_file=$(get_task_file "$workspace")
  local unchecked
  unchecked=$(grep -cE '^[[:space:]]*([-*]|[0-9]+\.)[[:space:]]+\[ \]' "$task_file" 2>/dev/null) || unchecked=0
  if [[ "$unchecked" -eq 0 ]]; then
    echo "COMPLETE"
  else
    echo "INCOMPLETE:$unchecked"
  fi
}

count_criteria() {
  local workspace="${1:-.}"
  local task_file
  task_file=$(get_task_file "$workspace")
  if [[ ! -f "$task_file" ]]; then
    echo "0:0"
    return
  fi
  local total done_count
  total=$(grep -cE '^[[:space:]]*([-*]|[0-9]+\.)[[:space:]]+\[(x| )\]' "$task_file" 2>/dev/null) || total=0
  done_count=$(grep -cE '^[[:space:]]*([-*]|[0-9]+\.)[[:space:]]+\[x\]' "$task_file" 2>/dev/null) || done_count=0
  echo "$done_count:$total"
}

# =============================================================================
# PROMPT BUILDING
# =============================================================================

build_prompt() {
  local workspace="$1"
  local iteration="$2"
  local task_file
  task_file=$(get_task_file "$workspace")
  local ralph_dir
  ralph_dir=$(get_ralph_dir "$workspace")

  cat << EOF
# Ralph Iteration $iteration

You are an autonomous development agent using the Ralph methodology.

## FIRST: Read State Files

Before doing anything:
1. Read \`.cursor/RALPH_TASK.md\` - your task and completion criteria
2. Read \`.cursor/.ralph/guardrails.md\` - lessons from past failures (FOLLOW THESE)
3. Read \`.cursor/.ralph/progress.md\` - what's been accomplished
4. Read \`.cursor/.ralph/errors.log\` - recent failures to avoid

## Working Directory

You are in a git repository. Work at the repo root:
- Do NOT run \`git init\` - the repo already exists
- All code should live at the repo root or in existing subdirectories

## Git Protocol

Commit early and often. After each criterion: \`git add -A && git commit -m 'ralph: <description>'\`
Push after every 2-3 commits: \`git push\`

## Task Execution

1. Work on the next unchecked criterion in .cursor/RALPH_TASK.md (look for \`[ ]\`)
2. Run tests after changes (check task file for test_command)
3. Mark completed criteria: Edit .cursor/RALPH_TASK.md and change \`[ ]\` to \`[x]\`
4. Update \`.cursor/.ralph/progress.md\` with what you accomplished
5. When ALL criteria show \`[x]\`: output \` COMPLETE \`
6. If stuck 3+ times on same issue: output \` GUTTER \`

## Learning from Failures

When something fails, add a Sign to \`.cursor/.ralph/guardrails.md\`:

\`\`\`
### Sign: [Descriptive Name]
- **Trigger**: When this situation occurs
- **Instruction**: What to do instead
- **Added after**: Iteration $iteration - what happened
\`\`\`

## Context Rotation

If you see a warning that context is running low:
1. Finish your current edit, commit and push
2. Update .cursor/.ralph/progress.md with what you accomplished and what's next
3. You will be rotated to a fresh agent that continues your work

Begin by reading the state files.
EOF
}

# =============================================================================
# CURSOR-AGENT INVOCATION (Windows/WSL support)
# =============================================================================

# Run cursor-agent; on Windows use WSL if cursor-agent not in PATH
run_cursor_agent() {
  local prompt="$1"
  local model="${2:-$MODEL}"
  local cmd="${AGENT_CMD:-cursor-agent}"
  if [[ -n "$cmd" ]]; then
    $cmd -p --force --output-format stream-json --model "$model" "$prompt"
  elif [[ -n "$WSL_DISTRO_NAME" ]] || grep -qi microsoft /proc/version 2>/dev/null; then
    cursor-agent -p --force --output-format stream-json --model "$model" "$prompt"
  else
    # Windows: assume we're in Git Bash or similar; try wsl
    local escaped
    escaped=$(echo "$prompt" | sed "s/'/'\\\\''/g")
    wsl bash -lc "cursor-agent -p --force --output-format stream-json --model $model '$escaped'"
  fi
}

# =============================================================================
# SPINNER
# =============================================================================

spinner() {
  local workspace="$1"
  local ralph_dir
  ralph_dir=$(get_ralph_dir "$workspace")
  local spin='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
  local i=0
  while true; do
    printf "\\r 🐛 Agent working... %s (watch: tail -f %s/activity.log)" "${spin:i++%${#spin}:1}" "$ralph_dir" >&2
    sleep 0.1
  done
}

# =============================================================================
# ITERATION RUNNER
# =============================================================================

run_iteration() {
  local workspace="$1"
  local iteration="$2"
  local session_id="${3:-}"
  local script_dir="${4:-$_RALPH_SCRIPT_DIR}"
  local ralph_dir
  ralph_dir=$(get_ralph_dir "$workspace")

  local prompt
  prompt=$(build_prompt "$workspace" "$iteration")
  local fifo="$ralph_dir/.parser_fifo"

  rm -f "$fifo"
  mkfifo "$fifo" 2>/dev/null || true
  if [[ ! -p "$fifo" ]]; then
    echo "❌ Could not create FIFO (Windows? Run from WSL)" >&2
    return 1
  fi

  echo "" >&2
  echo "═══════════════════════════════════════════════════════════════════" >&2
  echo "🐛 Ralph Iteration $iteration" >&2
  echo "═══════════════════════════════════════════════════════════════════" >&2
  echo "Workspace: $workspace" >&2
  echo "Model: $MODEL" >&2
  echo "Monitor: tail -f $ralph_dir/activity.log" >&2
  echo "" >&2

  log_progress "$workspace" "**Session $iteration started** (model: $MODEL)"

  local cmd="${AGENT_CMD:-cursor-agent} -p --force --output-format stream-json --model $MODEL"
  [[ -n "$session_id" ]] && cmd="$cmd --resume=\"$session_id\""

  cd "$workspace" || return 1

  spinner "$workspace" &
  local spinner_pid=$!

  ( eval "$cmd \"\$prompt\"" 2>&1 | "$script_dir/stream-parser.sh" "$workspace" > "$fifo" ) &
  local agent_pid=$!

  local signal=""
  while IFS= read -r line; do
    case "$line" in
      ROTATE)
        printf "\\r\\033[K" >&2
        echo "🔄 Context rotation - stopping agent..." >&2
        kill $agent_pid 2>/dev/null || true
        signal="ROTATE"
        break
        ;;
      WARN)
        printf "\\r\\033[K" >&2
        echo "⚠️ Context warning - agent should wrap up soon..." >&2
        ;;
      GUTTER)
        printf "\\r\\033[K" >&2
        echo "🚨 Gutter detected..." >&2
        signal="GUTTER"
        ;;
      COMPLETE)
        printf "\\r\\033[K" >&2
        echo "✅ Agent signaled completion!" >&2
        signal="COMPLETE"
        ;;
      DEFER)
        printf "\\r\\033[K" >&2
        echo "⏸️ Rate limit or transient error - deferring..." >&2
        signal="DEFER"
        kill $agent_pid 2>/dev/null || true
        ;;
    esac
  done < "$fifo"

  wait $agent_pid 2>/dev/null || true
  kill $spinner_pid 2>/dev/null || true
  wait $spinner_pid 2>/dev/null || true
  printf "\\r\\033[K" >&2
  rm -f "$fifo"

  echo "$signal"
}

# =============================================================================
# MAIN LOOP
# =============================================================================

run_ralph_loop() {
  local workspace="$1"
  local script_dir="${2:-$_RALPH_SCRIPT_DIR}"

  cd "$workspace" || return 1
  if [[ -n "$(git status --porcelain 2>/dev/null)" ]]; then
    echo "📦 Committing uncommitted changes..."
    git add -A
    git commit -m "ralph: initial commit before loop" || true
  fi

  if [[ -n "$USE_BRANCH" ]]; then
    echo "🌿 Creating branch: $USE_BRANCH"
    git checkout -b "$USE_BRANCH" 2>/dev/null || git checkout "$USE_BRANCH"
  fi

  echo ""
  echo "🚀 Starting Ralph loop..."
  echo ""

  local iteration=1
  local session_id=""

  while [[ $iteration -le $MAX_ITERATIONS ]]; do
    local signal
    signal=$(run_iteration "$workspace" "$iteration" "$session_id" "$script_dir")
    local task_status
    task_status=$(check_task_complete "$workspace")

    if [[ "$task_status" == "COMPLETE" ]]; then
      log_progress "$workspace" "**Session $iteration ended** - ✅ TASK COMPLETE"
      echo ""
      echo "═══════════════════════════════════════════════════════════════════"
      echo "🎉 RALPH COMPLETE! All criteria satisfied."
      echo "═══════════════════════════════════════════════════════════════════"
      echo "Completed in $iteration iteration(s)."
      if [[ "$OPEN_PR" == "true" ]] && [[ -n "$USE_BRANCH" ]]; then
        echo ""
        echo "📝 Opening pull request..."
        git push -u origin "$USE_BRANCH" 2>/dev/null || git push
        if command -v gh &> /dev/null; then
          gh pr create --fill || echo "⚠️ Create PR manually."
        fi
      fi
      return 0
    fi

    case "$signal" in
      COMPLETE)
        if [[ "$task_status" == "COMPLETE" ]]; then
          log_progress "$workspace" "**Session $iteration ended** - ✅ TASK COMPLETE"
          echo ""
          echo "🎉 RALPH COMPLETE! All criteria verified."
          return 0
        else
          log_progress "$workspace" "**Session $iteration ended** - Agent signaled complete but criteria remain"
          echo "⚠️ Agent signaled completion but unchecked criteria remain. Continuing..."
          iteration=$((iteration + 1))
        fi
        ;;
      ROTATE)
        log_progress "$workspace" "**Session $iteration ended** - 🔄 Context rotation"
        echo "🔄 Rotating to fresh context..."
        iteration=$((iteration + 1))
        session_id=""
        ;;
      GUTTER)
        log_progress "$workspace" "**Session $iteration ended** - 🚨 GUTTER"
        echo "🚨 Gutter detected. Check .cursor/.ralph/errors.log"
        return 1
        ;;
      DEFER)
        log_progress "$workspace" "**Session $iteration ended** - ⏸️ DEFERRED"
        local defer_delay=30
        echo "⏸️ Waiting ${defer_delay}s before retry..."
        sleep "$defer_delay"
        ;;
      *)
        if [[ "$task_status" == INCOMPLETE:* ]]; then
          log_progress "$workspace" "**Session $iteration ended** - Agent finished (${task_status#INCOMPLETE:} remaining)"
          echo "📋 Starting next iteration..."
          iteration=$((iteration + 1))
        fi
        ;;
    esac
    sleep 2
  done

  log_progress "$workspace" "**Loop ended** - ⚠️ Max iterations ($MAX_ITERATIONS) reached"
  echo "⚠️ Max iterations ($MAX_ITERATIONS) reached."
  return 1
}

# =============================================================================
# PREREQUISITES
# =============================================================================

check_prerequisites() {
  local workspace="$1"
  local task_file
  task_file=$(get_task_file "$workspace")

  if [[ ! -f "$task_file" ]]; then
    echo "❌ No .cursor/RALPH_TASK.md found in $workspace"
    echo ""
    echo "Create a task file at .cursor/RALPH_TASK.md with frontmatter and success criteria."
    return 1
  fi

  if [[ -z "$AGENT_CMD" ]]; then
    if command -v cursor-agent &> /dev/null; then
      AGENT_CMD="cursor-agent"
    elif command -v agent &> /dev/null; then
      AGENT_CMD="agent"
    fi
  fi
  if [[ -z "$AGENT_CMD" ]]; then
    echo "❌ cursor-agent / agent CLI not found"
    echo "Install: curl https://cursor.com/install -fsS | bash"
    echo "Windows: irm 'https://cursor.com/install?win32=true' | iex"
    return 1
  fi

  if ! git -C "$workspace" rev-parse --git-dir > /dev/null 2>&1; then
    echo "❌ Not a git repository. Ralph requires git for state persistence."
    return 1
  fi

  return 0
}

# =============================================================================
# DISPLAY
# =============================================================================

show_task_summary() {
  local workspace="$1"
  local task_file
  task_file=$(get_task_file "$workspace")
  echo "📋 Task Summary:"
  echo "─────────────────────────────────────────────────────────────────"
  head -30 "$task_file"
  echo "─────────────────────────────────────────────────────────────────"
  local total_criteria done_criteria remaining
  total_criteria=$(grep -cE '^[[:space:]]*([-*]|[0-9]+\.)[[:space:]]+\[(x| )\]' "$task_file" 2>/dev/null) || total_criteria=0
  done_criteria=$(grep -cE '^[[:space:]]*([-*]|[0-9]+\.)[[:space:]]+\[x\]' "$task_file" 2>/dev/null) || done_criteria=0
  remaining=$((total_criteria - done_criteria))
  echo "Progress: $done_criteria / $total_criteria criteria complete ($remaining remaining)"
  echo "Model: $MODEL"
  echo ""
  echo "$remaining"
}

show_banner() {
  echo "═══════════════════════════════════════════════════════════════════"
  echo "🐛 Ralph Wiggum: Autonomous Development Loop"
  echo "═══════════════════════════════════════════════════════════════════"
  echo ""
  echo " \"That's the beauty of Ralph - the technique is deterministically"
  echo "  bad in an undeterministic world.\""
  echo ""
  echo "═══════════════════════════════════════════════════════════════════"
  echo ""
}
