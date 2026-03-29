# Cron Runner Research Requirements (2026)

## Verified Architecture

Background subprocess that prevents context growth in main router session.

## Observability Schema

```json
{
  "status": "healthy",
  "last_tick_at": "ISO-8601-TIMESTAMP",
  "queue_depth_snapshot": 0,
  "total_actions_processed": 142,
  "restart_count": 0,
  "token_watermark_estimate": 45000
}
```

## Queue Processing

- Atomic rename before reading
- Skip corrupted lines
- Sequential execution
- 5-15 minute heartbeat ping

## Source References

- [Claude Code Background Tasks](https://code.claude.com/docs/en/background-tasks)
- [Atomic File Operations](https://nodejs.org/api/fs.html)
