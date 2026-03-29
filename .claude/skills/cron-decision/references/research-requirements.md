# Cron Decision Research Requirements (2026)

## Verified Scheduling Tools

| Tool           | Scope    | Persistence   | Precision |
| -------------- | -------- | ------------- | --------- |
| CronCreate     | Session  | Dies on close | ~15 min   |
| OS cron        | System   | Survives      | Minute    |
| GitHub Actions | Cloud    | Always on     | Minute    |
| Task()         | One-time | N/A           | Immediate |

## CronCreate Constraints

- Session-scoped: Dies when terminal closes
- 3-day auto-expiry: Reschedule before day 2.5
- Jitter: Up to 10% of period (max 15 min)
- 50-task cap per session

## Source References

- [Claude Code Scheduled Tasks](https://code.claude.com/docs/en/scheduled-tasks)
- [GitHub Actions Schedule](https://docs.github.com/en/actions/reference/events-that-trigger-workflows#scheduled-events)
