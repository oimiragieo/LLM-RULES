<!-- Agent: researcher | Task: #2 | Session: 2026-03-20 -->

# Research Report: Claude Code Agent Teams & Sub-Agents

**Date**: 2026-03-20
**Researcher**: researcher agent
**Task**: #2
**Batch/Phase**: Phase 1 — Feature Documentation Research
**Sources Consulted**: 8

---

## Executive Summary

Claude Code's Agent Teams feature (released February 5, 2026 with v2.1.32) enables multiple Claude Code instances to coordinate on complex tasks. The system has two distinct but complementary mechanisms: **Sub-Agents** (custom specialized agents defined in `.claude/agents/*.md` files with YAML frontmatter, invoked via the `/invoke` command or automatically by the lead) and **Agent Teams** (an experimental feature enabling peer-to-peer multi-session coordination with task sharing and mailbox communication). The agent-studio framework already implements a conceptually similar architecture via the Router + Task() spawning pattern, but the native Claude Code features offer important integration opportunities: sub-agents align directly with agent-studio's `.claude/agents/` directory convention, and the Agent Teams feature's git-based task coordination and mailbox system could complement the existing TaskUpdate/TaskList protocol for truly parallel multi-session orchestration.

---

## Research Methodology

### Search Queries Executed

| # | Query | Source | Results Found |
| --- | ----- | ------ | ------------- |
| 1 | Claude Code sub-agents agent teams multi-agent 2025 2026 Anthropic documentation | WebSearch | 10 results |
| 2 | Claude Code "agent teams" OR "sub-agents" configuration syntax how to create 2025 | WebSearch | 10 results |
| 3 | Claude Code agent teams teammate-mode settings.json CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS configuration examples | WebSearch | 10 results |
| 4 | Claude Code sub-agents AGENTS.md file format syntax 2026 configuration | WebSearch | 10 results |
| 5 | claude/agents .md frontmatter YAML name description tools model subagent format example | WebSearch | 10 results |

### Sources Consulted

| # | Title | Type | URL | Date |
| --- | ----- | ---- | --- | ---- |
| 1 | Orchestrate teams of Claude Code sessions — Claude Code Docs | Official Docs | https://code.claude.com/docs/en/agent-teams | Feb 2026 |
| 2 | Create custom subagents — Claude Code Docs | Official Docs | https://code.claude.com/docs/en/sub-agents | Feb 2026 |
| 3 | claude-code-ultimate-guide / agent-teams.md (GitHub) | Community Guide | https://github.com/FlorianBruniaux/claude-code-ultimate-guide | Feb 2026 |
| 4 | awesome-claude-code-subagents (GitHub — VoltAgent) | Community Registry | https://github.com/VoltAgent/awesome-claude-code-subagents | 2026 |
| 5 | WebSearch aggregated summaries from sitepoint.com, scottspence.com, turingcollege.com, ryandoser.com | Blog Posts | Multiple | Feb–Mar 2026 |
| 6 | WebSearch aggregated summaries from claudefa.st, alexop.dev, addyosmani.com | Technical Guides | Multiple | 2026 |
| 7 | Memory search (internal) | Internal RAG | learnings.md / decisions.md | 2026-03-20 |

---

## Detailed Findings

### Topic 1: Sub-Agents — Custom Specialized Agents

**Key Insights:**

- Sub-agents are Markdown files with YAML frontmatter stored in `.claude/agents/*.md` (project-level) or `~/.claude/agents/*.md` (user-level)
- Only `name` and `description` are required fields; `tools`, `model`, and `disallowedTools` are optional
- The `model` field accepts: `sonnet`, `opus`, `haiku`, a full model ID, or `inherit` (same model as calling session)
- The Markdown body below the frontmatter serves as the agent's system prompt (similar to agent-studio's `.claude/agents/` convention)
- Sub-agents are invoked by Claude via the `Task` tool when it determines delegation is appropriate — operators cannot force specific invocations from within the system prompt
- Project-level agents should be committed to version control; user-level are personal and available across all projects

**Evidence:**

From official Claude Code docs (via search aggregation):
```yaml
---
name: code-reviewer
description: Expert code review specialist. Proactively reviews code for quality, security, and maintainability. Use immediately after writing or modifying code.
tools: Read, Grep, Glob, Bash
model: opus
---

You are a senior code reviewer. Your responsibilities are...
```

**File Location Rules:**
- `.claude/agents/my-agent.md` — project-scoped sub-agent
- `~/.claude/agents/my-agent.md` — user-scoped sub-agent (all projects)

**Relevance to Our Framework:**

