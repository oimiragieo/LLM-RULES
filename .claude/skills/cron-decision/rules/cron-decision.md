# cron-decision Rules

## Purpose

Decision framework for when to use CronCreate vs OS cron vs GitHub Actions.

## Best Practices

- One-time task → Use Task() or TaskCreate
- Must survive session → Use OS cron or GitHub Actions
- Sub-15-min precision → Use OS cron or GitHub Actions
- Session-scoped heartbeat → Use CronCreate
- Event-driven → Use hook, not scheduler

## Decision Matrix

- Session-scoped monitoring: CronCreate
- Nightly backup: OS cron
- CI/CD pipeline: GitHub Actions
- Event reaction: Hook

## Integration Points

See SKILL.md for complete documentation.
