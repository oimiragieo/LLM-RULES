<!-- Extracted from CLAUDE.md | Session: 2026-03-06 -->

# Router Operations

**Source:** CLAUDE.md Sections 0.1, 1.2
**Purpose:** Detailed router operational protocols extracted from CLAUDE.md to reduce main document size

---

## Pipeline UX (Noise Control)

- **Late notification handling** (post-pipeline): batch late agent/background completion notices into one short summary instead of one message per completion.
- **Final-summary drain gate** (mandatory): before any "pipeline complete"/final summary, call `TaskList()` and verify no active work remains (`in_progress`, `pending`, `blocked`, or waiting outputs). If active work remains, do not claim completion; report remaining task IDs and continue orchestration.
- **Late-notification dedupe** (mandatory): emit at most one late-notification batch per session phase. Dedupe by `task_id` + `agent/session id`; if a completion was already acknowledged, suppress repeated "late notification" messages.
- **Agent failure re-routing**: on agent failure/error, re-spawn with error context or escalate to a different specialist. Never silently drop failed work.
- **Agent failure escalation (3-strike rule)**: Strike 1 -- retry with error context appended to prompt. Strike 2 -- re-route to different specialist (e.g., developer to devops-troubleshooter). Strike 3 -- `AskUserQuestion` with summary of all 3 failure attempts, error messages, and suggested next steps. Log all retries to session-gap-log.jsonl per Gap Observation Protocol.
- **Reflection outcome line**: when reflection-agent finishes, include report path and a one-line learnings summary in the same pipeline update.
- **Full enterprise sweep trigger**: when user requests "run full enterprise pipeline" / "integrate all findings", route through the ordered enterprise phases in `router-decision.md` Step 7.0 instead of ad-hoc single-agent routing.
- **Enterprise search policy**: for enterprise sweeps, require hybrid search first (`pnpm search:code`, semantic/structural search skills, `ripgrep` skill), with `Grep` as fallback-only. **Router NEVER runs these; always spawn an agent.**
- **Enterprise planner contract**: planner must invoke `Skill({ skill: 'tdd' })`, produce a detailed TDD plan, emit microtask DAG metadata (`owned_paths`, `forbidden_paths`, `depends_on`, `dependency_type`, `parallel_group`) for MEDIUM+ work, and call `researcher`/`architect` when uncertain.

---

## Gap Observation Protocol (MANDATORY)

When the Router observes ANY of the following during a pipeline, it MUST append a structured entry to `.claude/context/runtime/session-gap-log.jsonl` using Bash:

- Agent retry (agent failed, stalled, or produced empty/placeholder output -- router re-spawned)
- Agent produced placeholder output (report file is stub, missing expected files, or zero writes despite being tasked to write)
- Integration gap identified (missing catalog entry, unwired artifact, missing agent assignment found post-creation)
- Warning from enforcement hook appearing in spawn output
- Task completed without expected metadata (`summary`, `filesModified`, or equivalent fields missing from TaskUpdate)
- Pipeline phase stall (agent completes but expected downstream artifacts do not exist)

**How to append (Bash -- Router writes this inline before proceeding to next step):**

```bash
echo '{"timestamp":"2026-02-21T00:00:00Z","type":"retry","taskId":"task-N","agent":"artifact-integrator","description":"artifact-integrator produced placeholder report, no file writes","context":"skill-catalog.md missing 6 entries"}' >> .claude/context/runtime/session-gap-log.jsonl
```

**Entry format:**

```json
{
  "timestamp": "ISO-8601",
  "type": "retry|placeholder_output|integration_gap|hook_warning|missing_metadata|stall",
  "taskId": "task-N or null",
  "agent": "agent-type or null",
  "description": "What the Router observed",
  "context": "Optional: file paths, error messages, gap list"
}
```

**When spawning reflection-agent** (Step 0 or any reflection spawn), the Router MUST include in the spawn prompt:

```
## Router Gap Observations
Gap log for this session: .claude/context/runtime/session-gap-log.jsonl
You MUST read this file and incorporate all entries into your reflection analysis.
Each entry is a router-observed problem invisible to individual task analysis.
```

**Why non-negotiable:** The Router is the ONLY component with cross-agent pipeline visibility. Without this step, retries, stalls, and integration gaps are permanently invisible to the learning system.

---

## Template Loading Protocol

**Templates:** universal-agent-spawn.md (standard) | orchestrator-spawn.md (orchestrators) | agent-identity-integration.md (with personality)
**Process:** Read template -> Substitute placeholders (<ROLE>, <TASK>, <ID>, <SUBJECT>, <agent-file-path>, <absolute-path-to-project>) -> Spawn
**Fallback:** If load fails, use Section 2 inline fallback
**Validation:** spawn-prompt-validator.cjs (default: warn, override: `SPAWN_PROMPT_VALIDATOR=block|warn|off`)

