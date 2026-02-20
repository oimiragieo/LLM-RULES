# Wave Executor Rules

## When to Use

- EPIC-tier batch work only: >10 artifacts, >5 waves
- Multi-wave pipelines expected to run >30 minutes
- Any work that previously crashed due to Bun segfaults under heavy subagent load

## When NOT to Use

- Simple 1-3 skill updates — use `skill-updater` directly
- Single-skill work — use `Task()` subagent
- Work that fits in one context window — just do it inline
- Non-batch work (debugging, code review, single features)

## Routing Decision

The router should prefer wave-executor over Task() subagent swarms when:

1. Planner classifies work as EPIC complexity
2. Plan has >5 waves defined
3. Previous attempt crashed with Bun segfault
4. Total expected spawns >500 (waves x skills x hooks)

## Plan File Requirements

- Must be valid JSON with a `waves` array
- Each wave must have `id` (number) and `skills` (non-empty array)
- Create the plan file BEFORE invoking wave-executor
- Use the planner agent to generate the plan

## Anti-Patterns

- Running wave-executor for a single wave (use skill-updater instead)
- Skipping the plan file and trying to pass tasks inline
- Setting maxTurnsPerWave too low (<10) — waves need room to work
- Setting maxTurnsPerWave too high (>100) — defeats the purpose of fresh processes
- Not checking the inventory file after a crash before resuming
