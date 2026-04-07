# Preserved Reference Content

This file preserves sections extracted from the pre-refactor `SKILL.md` so the core workflow can stay concise.

## Workflow Integration

This skill is part of the unified artifact lifecycle. For complete multi-agent orchestration:

**Router Decision:** `.claude/workflows/core/router-decision.md`

- How the Router discovers and invokes this skill's artifacts

**Artifact Lifecycle:** `.claude/workflows/core/skill-lifecycle.md`

- Discovery, creation, update, deprecation phases
- Version management and registry updates
- CLAUDE.md integration requirements

**External Integration:** `.claude/workflows/core/external-integration.md`

- Safe integration of external artifacts
- Security review and validation phases

---

## Post-Creation Integration

After agent creation, run integration checklist:

```javascript
const {
  runIntegrationChecklist,
  queueCrossCreatorReview,
} = require('.claude/lib/creators/creator-commons.cjs');

// 1. Run integration checklist
const result = await runIntegrationChecklist('agent', '.claude/agents/<category>/<agent-name>.md');

// 2. Queue cross-creator review (detects companion artifacts needed)
await queueCrossCreatorReview('agent', '.claude/agents/<category>/<agent-name>.md', {
  artifactName: '<agent-name>',
  createdBy: 'agent-creator',
});

// 3. Review impact report
// Check result.mustHave for failures - address before marking complete
```

**Integration verification:**

- [ ] Agent added to @AGENT_ROUTING_TABLE.md (Section 3 canonical source)
- [ ] Agent added to agent-registry.json
- [ ] Agent assigned at least one skill
- [ ] Agent category correct (core/domain/specialized/orchestrator)

---

## Cross-Reference: Creator Ecosystem

This skill is part of the **Creator Ecosystem**. After creating an agent, consider whether companion follow-ups are needed:

| Creator/Updater      | When to Use                                     | Follow-Up Action                          |
| -------------------- | ----------------------------------------------- | ----------------------------------------- |
| **skill-creator**    | Agent needs new skills not in `.claude/skills/` | Queue a **Follow-Up** for `skill-creator` |
| **workflow-creator** | Agent needs orchestration workflow              | Queue a follow-up for `workflow-creator`  |
| **template-creator** | Agent needs code templates                      | Queue a follow-up for `template-creator`  |
| **schema-creator**   | Agent needs input/output validation schemas     | Queue a follow-up for `schema-creator`    |
| **hook-creator**     | Agent needs pre/post execution hooks            | Queue a follow-up for `hook-creator`      |

### Integration Workflow

After creating an agent that needs additional capabilities:

```javascript
// 1. Agent created but needs new skill
// Record Follow-Up: skill-creator should build the reusable skill
// Then update the agent's skills: array when that follow-up lands

// 2. Agent needs MCP server integration
// Record Follow-Up: skill-creator should convert MCP server to skill
// node .claude/skills/skill-creator/scripts/convert.cjs --server "@modelcontextprotocol/server-xyz"

// 3. Agent needs workflow
// Create workflow in .claude/workflows/<agent-name>-workflow.md
// Update @ENTERPRISE_WORKFLOWS.md if enterprise workflow
```

### Post-Creation Checklist for Ecosystem Integration

After agent is fully created and validated:

```
[ ] Does agent need skills that don't exist? -> Add Follow-Up for skill-creator
[ ] Does agent need multi-phase orchestration? -> Create workflow
[ ] Does agent need code scaffolding? -> Create templates
[ ] Does agent interact with external services? -> Consider MCP integration
[ ] Should agent be part of enterprise workflows? -> Update @ENTERPRISE_WORKFLOWS.md
```

## Ecosystem Alignment Contract (MANDATORY)

This creator skill is part of a coordinated creator ecosystem. Any artifact created here must align with and validate against related creators:

- `agent-creator` for ownership and execution paths
- `skill-creator` for capability packaging and assignment
- `tool-creator` for executable automation surfaces
- `hook-creator` for enforcement and guardrails
- `rule-creator` and `semgrep-rule-creator` for policy and static checks
- `template-creator` for standardized scaffolds
- `workflow-creator` for orchestration and phase gating
- `command-creator` for user/operator command UX

### Cross-Creator Handshake (Required)

Before completion, verify all relevant handshakes:

1. Artifact route exists in `.claude/CLAUDE.md` and related routing docs.
2. Discovery/registry entries are updated (catalog/index/registry as applicable).
3. Companion artifacts are created or explicitly waived with reason.
4. `validate-integration.cjs` passes for the created artifact.
5. Skill index is regenerated when skill metadata changes.

### Research Gate (Exa + arXiv — BOTH MANDATORY)

For new patterns, templates, or workflows, research is mandatory:

1. Use Exa first for implementation and ecosystem patterns.
2. If Exa is insufficient, use `WebFetch` plus arXiv references.
3. Record decisions, constraints, and non-goals in artifact references/docs.
4. Keep updates minimal and avoid overengineering.

### Regression-Safe Delivery

- Follow strict RED -> GREEN -> REFACTOR for behavior changes.
- Run targeted tests for changed modules.
- Run lint/format on changed files.
- Keep commits scoped by concern (logic/docs/generated artifacts).

## Optional: Evaluation-Driven Improvement

After creating an agent, you may optionally run a quality evaluation loop to measure how well the agent definition guides behavior and identify targeted improvements. Evaluation is **opt-in** — the default creation path is unchanged.

### Flags

| Flag                  | Behavior                                                                             |
| --------------------- | ------------------------------------------------------------------------------------ |
| `--quick`             | Default. Skip evaluation; complete after integration steps.                          |
| `--eval`              | Run full evaluation loop (Create → Benchmark → Grade → Compare → Analyze → Iterate). |
| `--eval --tier light` | Run lightweight evaluation (Benchmark + Grade only; no compare/analyze).             |

### Evaluation Agents

Shared read-only evaluation agents at `.claude/skills/skill-creator/agents/`:

- **grader.md** — Produces PASS/FAIL verdicts per assertion + instruction score (1-10)
- **comparator.md** — Blind A/B comparison between two agent versions with rubric scores
- **analyzer.md** — Categorized improvement suggestions (instructions/tools/examples/error_handling/structure/references)

### Running an Evaluation

```bash
node .claude/skills/skill-creator/scripts/eval-runner.cjs \
  --skill .claude/agents/<agent-type>/<agent-name>.md \
  --output .claude/context/tmp/eval-$(date +%Y%m%d-%H%M%S)/
```

### Agent-Specific Assertions

When evaluating agents, focus on:

- **Role boundaries**: Agent stays within its domain; does not execute tasks outside its specialty
- **TaskUpdate protocol**: Agent calls `TaskUpdate(in_progress)` before work and `TaskUpdate(completed)` after — no missing bookends
- **Tool usage**: Agent uses only tools listed in frontmatter; no banned-tool violations
- **Memory protocol**: Agent reads memory before starting and records learnings/decisions after completing
- **Routing keywords**: Agent's keywords unambiguously route to it without matching unrelated agents
- **Skill invocation**: Agent uses `Skill()` to invoke assigned skills rather than reading skill files directly

Full workflow: `.claude/skills/skill-creator/EVAL_WORKFLOW.md`
Output schema: `.claude/schemas/skill-evaluation-output.schema.json`