Agent-studio already maintains `.claude/agents/` with Markdown files using YAML frontmatter — the same convention Claude Code natively supports. This means our existing 74 agents are already in the correct format for native sub-agent invocation. The key difference: agent-studio uses the Router+Task() spawning pattern explicitly, while native sub-agents rely on Claude's internal delegation. Our approach provides more deterministic routing control.

---

### Topic 2: Agent Teams — Experimental Multi-Session Coordination

**Key Insights:**

- Agent Teams is an experimental feature requiring `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` environment variable
- Requires Claude Code v2.1.32+ and Opus 4.6 model minimum
- Architecture: one **Team Lead** session + multiple **Teammate** sessions, each with isolated 1M-token context windows
- Communication via a **mailbox system** enabling peer-to-peer messaging (Lead→Teammate, Teammate→Lead, Teammate↔Teammate)
- Task coordination via **git-based locking**: agents write lock files to `.claude/tasks/` to claim tasks, work in isolated git worktrees
- Each agent operates in a separate git worktree to prevent file contention, with continuous push/pull synchronization
- Total team token capacity: `N × 1M` tokens (e.g., 3-agent team = 3M tokens)
- Cost: ~3-4x token usage vs single session but proportional time savings on parallelizable tasks

**Evidence:**

Git-based task coordination:
```
.claude/tasks/
├── task-1.lock      # Claimed by Agent A
├── task-2.lock      # Claimed by Agent B
└── task-3.pending   # Not yet claimed
```

Settings configuration:
```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  },
  "teammateMode": "auto"
}
```

Teammate mode options:
- `"in-process"` — all agents in one terminal, Shift+Down/Up to switch views
- `"tmux"` — each agent in a separate tmux pane
- `"it2"` — iTerm2 split pane mode
- `"auto"` (default) — auto-detect environment

Navigation:
- `Shift+Down` / `Shift+Up` — cycle through teammates in in-process mode
- Direct interaction with individual teammates without going through team lead

**Relevance to Our Framework:**

Agent-studio's existing Router+Task() pattern is architecturally similar but runs within a single Claude Code session. The Agent Teams feature adds true **session-level parallelism** where multiple Claude processes run concurrently. The git worktree approach aligns with agent-studio's `feedback_worktree_taskupdate.md` pattern. The mailbox communication system is analogous to the agent-studio TaskUpdate metadata handoff protocol.

---

### Topic 3: Configuration Deep Dive

**Key Insights:**

**Sub-Agent YAML Frontmatter Fields (all fields):**

| Field | Required | Values | Purpose |
| ----- | -------- | ------ | ------- |
| `name` | YES | String | Unique identifier for the agent |
| `description` | YES | String | When/how to invoke (used by orchestrator) |
| `tools` | No | Comma-separated tool names | Allowlist of permitted tools |
| `disallowedTools` | No | Comma-separated tool names | Denylist of tools (complement to `tools`) |
| `model` | No | `sonnet`, `opus`, `haiku`, full ID, `inherit` | Model to use (default: `inherit`) |

**Settings.json integration:**

```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1",
    "CLAUDE_CODE_SUBAGENT_MODEL": "claude-sonnet-4-6"
  },
  "teammateMode": "auto",
  "permissions": {
    "allow": [
      "Bash(git:*)",
      "Bash(npm:*)",
      "Bash(node:*)"
    ]
  }
}
```

`CLAUDE_CODE_SUBAGENT_MODEL` controls the default model for sub-agents (useful pattern: main session on Opus, sub-agents on Sonnet for cost efficiency).

**Best practices from community research:**

1. Define clear task boundaries before spawning to prevent merge conflicts
2. Use interface-first approach: create TypeScript types/contracts before parallel implementation
3. Minimize overlapping file sets across agents
4. Use frequent git commits (continuous merge) rather than end-of-session syncs
5. Pre-approve common tools via permissions allowlist so teammates don't stall on permission prompts
6. Run `git gc --aggressive --prune=now` if repository exceeds 1GB

**Relevance to Our Framework:**

The `CLAUDE_CODE_SUBAGENT_MODEL` env var is equivalent to agent-studio's model resolution hierarchy (config.yaml > frontmatter > complexity defaults). The permissions allowlist approach aligns with agent-studio's tool restriction philosophy (Section 1.1 TOOL LOCKDOWN). The "interface-first" practice maps to agent-studio's planner-first routing law.

---

### Topic 4: Mapping to Agent-Studio Architecture

**Agent-Studio vs Native Claude Code Features — Comparison Matrix:**

