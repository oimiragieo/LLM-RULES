# Architecture

Architectural decisions, patterns discovered, and system design notes.

**What belongs here:** Architectural decisions made during the mission, patterns discovered, design rationale.
**What does NOT belong here:** Environment setup (use environment.md), testing details (use user-testing.md).

---

## Routing Architecture
- **Current:** Flat routing — main session (router) classifies intent and dispatches to 1 of 109 agents via Task()
- **Target (M2):** Hierarchical — core router dispatches to ~12 targets (10 core agents + domain sub-routers). Sub-routers handle fine-grained agent selection within their domain.
- **Design document:** `.claude/designs/hierarchical-routing-architecture.md`

## Hook Architecture
- Hooks are registered in `.claude/settings.json`
- Each hook is a separate .cjs file spawned as a Node.js process
- Hook types: UserPromptSubmit, PreToolUse, PostToolUse, PostToolUseFailure, SessionEnd, PreCompact, Stop
- Hooks communicate via state files in `.claude/context/runtime/`

## Memory Architecture
- 3-tier: STM (short-term), MTM (medium-term), LTM (long-term)
- Implementation: `.claude/lib/memory/memory-tiers.cjs`
- Vector storage: LanceDB via `.claude/lib/memory/lancedb-client-impl.cjs`
- Memory files: `.claude/context/memory/`

## Creator Architecture
- Skills created via `.claude/skills/skill-creator/SKILL.md`
- Agents created via `.claude/skills/agent-creator/SKILL.md`
- Guard: `.claude/hooks/routing/unified-creator-guard.cjs` (TTL-based write access)
- Post-creation: `.claude/hooks/workflow/post-creation-integration.cjs`
