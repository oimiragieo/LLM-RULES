#!/bin/bash
set -e

cd "$(dirname "$0")/.."

# Install dependencies if node_modules is missing or stale
if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules/.package-lock.json" ]; then
  pnpm install --frozen-lockfile 2>/dev/null || pnpm install
fi

# Ensure routing prototypes exist (postinstall script)
if [ ! -f ".claude/config/routing-prototypes.json" ]; then
  node .claude/scripts/ensure-routing-prototypes.cjs
fi

echo "Environment ready."