| Capability | Agent-Studio Approach | Native Claude Code | Integration Opportunity |
| --- | --- | --- | --- |
| Agent definitions | `.claude/agents/**/*.md` with frontmatter | `.claude/agents/*.md` with YAML frontmatter | ALIGNED — same location and format |
| Task routing | Router + `Task()` explicit spawning | Claude's internal delegation to sub-agents | Agent-studio provides more deterministic control |
| Model per agent | `model:` frontmatter field | `model:` frontmatter field | IDENTICAL |
| Tool restrictions | `tools:` frontmatter + routing-guard hook | `tools:` + `disallowedTools:` frontmatter | Agent-studio has hooks enforcement layer |
| Session parallelism | Single session, sequential spawning | Agent Teams: true parallel sessions | Gap — Agent Teams enables new parallelism tier |
| Inter-agent comms | TaskUpdate metadata, task dependencies | Mailbox system + peer-to-peer messaging | Agent-studio's TaskUpdate is richer in metadata |
| Task claiming | TaskList() + TaskUpdate(in_progress) | Git lock files in `.claude/tasks/` | Different mechanisms; complementary not duplicate |
| Context isolation | Shared context window (sub-optimal) | 1M tokens per agent session | Agent Teams solves context isolation limit |
| Git coordination | Not built-in (developer manages) | Automatic git worktrees per teammate | Agent Teams adds automatic worktree management |

**Critical Difference — Invocation Model:**

- Agent-studio: Router explicitly decides WHICH agent to spawn using routing-guard.cjs enforcement
- Native sub-agents: Claude decides internally when to delegate (less deterministic for compliance)
- Recommendation: Keep Router explicit control; use sub-agents as the agent format standard while routing logic stays in agent-studio

---

### Topic 5: Risks and Limitations

**Key Insights:**

- **Experimental status**: Agent Teams is marked "research preview" — API/behavior may change without notice
- **Model requirements**: Requires Opus 4.6 minimum for Agent Teams (cost implications)
- **Known limitations**: Session resumption issues, task coordination edge cases, shutdown behavior inconsistencies (from official docs)
- **Token cost**: 3-4x token consumption for team workflows vs single-session sequential
- **Platform dependency**: Full split-pane experience requires tmux or iTerm2 (not Windows-native)
- **Version lock**: Requires Claude Code v2.1.32+ — teams on older versions cannot use feature
- **Sub-agent invocation opacity**: Native delegation means less deterministic routing control vs agent-studio's explicit Router

**Windows Compatibility Note:**

Per Sharp Edge SE-01 (windows path normalization), the git worktree approach for Agent Teams requires careful path handling on Windows. The `.claude/tasks/` lock file mechanism may have issues with Windows file locking semantics.

---

## Academic References

No directly relevant arXiv papers found for Claude Code-specific agent teams feature (product documentation, not academic research). Related academic foundations:

- **"LLM Multi-Agent Systems Survey"** — general multi-agent LLM orchestration patterns (not Claude-specific)
- **"SWE-bench Verified"** — benchmarks where multi-agent systems demonstrate superior performance on complex coding tasks, supporting the architectural choice of parallel agents

---

## Practical Recommendations

### P0 (Immediate — This Sprint)

- Verify that existing agent-studio `.claude/agents/**/*.md` files are compatible with native sub-agent YAML frontmatter format (they should be — same location and convention)
- Add `CLAUDE_CODE_SUBAGENT_MODEL` to `.env.example` with documentation noting it sets the default sub-agent model
- Confirm that agent frontmatter `model:` field is being honored by Claude Code's native sub-agent invocation (aligns with ADR-075 model resolution hierarchy)

### P1 (Soon — Next Sprint)

- **Enable Agent Teams experimentally**: Add `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` to `.env.example` as an opt-in feature with documentation on requirements (v2.1.32+, Opus 4.6)
- **Document sub-agent invocation behavior**: Update CLAUDE.md or developer docs explaining that `.claude/agents/` files serve dual purpose: (1) agent-studio explicit routing targets, (2) native Claude Code sub-agent definitions
- **Investigate Agent Teams + TaskUpdate integration**: Explore whether agent-studio's TaskList/TaskUpdate protocol can be used alongside the git-lock coordination to give better visibility into Agent Teams execution
- **Worktree agent spawning pattern**: Agent Teams uses git worktrees automatically — this aligns with existing `feedback_worktree_taskupdate.md` pattern but without the manual worktree management overhead

### P2 (Future — Backlog)

- **Build Agent Teams orchestrator workflow**: Create a workflow that uses Agent Teams for EPIC-complexity pipelines where true session parallelism provides time savings beyond what single-session Task() spawning achieves
- **Windows compatibility audit**: Audit the `.claude/tasks/` git-lock mechanism and git worktree management for Windows path issues (SE-01)
- **Sub-agent model cost optimization**: Implement `CLAUDE_CODE_SUBAGENT_MODEL=claude-sonnet-4-6` as default with Opus reserved for architect/security/planner agents (aligns with model selection ADR-075)
- **Cross-session memory protocol**: Design a memory handoff mechanism for Agent Teams sessions (each has isolated context — need explicit memory sync via `.claude/context/memory/` files)
- **Agent Teams + heartbeat-orchestrator**: Register Agent Teams lifecycle events in the heartbeat/cron system for monitoring

