#!/usr/bin/env bash
set -e

cd "$(dirname "$0")/.."

# Node version check - WSL may use an older Node version that doesn't support
# optional chaining (?.) and other modern JS features. Node 18+ is required.
NODE_MIN_MAJOR=18
if command -v node &> /dev/null; then
  NODE_VERSION=$(node --version 2>/dev/null || echo "v0.0.0")
  NODE_MAJOR=$(echo "$NODE_VERSION" | sed 's/v\([0-9]*\).*/\1/')
  if [ "$NODE_MAJOR" -lt "$NODE_MIN_MAJOR" ]; then
    echo "WARNING: Node version $NODE_VERSION is too old. Node $NODE_MIN_MAJOR+ is required."
    echo "         Some scripts may fail with SyntaxError on optional chaining."
    echo "         Please upgrade Node.js to version $NODE_MIN_MAJOR or higher."
    echo "         Continuing anyway, but expect potential issues."
  fi
else
  echo "WARNING: Node.js not found. Cannot verify Node version."
fi

if command -v pnpm &> /dev/null; then
  echo "pnpm found, installing dependencies..."
  pnpm install --frozen-lockfile 2>/dev/null || pnpm install
else
  echo "WARNING: pnpm not found. Skipping dependency install."
fi

echo "Init complete."
