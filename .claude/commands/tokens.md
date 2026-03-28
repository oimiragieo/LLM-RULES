---
description: "Show today's token and cost summary using the local ccusage integration and adapter totals."
disable-model-invocation: true
---

# Tokens

Show today's token and cost summary using the local `ccusage` integration.

Preferred implementation notes:

- Read the live status from `.claude/context/runtime/ccusage-status.txt` when it is available.
- Use `.claude/lib/utils/ccusage-adapter.cjs` and call `getTodayTotals()` for the authoritative daily totals.
- Fall back to `ccusage` CLI output only when the adapter data is unavailable.
