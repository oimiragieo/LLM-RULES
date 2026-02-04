#!/bin/bash
# Ralph Wiggum: Stream Parser
# Parses cursor-agent stream-json output. Tracks tokens, detects signals.
# Cursor layout: state in .cursor/.ralph/
#
# Usage: cursor-agent ... | ./stream-parser.sh /path/to/workspace
# Outputs to stdout: ROTATE | WARN | GUTTER | COMPLETE | DEFER

set -euo pipefail

WORKSPACE="${1:-.}"
RALPH_DIR="$WORKSPACE/.cursor/.ralph"

mkdir -p "$RALPH_DIR"

WARN_THRESHOLD=70000
ROTATE_THRESHOLD=80000

BYTES_READ=0
BYTES_WRITTEN=0
ASSISTANT_CHARS=0
SHELL_OUTPUT_CHARS=0
PROMPT_CHARS=3000
WARN_SENT=0

FAILURES_FILE=$(mktemp 2>/dev/null || echo "/tmp/ralph-failures-$$")
WRITES_FILE=$(mktemp 2>/dev/null || echo "/tmp/ralph-writes-$$")
trap "rm -f $FAILURES_FILE $WRITES_FILE" EXIT

get_health_emoji() {
  local tokens=$1
  local pct=$((tokens * 100 / ROTATE_THRESHOLD))
  if [[ $pct -lt 60 ]]; then echo "🟢"
  elif [[ $pct -lt 80 ]]; then echo "🟡"
  else echo "🔴"
  fi
}

calc_tokens() {
  local total_bytes=$((PROMPT_CHARS + BYTES_READ + BYTES_WRITTEN + ASSISTANT_CHARS + SHELL_OUTPUT_CHARS))
  echo $((total_bytes / 4))
}

log_activity() {
  local message="$1"
  local timestamp
  timestamp=$(date '+%H:%M:%S')
  local tokens
  tokens=$(calc_tokens)
  local emoji
  emoji=$(get_health_emoji "$tokens")
  echo "[$timestamp] $emoji $message" >> "$RALPH_DIR/activity.log"
}

log_error() {
  local message="$1"
  local timestamp
  timestamp=$(date '+%H:%M:%S')
  echo "[$timestamp] $message" >> "$RALPH_DIR/errors.log"
}

log_token_status() {
  local tokens
  tokens=$(calc_tokens)
  local pct=$((tokens * 100 / ROTATE_THRESHOLD))
  local emoji
  emoji=$(get_health_emoji "$tokens")
  local status_msg="TOKENS: $tokens / $ROTATE_THRESHOLD ($pct%)"
  [[ $pct -ge 90 ]] && status_msg="$status_msg - rotation imminent"
  [[ $pct -ge 72 ]] && status_msg="$status_msg - approaching limit"
  local timestamp
  timestamp=$(date '+%H:%M:%S')
  local breakdown="[read:$((BYTES_READ/1024))KB write:$((BYTES_WRITTEN/1024))KB assist:$((ASSISTANT_CHARS/1024))KB shell:$((SHELL_OUTPUT_CHARS/1024))KB]"
  echo "[$timestamp] $emoji $status_msg $breakdown" >> "$RALPH_DIR/activity.log"
}

is_retryable_api_error() {
  local error_msg="$1"
  local lower_msg
  lower_msg=$(echo "$error_msg" | tr '[:upper:]' '[:lower:]')
  if [[ "$lower_msg" =~ (rate[[:space:]]*limit|rate_limit|429|quota[[:space:]]*exceeded) ]] || \
     [[ "$lower_msg" =~ (timeout|connection[[:space:]]*reset|econnreset) ]] || \
     [[ "$lower_msg" =~ (502|503|504|service[[:space:]]*unavailable) ]]; then
    return 0
  fi
  return 1
}

check_gutter() {
  local tokens
  tokens=$(calc_tokens)
  if [[ $tokens -ge $ROTATE_THRESHOLD ]]; then
    log_activity "ROTATE: Token threshold reached ($tokens >= $ROTATE_THRESHOLD)"
    echo "ROTATE" 2>/dev/null || true
    return
  fi
  if [[ $tokens -ge $WARN_THRESHOLD ]] && [[ $WARN_SENT -eq 0 ]]; then
    log_activity "WARN: Approaching token limit ($tokens >= $WARN_THRESHOLD)"
    WARN_SENT=1
    echo "WARN" 2>/dev/null || true
  fi
}

track_shell_failure() {
  local cmd="$1"
  local exit_code="$2"
  if [[ $exit_code -ne 0 ]]; then
    local count
    count=$(grep -c "^${cmd}$" "$FAILURES_FILE" 2>/dev/null) || count=0
    count=$((count + 1))
    echo "$cmd" >> "$FAILURES_FILE"
    log_error "SHELL FAIL: $cmd → exit $exit_code (attempt $count)"
    if [[ $count -ge 3 ]]; then
      log_error "⚠️ GUTTER: same command failed ${count}x"
      echo "GUTTER" 2>/dev/null || true
    fi
  fi
}