---

## Risk Assessment

| Risk | Impact | Probability | Mitigation |
| ---- | ------ | ----------- | ---------- |
| Agent Teams experimental API changes | HIGH — breaks integration if relied upon | HIGH (research preview) | Use only as opt-in; keep Router as primary mechanism |
| Native sub-agent delegation bypasses routing-guard.cjs | HIGH — security model violation | MEDIUM (if users trigger directly) | Document that agent-studio Router, not native invocation, is canonical; routing-guard still enforces spawns via Task() |
| Token cost 3-4x for Agent Teams | MEDIUM — budget impact | HIGH (by design) | Reserve Agent Teams for EPIC-only pipelines; document cost model |
| Windows incompatibility for tmux/pane mode | LOW — only UX issue for UI | HIGH (Windows platform) | Use in-process mode on Windows; document limitation |
| Sub-agent tools allowlist conflicts with agent-studio rules | MEDIUM — tool restrictions may differ | LOW | Audit frontmatter `tools:` fields match routing policy |
| Git worktree lock contention on fast merges | MEDIUM — coordination failure | LOW | Leverage continuous-merge pattern + `git gc` maintenance |
| Session resumption failures (known limitation) | MEDIUM — lost work risk | MEDIUM (known bug) | Always commit before Agent Teams session ends |
| Opus 4.6 requirement increase costs for all Agent Teams work | HIGH — budget impact | HIGH (model requirement) | Use `CLAUDE_CODE_SUBAGENT_MODEL` to run teammates on Sonnet where appropriate |

---

## Implementation Roadmap

### Phase 1 — Sub-Agent Compatibility Verification (1 day)

1. Audit all 74 agents in `.claude/agents/` to confirm YAML frontmatter fields are valid per native Claude Code format
2. Identify any fields used by agent-studio that are NOT native (e.g., custom metadata fields)
3. Ensure `name:`, `description:`, `model:`, `tools:` fields are consistently present
4. Run `pnpm validate:full` to catch any format issues
5. Output: Compatibility report in `.claude/context/reports/backend/`

### Phase 2 — Documentation Update (0.5 days)

1. Update `CLAUDE.md` Section 2 (SPAWNING AGENTS) to note dual-purpose of `.claude/agents/` files
2. Update `.env.example` with `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` and `CLAUDE_CODE_SUBAGENT_MODEL`
3. Add agent-teams section to `@DIRECTORY_STRUCTURE.md`
4. Output: Updated docs

### Phase 3 — Experimental Integration (2-3 days)

1. Enable Agent Teams in development environment
2. Test with a simple 2-agent pipeline (planner + developer) using Agent Teams
3. Document observed behavior vs Router+Task() behavior
4. Identify any routing-guard.cjs implications
5. Output: Integration findings report

### Phase 4 — Production Integration Strategy (if Phase 3 successful)

1. Design hybrid architecture: Router+Task() for intra-session, Agent Teams for cross-session EPIC pipelines
2. Create Agent Teams orchestrator workflow
3. Update heartbeat-orchestrator to monitor Agent Teams sessions
4. Memory sync protocol between Agent Teams sessions
5. Output: Production-ready Agent Teams integration

---

## Appendix: Raw Search Results

### Official Documentation URLs

- Agent Teams: https://code.claude.com/docs/en/agent-teams
- Sub-Agents: https://code.claude.com/docs/en/sub-agents

### Key Configuration Reference Card

**Enable Agent Teams (settings.json):**
```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1",
    "CLAUDE_CODE_SUBAGENT_MODEL": "claude-sonnet-4-6"
  },
  "teammateMode": "auto"
}
```

**Sub-Agent File Format:**
```yaml
---
name: my-agent
description: What this agent does and when to use it. Be specific so orchestrator knows when to delegate.
tools: Read, Write, Edit, Bash, Grep, Glob
model: sonnet
---

# Agent System Prompt

Your role is...
```

**File Locations:**
- Project agents: `.claude/agents/*.md`
- User agents: `~/.claude/agents/*.md`
- Task locks (Agent Teams): `.claude/tasks/`

**Version Requirements:**
- Claude Code: v2.1.32+
- Model: Opus 4.6 minimum for Agent Teams
- Platform: Any (tmux recommended for split-pane UX)
