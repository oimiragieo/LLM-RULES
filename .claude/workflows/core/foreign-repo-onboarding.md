---
description: Standardized startup workflow before analyzing or managing a new, unknown, foreign repository to prevent AI context token bloating.
---
# Foreign Repository Onboarding Workflow

## 1. Context Sanitization (MANDATORY)

Before viewing ANY files or exploring the structure of a completely new codebase, you must sterilize the environment from massive `.md`, `.json`, or log files that will instantly exhaust your LLM context token window.

1. Run the Auto-Ignore contextual scanner:

```bash
pnpm context:auto-ignore
```

*Why?* This script natively traverses the filesystem computing `stat.size / 4` (token heuristic) for every text-based file. If a file breaches 80,000 tokens (approx 320KB), it is automatically appended to `.claudeignore` to protect your session.

1. Verify suppression:

```bash
cat .claudeignore
```

## 2. Structural Survey

Once the massive file traps are suppressed, proceed with normal discovery using the ripgrep skill mapping:

```bash
pnpm search:structure
```

## 3. Mission Start

Proceed with your assigned operational task.
