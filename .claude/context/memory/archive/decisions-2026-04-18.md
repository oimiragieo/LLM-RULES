# decisions Archive (2026-04-18)

## ADR-2026-03-13-066: Router Self-Accountability — Failure Must Be Logged, Not Deflected (2026-03-13)

**Status:** ACCEPTED
**Date:** 2026-03-13
**Trigger:** Router observed devops agent failing to commit ~50% of the time this session. Instead of logging this as a router routing failure (chose wrong agent) or escalating, the router noted "systemic devops issue" in comments and continued. User confronted the router about 19 root-level slop files and router initially deflected blame to subagents.

**Decision:** When the Router observes a routing failure (wrong agent chosen, agent produces wrong output, agent fails its task), the Router MUST:

1. Log a gap-log entry with `type: "routing_failure"` (not just `cleanup_finding`)
2. Self-reflect: was the agent choice wrong? Should a different agent have been used?
3. For devops commit failures specifically: immediately switch to `nodejs-pro` (confirmed reliable) rather than retrying devops or blaming the agent
4. When surfacing cleanup issues to the user, own the routing decision — do not blame only the subagent

**Pattern established:** `nodejs-pro` with `git add -u && git commit` is the reliable commit pattern when devops fails. Router must use this as the fallback immediately (not after user intervention).

**Consequences:** Router's gap-log entries must include `routerDecision` field explaining what the router chose and why. Reflection-agent must score routing quality as a dimension.

> ⚠️ Content archived to archive/decisions-2026-04-06.md on 2026-04-06

> ⚠️ Content archived to archive/decisions-2026-04-07.md on 2026-04-07

## ADR: F6 evolution-trigger kept dormant env-gated (2026-04-19)

Decision: evolution-trigger.cjs returns null unless AGENT_EVOLUTION_ENABLED=1. Rationale per LLM consult — natural pipeline link when F8 produces telemetry. Not archived; warn-mode default off.
