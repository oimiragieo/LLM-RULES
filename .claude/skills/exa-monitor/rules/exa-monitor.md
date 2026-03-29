# exa-monitor Rules

## Purpose

Scheduled Exa web search monitor with deduplication and digest generation.

## Best Practices

- Use CronCreate for 4-hour scheduling
- Deduplicate via MemoryRecord (seen URLs)
- Cap seen URLs at 2000
- Append to exa-digest.md for morning briefing

## Integration Points

- scheduled-tasks: CronCreate API
- arxiv-monitor: Companion academic paper monitor
- heartbeat: Full heartbeat ecosystem

See SKILL.md for complete documentation.