track_file_write() {
  local path="$1"
  local now
  now=$(date +%s)
  echo "$now:$path" >> "$WRITES_FILE"
  local cutoff=$((now - 600))
  local count
  count=$(awk -F: -v cutoff="$cutoff" -v path="$path" '
    $1 >= cutoff && $2 == path { count++ }
    END { print count+0 }
  ' "$WRITES_FILE" 2>/dev/null) || count=0
  if [[ $count -ge 5 ]]; then
    log_error "⚠️ THRASHING: $path written ${count}x in 10 min"
    echo "GUTTER" 2>/dev/null || true
  fi
}

process_line() {
  local line="$1"
  [[ -z "$line" ]] && return

  local type
  type=$(echo "$line" | jq -r '.type // empty' 2>/dev/null) || return
  local subtype
  subtype=$(echo "$line" | jq -r '.subtype // empty' 2>/dev/null) || true

  case "$type" in
    system)
      if [[ "$subtype" == "init" ]]; then
        local model
        model=$(echo "$line" | jq -r '.model // "unknown"' 2>/dev/null) || model="unknown"
        log_activity "SESSION START: model=$model"
      fi
      ;;
    error)
      local error_msg
      error_msg=$(echo "$line" | jq -r '.error.data.message // .error.message // .message // "Unknown error"' 2>/dev/null) || error_msg="Unknown error"
      log_error "API ERROR: $error_msg"
      log_activity "❌ API ERROR: $error_msg"
      if is_retryable_api_error "$error_msg"; then
        log_error "⚠️ RETRYABLE: Error may be transient"
        echo "DEFER" 2>/dev/null || true
      else
        log_error "🚨 NON-RETRYABLE"
        echo "GUTTER" 2>/dev/null || true
      fi
      ;;
    assistant)
      local text
      text=$(echo "$line" | jq -r '.message.content[0].text // empty' 2>/dev/null) || text=""
      if [[ -n "$text" ]]; then
        local chars=${#text}
        ASSISTANT_CHARS=$((ASSISTANT_CHARS + chars))
        [[ "$text" == *" COMPLETE "* ]] && { log_activity "✅ Agent signaled COMPLETE"; echo "COMPLETE" 2>/dev/null || true; }
        [[ "$text" == *" GUTTER "* ]] && { log_activity "🚨 Agent signaled GUTTER"; echo "GUTTER" 2>/dev/null || true; }
      fi
      ;;
    tool_call)
      if [[ "$subtype" == "started" ]]; then
        : $((TOOL_CALLS += 1))
      elif [[ "$subtype" == "completed" ]]; then
        if echo "$line" | jq -e '.tool_call.readToolCall.result.success' > /dev/null 2>&1; then
          local path
          path=$(echo "$line" | jq -r '.tool_call.readToolCall.args.path // "unknown"' 2>/dev/null) || path="unknown"
          local lines
          lines=$(echo "$line" | jq -r '.tool_call.readToolCall.result.success.totalLines // 0' 2>/dev/null) || lines=0
          local content_size
          content_size=$(echo "$line" | jq -r '.tool_call.readToolCall.result.success.contentSize // 0' 2>/dev/null) || content_size=0
          local bytes
          if [[ $content_size -gt 0 ]]; then bytes=$content_size; else bytes=$((lines * 100)); fi
          BYTES_READ=$((BYTES_READ + bytes))
          log_activity "READ $path ($lines lines, ~$((bytes/1024))KB)"
        elif echo "$line" | jq -e '.tool_call.writeToolCall.result.success' > /dev/null 2>&1; then
          local path
          path=$(echo "$line" | jq -r '.tool_call.writeToolCall.args.path // "unknown"' 2>/dev/null) || path="unknown"
          local bytes
          bytes=$(echo "$line" | jq -r '.tool_call.writeToolCall.result.success.fileSize // 0' 2>/dev/null) || bytes=0
          BYTES_WRITTEN=$((BYTES_WRITTEN + bytes))
          log_activity "WRITE $path (${bytes}B)"
          track_file_write "$path"
        elif echo "$line" | jq -e '.tool_call.shellToolCall.result' > /dev/null 2>&1; then
          local cmd
          cmd=$(echo "$line" | jq -r '.tool_call.shellToolCall.args.command // "unknown"' 2>/dev/null) || cmd="unknown"
          local exit_code
          exit_code=$(echo "$line" | jq -r '.tool_call.shellToolCall.result.exitCode // 0' 2>/dev/null) || exit_code=0
          local stdout stderr
          stdout=$(echo "$line" | jq -r '.tool_call.shellToolCall.result.stdout // ""' 2>/dev/null) || stdout=""
          stderr=$(echo "$line" | jq -r '.tool_call.shellToolCall.result.stderr // ""' 2>/dev/null) || stderr=""
          local output_chars=$((${#stdout} + ${#stderr}))
          SHELL_OUTPUT_CHARS=$((SHELL_OUTPUT_CHARS + output_chars))
          if [[ $exit_code -eq 0 ]]; then
            log_activity "SHELL $cmd → exit 0"
          else
            log_activity "SHELL $cmd → exit $exit_code"
            track_shell_failure "$cmd" "$exit_code"
          fi
        fi
        check_gutter
      fi
      ;;
    result)
      local duration
      duration=$(echo "$line" | jq -r '.duration_ms // 0' 2>/dev/null) || duration=0
      local tokens
      tokens=$(calc_tokens)
      log_activity "SESSION END: ${duration}ms, ~$tokens tokens used"
      ;;
  esac
}

main() {
  echo "" >> "$RALPH_DIR/activity.log"
  echo "═══════════════════════════════════════════════════════════════" >> "$RALPH_DIR/activity.log"
  echo "Ralph Session Started: $(date)" >> "$RALPH_DIR/activity.log"
  echo "═══════════════════════════════════════════════════════════════" >> "$RALPH_DIR/activity.log"

  local last_token_log
  last_token_log=$(date +%s)

  while IFS= read -r line; do
    process_line "$line"
    local now
    now=$(date +%s)
    if [[ $((now - last_token_log)) -ge 30 ]]; then
      log_token_status
      last_token_log=$now
    fi
  done

  log_token_status
}

main
