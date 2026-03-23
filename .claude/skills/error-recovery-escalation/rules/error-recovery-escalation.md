# Error Recovery Escalation Rules

## Core Principle

Structured recovery prevents both infinite retry loops and premature give-up. Every error deserves exactly one attempt at each level before escalating.

## Iron Laws

1. **Always enter at the correct level** — Do not skip levels. A transient network error that jumps to REPLAN wastes resources and corrupts history.
2. **Respect timeouts** — If a level's timeout expires, escalate immediately. No extension, no exceptions.
3. **Record every level transition** — Every escalation MUST call TaskUpdate with `{ recoveryLevel, recoveryAction, errorType }`.
4. **Force-done always emits output** — Level 5 is never silent. Partial results + explanation is a valid outcome.
5. **Do not retry at level 1 more than 3 times** — 3 retries is the hard cap. Retry 4 = escalation failure.

## Level Entry Criteria (Strict)

| Level | Keyword    | DO enter when                           | DO NOT enter when           |
| ----- | ---------- | --------------------------------------- | --------------------------- |
| 1     | retry      | Transient, idempotent, <3 attempts      | Error requires param change |
| 2     | nudge      | Params wrong, 3 retries exhausted       | Goal is completely wrong    |
| 3     | replan     | Approach wrong, nudges failed           | Just a config typo          |
| 4     | fallback   | Agent type wrong, replan failed         | Just a missing file         |
| 5     | force-done | All levels failed, time budget exceeded | Any non-terminal situation  |

## Anti-Patterns

- **Never skip levels** — Jumping from error to REPLAN on first attempt is wasteful
- **Never re-enter the same level** — Level 2 fails → level 3, not another level 2
- **Never omit TaskUpdate on level entry** — Untracked escalations are invisible to reflection scoring
- **Never use force-done to avoid hard work** — Level 5 is last resort, not a shortcut
- **Never extend timeouts** — If a level times out, escalate. Do not negotiate with the timer.

## Error Classification Quick Reference

| Error Contains                     | Level                  |
| ---------------------------------- | ---------------------- |
| timeout, etimedout, timed out      | 1 (retry)              |
| 429, rate limit, too many requests | 1 (retry with backoff) |
| enoent, not found, no such file    | 2 (nudge)              |
| eperm, permission denied, eacces   | 2 (nudge)              |
| wrong output, invalid format       | 2 (nudge)              |
| goal, misalign, judge fail         | 3 (replan)             |
| loop, repeat, cycle                | 3 (replan)             |
| capability, wrong agent            | 4 (fallback)           |
| service down, 503, unavailable     | 5 (force-done)         |
| credential, api key, auth          | 5 (force-done)         |

## When to Invoke

```javascript
Skill({ skill: 'error-recovery-escalation' });
```

Invoke after any unhandled error, judge-verification FAIL, or behavioral-loop-detection trigger.
