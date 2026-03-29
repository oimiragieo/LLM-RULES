# arxiv-monitor Rules

## Purpose

Monitor ArXiv for new papers matching configured keywords and integrate with morning briefing workflows.

## Best Practices

- Use cron-based scheduling for automated polling (every 6 hours recommended)
- Deduplicate papers using MemoryRecord to avoid repeated notifications
- Cap stored paper IDs at 1000 to prevent unbounded memory growth
- Store summaries in named memory for briefing integration
- Use the ArXiv API directly (no authentication required)

## Integration Points

- Integrate with `scheduled-tasks` for CronCreate API
- Connect to morning briefing loop for daily summaries
- Use `memory-search` to find specific papers in the digest

## Configuration

- `ARXIV_KEYWORDS` - Comma-separated search keywords (required)
- `ARXIV_MAX_RESULTS` - Max papers per keyword per run (default: 10)
- `ARXIV_LOOKBACK_DAYS` - Days to look back for new papers (default: 7)

## Related Skills

- `scheduled-tasks` — CronCreate API for scheduling
- `exa-monitor` — Exa web search companion
- `heartbeat` — Start all heartbeat loops including this one
