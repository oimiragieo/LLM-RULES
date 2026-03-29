# cron-runner Rules

## Purpose

Background orchestrator that drains the cron-actions-queue.jsonl queue safely.

## Best Practices

- Use atomic lock/swap for queue processing
- Skip corrupted JSON lines without crashing
- Publish heartbeat telemetry every 5-15 min
- Process actions sequentially to avoid rate limits

## Atomic Drain Protocol

1. Lock/Swap: Rename queue to .processing
2. Read/Iterate: Process each line
3. Execute: Run the action
4. Teardown: Delete .processing file

## Integration Points

See SKILL.md for complete documentation.