---

## Spawn Budget (Token/Cost Guardrail)

- Spawn prompts are size-budgeted by `spawn-prompt-validator.cjs`.
- `PROMPT_LENGTH_WARNING`: `50000` bytes (~50KB) -> warning/audit event.
- `MAX_PROMPT_LENGTH`: `120000` bytes (~120KB) -> spawn blocked in enforcement mode.
- Router should keep prompts compact and avoid full log/context dumps; include only task-relevant context and references.

---

## Gate 4: Creator Output Paths (IRON LAW)

Never write directly to:

- `.claude/skills/**/SKILL.md` -> skill-creator
- `.claude/agents/**/*.md` -> agent-creator
- `.claude/hooks/**/*.cjs` -> hook-creator
- `.claude/workflows/**/*.md` -> workflow-creator
- `.claude/templates/**/*` -> template-creator
- `.claude/schemas/**/*.json` -> schema-creator

**Why:** Direct writes bypass post-creation steps (CLAUDE.md updates, catalogs, agent assignment), creating "invisible artifacts."
Creators are responsible for (blocking) post-creation steps:

- update `CLAUDE.md` routing references
- update relevant catalogs/registries
- assign artifact to at least one agent
- validate against schema/structure rules
- record learnings/issues/decisions in memory

Copying/restoring archived artifacts counts as creation -> invoke the appropriate creator skill first.

**Enforcement:** `unified-creator-guard.cjs` blocks direct artifact writes. Override: `CREATOR_GUARD=warn|off` (`off` is dangerous).

---

## TaskCreate Restriction (Router)

Router may use TaskCreate ONLY for:

- Trivial/low complexity (single-file, single-operation)
- Tasks created by a spawned **PLANNER** agent

Router must NOT use TaskCreate for:

- HIGH/EPIC complexity (spawn PLANNER first)
- implementation tasks (spawn DEVELOPER)
- security-sensitive tasks (spawn SECURITY-ARCHITECT)

**Automated Enforcement:** `.claude/hooks/routing/routing-guard.cjs`

- blocks TaskCreate for HIGH/EPIC unless PLANNER spawned first
- Override: `PLANNER_FIRST_ENFORCEMENT=warn`

---

## Batch Creation (IRON LAW)

When creating multiple artifacts of the same type (e.g., "create 10 agents"), the Router MUST:

1. Detect batch creation intent (detected automatically by user-prompt-unified.cjs, called indirectly via user-prompt-orchestrator.cjs -- the registered UserPromptSubmit hook in settings.json)
2. Spawn a master-orchestrator or evolution-orchestrator
3. The orchestrator invokes the appropriate creator skill for EACH artifact
4. NEVER spawn N developers to write N artifacts directly

**Enforcement:**

- `CREATOR_ROUTING_ENFORCEMENT=block|warn|off` (default: warn) -- blocks non-creator spawns when creator intent detected
- Creator compliance validation is handled by `pre-completion-validation.cjs` (ecosystem gate on TaskUpdate completion)

---

## Memory/Finding Routing Guardrail

For audit/remediation workflows, Router and spawned agents must use framework memory telemetry:

- Open findings summary: `pnpm metrics:findings:summary`
- Findings trend summary: `pnpm metrics:findings:trend:summary`
- Unified CI metrics gate: `pnpm metrics:ci`
- Nightly strict gate: `pnpm metrics:nightly`

Spawn prompts should require completion output to include concrete file and command evidence so post-task finding resolution can auto-close safely.

---

## Trace-First Incident/Debug Protocol

For incident, outage, troubleshooting, and root-cause requests, Router and spawned agents must collect trace evidence before broad code edits:

- Preferred command: `pnpm trace:query --trace-id <traceId> --compact --since <ISO-8601> --limit 200`
- When `traceId` is unknown: `pnpm trace:query --component <component-name> --event <event-name> --since <ISO-8601> --limit 200`
- Include trace evidence in outputs: trace id(s), component timeline, and the exact query command used.

Do not claim root cause until trace evidence and debug-log evidence agree.

---

## RELATED REFERENCES

- **@ENFORCEMENT_HOOKS.md** - Hook enforcement details
- **@TASK_TRACKING_GUIDE.md** - TaskUpdate protocol
- **@AGENT_ROUTING_TABLE.md** - Agent routing matrix
- **@ENTERPRISE_WORKFLOWS.md** - Enterprise workflow phases
- **@MEMORY_PROTOCOL.md** - Memory persistence and tiers

---

## BACK TO MAIN

See **CLAUDE.md** Sections 0.1 and 1.2 for inline summaries.
