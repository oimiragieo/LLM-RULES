# cron-runner Implementation Template

## Goal

- Drain cron-actions-queue.jsonl safely
- Maintain heartbeat observability

## TDD

1. Lock queue atomically
2. Process each action
3. Update ping file

## Verification

- Queue drained without errors
- Ping file updated with status
