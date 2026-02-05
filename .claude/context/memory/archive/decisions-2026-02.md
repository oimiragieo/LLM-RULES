# Archived Architecture Decision Records (2026-02-04)

This file contains ADRs archived from decisions.md to reduce file size.

---

## [ADR-071] Agent Capability Cards Architecture (Phase 3)

- **Date**: 2026-01-31
- **Status**: Accepted (Implementation-Ready)
- **Context**: Router uses static agent routing table (CLAUDE.md Section 3) and cannot dynamically discover agent capabilities. No mechanism exists for health-aware routing - failed agents can be repeatedly spawned. Need Phase 3 to complement Phase 2 (SkillCatalog for skills) with capability discovery for agents.
- **Decision**: Implement Agent Capability Cards system with the following architecture:
  1. **Agent Capability Card Schema** (`.claude/schemas/agent-capability-card.schema.json`): JSON Schema v7 defining id, displayName, category, capabilities[], constraints, health, metadata. Capabilities include name, domain (15 predefined), description, triggerPhrases, requiredTools, skills.
  2. **Agent Registry Generator** (`.claude/lib/tools/agent-registry-generator.cjs`): Scans `.claude/agents/**/*.md`, parses YAML frontmatter, generates capability cards, builds indices (byCapability, byDomain, byCategory), outputs to `.claude/context/agent-registry.json`.
  3. **AvailableAgents Tool** (`.claude/lib/tools/available-agents.cjs`): Query interface with filters (capability, domain, category, excludeFailed, minSuccessRate, limit). Caching (LRU, 5min TTL). Returns sorted by success rate.
  4. **Agent Health Tracker** (`.claude/lib/tools/agent-health-tracker.cjs`): State machine (healthy->degraded->unavailable). Isolation after 3 consecutive failures. Recovery window (5 minutes). Updates success rate and execution time.
  5. **Agent Health Hook** (`.claude/hooks/routing/agent-health-hook.cjs`): PostToolUse integration with Task tool. Extracts agent ID from spawn prompt. Records success/failure. Pre-spawn health check blocks unavailable agents.
- **Consequences**:
  - **Positive**:
    - Dynamic agent discovery complements static routing table
    - Health-aware routing prevents repeated failures
    - Failure isolation protects system from problematic agents
    - Recovery mechanism allows agents to return to service
    - Query API consistent with SkillCatalog (familiar pattern)
    - O(1) capability lookup via indices
  - **Negative**:
    - Additional registry file (~2KB per agent, ~100KB total)
    - Generator must run on agent file changes
    - Health state persistence requires file writes
    - ~400 lines of new code to maintain
  - **Trade-offs**:
    - Chose 3 indices (capability/domain/category) over single index (faster query)
    - Chose file-based health persistence over memory-only (survives restart)
    - Chose 3-failure isolation threshold (balance safety/availability)
    - Chose 5-min recovery window (balance cooldown/recovery speed)
- **Implementation Files**:
  - `.claude/schemas/agent-capability-card.schema.json` (~150 lines)
  - `.claude/lib/tools/agent-registry-generator.cjs` (~400 lines)
  - `.claude/lib/tools/available-agents.cjs` (~300 lines)
  - `.claude/lib/tools/agent-health-tracker.cjs` (~250 lines)
  - `.claude/hooks/routing/agent-health-hook.cjs` (~150 lines)
  - `.claude/context/agent-registry.json` (~2000 lines, auto-generated)
- **Architecture Document**: `.claude/docs/PHASE_3_IMPLEMENTATION_ARCHITECTURE.md`
- **Related ADRs**: ADR-069 (Tool Manifest), ADR-070 (SkillCatalog - Phase 2 reference)
- **Test Requirements**: 35+ tests across 4 test files
- **Integration Requirements**: CLAUDE.md Section 1.4, router.md Gate 3

---


---


---


---

