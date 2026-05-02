#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: run-cursor-worker.sh [--dry-run] [--trust] [--force] [--model MODEL] <workspace> <prompt-file>

Runs cursor-agent from WSL with a prompt file while avoiding PowerShell shell-substitution bugs.
The prompt file must resolve inside the workspace.
EOF
}

dry_run=0
trust=0
force=0
model="${CURSOR_AGENT_MODEL:-auto}"
export PATH="$HOME/.local/bin:$PATH"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --help|-h)
      usage
      exit 0
      ;;
    --dry-run)
      dry_run=1
      shift
      ;;
    --trust)
      trust=1
      shift
      ;;
    --force)
      force=1
      shift
      ;;
    --model)
      if [[ $# -lt 2 || "$2" == --* ]]; then
        echo "Missing value for --model" >&2
        exit 2
      fi
      model="$2"
      shift 2
      ;;
    --*)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
    *)
      break
      ;;
  esac
done

if [[ $# -ne 2 ]]; then
  usage >&2
  exit 2
fi

workspace="$1"
prompt_file="$2"

if [[ ! "$model" =~ ^[A-Za-z0-9][A-Za-z0-9._:/-]*$ ]]; then
  echo "Unsafe model value: $model" >&2
  exit 2
fi

if [[ ! -d "$workspace" ]]; then
  echo "Workspace is not a directory: $workspace" >&2
  exit 2
fi

if [[ ! -f "$prompt_file" ]]; then
  echo "Prompt file is not a file: $prompt_file" >&2
  exit 2
fi

workspace="$(cd "$workspace" && pwd -P)"
prompt_dir="$(cd "$(dirname "$prompt_file")" && pwd -P)"
prompt_file="$prompt_dir/$(basename "$prompt_file")"

case "$prompt_file" in
  "$workspace"/*) ;;
  *)
    echo "Prompt file must be inside workspace: $prompt_file" >&2
    exit 2
    ;;
esac

cmd=(cursor-agent --print --model "$model" --workspace "$workspace")
if [[ "$trust" -eq 1 ]]; then
  cmd+=(--trust)
fi
if [[ "$force" -eq 1 ]]; then
  cmd+=(--force)
fi
cmd+=("$(cat "$prompt_file")")

if [[ "$dry_run" -eq 1 ]]; then
  printf '%q ' "${cmd[@]}"
  printf '\n'
  exit 0
fi

cd "$workspace"
exec "${cmd[@]}"
