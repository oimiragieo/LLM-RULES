#!/usr/bin/env bash
set -e

cd "$(dirname "$0")/.."

if command -v pnpm &> /dev/null; then
  echo "pnpm found, installing dependencies..."
  pnpm install --frozen-lockfile 2>/dev/null || pnpm install
else
  echo "WARNING: pnpm not found. Skipping dependency install."
fi

echo "Init complete."
