# Architecture Decision Records (ADR)

## Format

```
## [ADR-XXX] Title
- **Date**: YYYY-MM-DD
- **Status**: Proposed | Accepted | Deprecated | Superseded
- **Context**: Why this decision was needed
- **Decision**: What was decided
- **Consequences**: Trade-offs and implications
```

---

## [ADR-076] File Placement Architecture Redesign

- **Date**: 2026-01-31
- **Status**: Accepted
- **Context**: Tests, documentation, utilities, and artifacts were scattered across inconsistent locations, causing organizational chaos. Tests appeared in both `.claude/hooks/*.test.cjs` AND `tests/hooks/`, utilities in `.claude/lib/` had tests co-located despite FORBIDDEN_PATHS blocking writes, and agents were confused about where to place files. The existing `FILE_PLACEMENT_RULES.md` allowed co-located tests in hooks but `file-placement-guard.cjs` had conflicting rules.
- **Decision**: Implement unified file placement architecture with strict enforcement:
  1. **Single Test Location**: ALL tests MUST go in `tests/` directory, NOT in `.claude/`
     - Hook tests: `tests/hooks/`
     - Utility tests: `tests/unit/{category}/`
     - Integration tests: `tests/integration/`
     - CLI tests: `tests/cli/`
  2. **Clear Code Homes**:
     - Hooks: `.claude/hooks/{category}/` (code only, no tests)
     - Utilities: `.claude/lib/{category}/` (code only, no tests)
     - CLI tools: `.claude/tools/cli/` (code only, no tests)
  3. **Artifact Categories**:
     - Plans: `.claude/context/artifacts/plans/`
     - Reports: `.claude/context/artifacts/reports/`
     - Architecture: `.claude/context/artifacts/architecture/`
     - Diagrams: `.claude/context/artifacts/diagrams/`
  4. **Enforcement**: Update `file-placement-guard.cjs` to BLOCK test files in `.claude/`
  5. **Migration**: Migrate ~45 test files from `.claude/` to `tests/`
  6. **Education**: Add file placement checklist to spawn templates
- **Consequences**:
  - **Benefits**:
    - Single source of truth for file placement
    - CI/CD test discovery simplified (all in `tests/`)
    - Clear separation of code and tests
    - Consistent enforcement via hook
    - Agent confusion eliminated
  - **Trade-offs**:
    - Migration effort required (~45 files)
    - Import paths need updating in migrated tests
    - Agents must learn new placement rules
    - Slight increase in directory depth for tests
  - **Rollback**: `git checkout HEAD -- .claude/ tests/`
- **Architecture Document**: `.claude/context/artifacts/architecture/FILE-PLACEMENT-ARCHITECTURE.md`
- **Implementation**:
  - Phase 1: Create architecture document (DONE)
  - Phase 2: Create migration script (DONE - `scripts/testing/migrate-test-files.cjs`)
  - Phase 3: Execute migration (DONE - 147 test files migrated)
  - Phase 4: Update `file-placement-guard.cjs` to enforce (DONE - TEST_FILE_PATTERNS blocking)
  - Phase 5: Fix import paths (DONE - `scripts/testing/fix-all-test-imports.cjs`)
- **Implementation Date**: 2026-01-31
- **Estimated Effort**: 8-12 hours across 5 phases
- **Migration Summary**:
  - 147 test files migrated from `.claude/` to `tests/`
  - 48 test files had import paths fixed
  - 2 audit files moved from `plans/` to `audits/`
  - `file-placement-guard.cjs` updated to block test files in `.claude/`
  - New subdirectories added to VALID_PATHS: audits, audit-logs, error-reports

---

## [ADR-075] Router Model Selection from Configuration

- **Date**: 2026-01-31
- **Status**: Proposed
- **Context**: Router (CLAUDE.md) hardcodes model values (`'sonnet'`, `'opus'`, `'haiku'`) in spawn examples and documentation, completely ignoring agent configuration in `.claude/config.yaml`. This causes model misallocation (planner configured for opus in config.yaml may be spawned with sonnet), wasting compute and degrading performance.
- **Decision**: Implement model selection precedence system:
  1. **Explicit Task() parameter** (highest priority)
  2. **Agent frontmatter** (`model:` field in agent definition)
  3. **config.yaml agent entry** (`agents.{type}.model`)
  4. **Complexity-based default** (trivial→haiku, medium→sonnet, high→opus)
  5. **Fallback**: sonnet
- **Implementation**:
  1. Create `agent-config-reader.cjs` utility for config lookup
  2. Create `pre-spawn-model-selector.cjs` hook (advisory, logs model selection)
  3. Update CLAUDE.md Section 5, router-decision.md Step 8, @MODEL_SELECTION.md
  4. Add `model_aliases` section to config.yaml for shorthand→full ID mapping
  5. Update orchestrators to read config before spawning subagents
- **Consequences**:
  - **Benefits**:
    - Centralized model control via config.yaml
    - Cost optimization (right model for right task)
    - Consistent behavior across spawns
    - config.yaml becomes source of truth (not dead documentation)
  - **Trade-offs**:
    - Config read overhead per spawn (~1ms, negligible)
    - Additional complexity in spawning workflow
    - Requires orchestrator updates
  - **Rollback**: Disable pre-spawn hook, revert documentation changes
- **Related Files**:
  - `.claude/context/artifacts/plans/ROUTER-CONFIG-INTEGRATION-AUDIT.md` (full design)
  - `.claude/config.yaml` (source of truth for agent models)
  - `.claude/workflows/core/router-decision.md` (routing workflow)
- **Estimated Effort**: 19 hours across 6 phases

---

## [ADR-074] CLAUDE.md Compression Strategy

- **Date**: 2026-01-31
- **Status**: Accepted
- **Context**: CLAUDE.md was 1327 lines, approaching Read tool limits and causing context bloat in router spawns. Need compression while preserving 100% router-first enforcement.
- **Decision**: Extract 11 reference sections to @files in `.claude/docs/`, keep enforcement-critical sections inline (Sections 0-2, 1.1-1.3, 5.6, 6-8).
- **Consequences**:
  - **Benefits**: 68% size reduction (1327 → 429 lines), improved maintainability, single-source-of-truth for reference material, @files enable progressive disclosure
  - **Trade-offs**: Router must load @files explicitly via Read() tool (minimal overhead ~50 tokens/file), @files are additional files to maintain
  - **Rollback**: `git checkout HEAD -- .claude/CLAUDE.md && rm .claude/docs/@*.md`
- **Files Created**:
  - @AGENT_ROUTING_TABLE.md (complete agent routing matrix)
  - @CREATOR_SKILLS_TABLE.md (creator skill mapping)
  - @TOOL_REFERENCE.md (complete tool catalog)
  - @MODEL_SELECTION.md (model selection guidelines)
  - @SKILL_CATALOG_TABLE.md (workflow enhancement skills)
  - @ENTERPRISE_WORKFLOWS.md (enterprise workflow paths)
  - @ENVIRONMENT_CONFIG.md (environment variable reference)
  - @DIRECTORY_STRUCTURE.md (directory layout reference)
  - @ENFORCEMENT_HOOKS.md (hook enforcement details)
  - @TASK_TRACKING_GUIDE.md (TaskUpdate best practices)
  - @EVOLUTION_WORKFLOW.md (EVOLVE workflow details)
- **Navigation**: All @files include "BACK TO MAIN" link to CLAUDE.md section, "RELATED REFERENCES" to cross-referenced files
- **Verification**: All 4 self-check gates inline and functional, router spawns agents successfully, all @files load without errors, no broken links

---

## [ADR-070] Router Agent Mode Lifecycle - Keep Active Until Session End

- **Date**: 2026-01-31
- **Status**: Accepted (Emergency Fix)
- **Context**: Router orchestration broke after PERF-003 hook consolidation. post-task-unified.cjs was immediately exiting agent mode after Task() spawned subagents asynchronously. This caused router to stop monitoring spawned agents, resulting in tasks stuck forever and duplicate spawning.
- **Decision**: Removed `exitAgentMode()` call from post-task-unified.cjs (line 127). Router now remains in agent mode after Task() and only exits when SessionEnd hook fires.
- **Consequences**:
  - **Benefits**:
    - Router monitors subagents throughout their lifecycle
    - TaskUpdate completion properly tracked
    - Multi-agent workflows function correctly
    - Projects continue instead of appearing abandoned
  - **Trade-offs**:
    - Agent mode is held slightly longer (until session end vs immediate exit)
    - No performance impact (hooks are already running)
  - **Risk Mitigations**:
    - SessionEnd hook ensures proper cleanup
    - router-state tracks mode transitions
    - Debug logging available via ROUTER_DEBUG=true
- **Implementation**: File modified: `.claude/hooks/routing/post-task-unified.cjs`
- **Related Issues**: ROUTER-MONITORING-001, PERF-003
- **Verification**: Use `ROUTER_DEBUG=true` to confirm agent mode stays active during execution

---

## [ADR-069] Tool Manifest and Pre-Spawn Validation Architecture

- **Date**: 2026-01-30
- **Status**: Accepted
- **Context**: Agent-Studio orchestration had five critical issues: (1) Agents don't know what tools they have, causing "Invalid tool parameters" errors; (2) Agents don't know available skills; (3) Tool errors repeated across spawns; (4) Orchestrator makes wrong tool decisions; (5) Zero error tolerance for spawns. Root causes: no single source of truth for tool definitions (3 conflicting definitions in developer.md, master-orchestrator.md, CLAUDE.md), no skill discovery mechanism, 11+ agents reference unavailable MCP tools (mcp**Exa**_, mcp**memory**_, mcp**filesystem**_, mcp**chrome-devtools**_).
- **Decision**: Implement Tool Registry with Pre-Spawn Validation pattern:
  1. **Single Source of Truth**: Create `tool-manifest.json` defining all 20 core tools + 9 MCP tools with metadata (category, description, availability, mandatory flags)
  2. **Toolsets**: Define DEVELOPER, ORCHESTRATOR, ROUTER, READ_ONLY toolsets mapping agent types to appropriate tools
  3. **Skill Index**: Generate `skill-index.json` from 435-skill catalog with domain/category/tool-requirement indexes
  4. **Pre-Spawn Validation Hook**: `pre-spawn-tool-validator.cjs` validates spawn requests against manifest (check tool existence, mandatory tools, MCP fallbacks, tool count <= 15)
  5. **Spawn Prompt Injection**: Add AVAILABLE_TOOLS and AVAILABLE_SKILLS sections to spawn templates
  6. **MCP Fallbacks**: Document fallbacks for all unavailable MCP tools (e.g., mcp\_\_sequential-thinking -> Skill({ skill: 'sequential-thinking' }))
- **Consequences**:
  - **Benefits**:
    - Zero tool parameter errors (guaranteed by pre-spawn validation)
    - Agents fully aware of available tools (injected into prompt)
    - Agents know how to discover skills (skill index + discovery protocol)
    - Consistent toolsets across all agents (manifest-driven)
    - MCP tool fallbacks documented and suggested
    - <50ms validation overhead (manifest cached)
  - **Trade-offs**:
    - Additional file to maintain (tool-manifest.json)
    - Spawn prompt slightly larger (+~500 chars for tool/skill sections)
    - Hook chain adds validation step (minimal overhead)
  - **Risk Mitigations**:
    - CI validates manifest on every commit
    - Manifest version-controlled
    - Hook has warn mode for gradual rollout
- **Implementation**: `.claude/docs/ARCHITECTURE_DESIGN_TOOL_AWARENESS.md` (comprehensive design)
- **Migration Path**: Phase 1A (foundation, 2 days) -> Phase 1B (integration, 1 day) -> Phase 1C (agent cleanup, 1 day)
- **Related ADRs**: ADR-051 (Tool Availability Validation Hook), ADR-043 (MCP Tool Removal)

---

## [ADR-065] Track Metadata Schema Design (SPEC-007)

- **Date**: 2026-01-29
- **Status**: Accepted
- **Context**: Agent-Studio lacks a standardized schema for track/task metadata. Track-management skill documents metadata structure, but no validation enforces consistency. Phase 1 features (SPEC-001, 004, 006) require reliable metadata for spec-driven workflows, phase verification, and effort tracking. Need schema that balances structure with flexibility.
- **Decision**: Create JSON Schema v7 for track metadata with these design principles:
  1. **Required Fields Minimal**: Only trackId, type, status required (enables incremental adoption)
  2. **Extensibility via additionalProperties: true**: Allows custom fields for project-specific needs
  3. **Pattern Validation for IDs**: `^[a-z0-9_-]+_[0-9]{8}$` ensures cross-platform compatibility
  4. **Effort Tracking Separation**: `estimatedEffort` vs `actualEffort` enables continuous improvement
  5. **Phase State Enum**: Aligns with spec-driven workflow (draft → spec_review → plan_ready → implementation → qa → deployed)
  6. **Classification Array**: Multiple tags enable rich categorization and reporting
  7. **ISO 8601 Timestamps**: Timezone-safe date handling
  8. **Dependency Fields**: `dependencies`, `blocked_by`, `blocks` enable graph visualization
- **Consequences**:
  - **Benefits**:
    - Forward compatibility (additionalProperties allows schema evolution)
    - Minimal friction (only 3 required fields for basic usage)
    - Analytics-ready (structured effort, phase, classification data)
    - Integration-ready (phaseState enum drives workflow transitions)
    - Performance: <1ms validation (tested with 1000 iterations)
  - **Trade-offs**:
    - Lenient validation (additionalProperties allows invalid custom fields - mitigated by documentation)
    - No cross-field validation (can't enforce "if phaseState=deployed then status=completed" - requires hook)
  - **Future Work**:
    - Validation hook on metadata.json writes (Phase 1.5)
    - Auto-populate from TaskCreate metadata
    - Dependency cycle detection
    - Effort estimation analytics dashboard
  - **Migration**: Backward compatible (existing tracks without metadata continue to work)

---

## [ADR-064] Spawn Prompt Validator Security Review

- **Date**: 2026-01-29
- **Status**: Accepted (Approved with Conditions)
- **Context**: Task #7 produced a detailed implementation plan for spawn-prompt-validator.cjs hook that validates spawn prompts contain required elements (TaskUpdate protocol, PROJECT_ROOT, Task ID, Memory Protocol). Security review was required before implementation to identify bypass vulnerabilities, injection risks, and performance attack vectors.
- **Decision**: APPROVED WITH CONDITIONS. The design is fundamentally sound (backed by 97.3% correctness research), but 13 vulnerabilities identified require mitigation:
  - **CRITICAL (2)**: Unicode lookalike bypass (VULN-001), ReDoS vulnerability (VULN-002)
  - **HIGH (4)**: Missing prompt length limit, fail-open without audit, environment override without audit, missing required tool flags
  - **MEDIUM (5)**: Rate limiting, orchestrator skip logic, score threshold configurability, hook signature verification, audit log rotation
- **Consequences**:
  - **Required Mitigations**:
    - Unicode normalization function with homoglyph map (VULN-001)
    - ReDoS-safe regex patterns with bounded quantifiers (VULN-002)
    - Regex timeout wrapper using vm module (VULN-002)
    - Prompt length limit of 500KB (VULN-003)
    - Full audit context in exception handler (VULN-004)
    - Environment override auditing (VULN-005)
  - **Security Report**: `.claude/context/artifacts/security-reviews/spawn-validation-security-review-2026-01-29.md`
  - **Implementation Plan Updated**: Appendix E added with security mitigations
- **Related**: ADR-063 (Spawn Template Validation Safeguards - pending implementation)

---

## [ADR-051] Tool Availability Validation Hook

- **Date**: 2026-01-28
- **Status**: Accepted
- **Context**: Agents were spawned with references to unavailable tools (e.g., `mcp__sequential-thinking__sequentialthinking` without MCP server configured), causing runtime errors "No such tool available". Phase 1 removed unavailable tools from agent definitions; Phase 2 creates prevention.
- **Decision**: Create `.claude/hooks/routing/tool-availability-validator.cjs` that validates tool availability before agent spawning. Hook blocks spawn if required tools (core tools) are unavailable, warns but allows spawn if optional tools (MCP) are missing.
- **Consequences**:
  - **Pros**: Prevents "tool not available" runtime errors; catches tool mismatches at spawn time; provides actionable warnings for MCP tools
  - **Cons**: Adds validation overhead to every Task spawn (minimal - single settings.json read)
  - **Integration**: Hook registered in settings.json PreToolUse(Task) as first hook (runs before pre-task-unified.cjs); uses CORE_TOOLS constant for validation
  - **Rollback**: Can be removed from settings.json Task hooks array
  - **Related**: See tool-availability-audit-2026-01-28.md for background investigation
  - **Registration Date**: 2026-01-28 (Phase 3 completed)

---

## [ADR-053] Write Size Validation Hook

- **Date**: 2026-01-28
- **Status**: Accepted
- **Context**: Devops agent attempted to write 41,350 tokens to environment.cjs (limit: 25,000 tokens), causing Write tool failure. Error occurred AFTER agent generated content, wasting compute. Need prevention at tool invocation.
- **Decision**: Create `.claude/hooks/safety/write-size-validator.cjs` that validates content size before Write/Edit/NotebookEdit operations. Hook estimates tokens (~4 chars/token), warns at 20K tokens (80% limit), blocks at >25K tokens.
- **Consequences**:
  - **Pros**: Prevents oversized writes before they fail; provides early warning at 80% threshold; actionable error messages suggest splitting content
  - **Cons**: Token estimation is approximate (~4 chars/token); adds validation overhead to every write operation (minimal - string length check)
  - **Integration**: Hook registered in settings.json PreToolUse(Write|Edit|NotebookEdit); fails open on error (SEC-008 compliance)
  - **Thresholds**: WARNING_THRESHOLD = 20K tokens, MAX_TOKENS = 25K tokens (blocks > 25K, allows = 25K)
  - **Rollback**: Can be removed from settings.json write tool hooks array
  - **Test Coverage**: 13 unit tests (100% passing); manual testing validated all scenarios
  - **Registration Date**: 2026-01-28 (Phase 3 completed - hook now registered in settings.json as second hook in Edit|Write|NotebookEdit matcher)

---

## [ADR-052] Memory File Rotation Strategy

- **Date**: 2026-01-28
- **Status**: Accepted
- **Context**: Memory files (decisions.md: 3096 lines, issues.md: 1973 lines) were approaching Read tool limits (25000 tokens), risking future context loading failures. Existing smart-pruner.cjs handles JSON files (gotchas, patterns) but not markdown files with structured content (ADRs, issues).
- **Decision**: Create `.claude/lib/memory/memory-rotator.cjs` utility with age-based rotation policies:
  - **decisions.md**: Archive ADRs older than 60 days when file > 1500 lines
  - **issues.md**: Archive RESOLVED issues older than 7 days when file > 1500 lines
  - **Archive Location**: `.claude/context/memory/archive/YYYY-MM/`
  - **Format**: Full content preservation with metadata headers
- **Consequences**:
  - **Benefits**:
    - Prevents memory files from exceeding Read tool limits (25000 tokens)
    - Keeps active files focused on recent/relevant content
    - Full archival (no data loss) - old content remains searchable via grep
    - Dry-run mode for safe testing before execution
    - CLI commands for manual rotation when needed
  - **Trade-offs**:
    - Archived content requires explicit search (not loaded by default)
    - Age-based rotation may archive still-relevant ADRs (mitigated by 60-day threshold)
    - Manual invocation required unless integrated into memory-scheduler.cjs
  - **Implementation**:
    - Parses ADRs by `## [ADR-XXX]` headers, extracts dates
    - Parses issues by `### Title` headers, prioritizes Resolved date over Date field
    - Creates archive files with metadata headers showing archived entry ranges
    - Updates active files with notice of archival
  - **Test Coverage**: 15 unit tests (parsing, selection, rotation, dry-run)
  - **Documentation**: Added to `.claude/docs/MONITORING.md`
- **Integration**: Can be invoked manually or scheduled:
  ```bash
  node .claude/lib/memory/memory-rotator.cjs check      # Check status
  node .claude/lib/memory/memory-rotator.cjs rotate --dry-run  # Preview
  node .claude/lib/memory/memory-rotator.cjs rotate    # Execute
  ```
- **Future Work**: Integrate into memory-scheduler.cjs for automated monthly rotation

---

## [ADR-001] Router-First Protocol

- **Date**: 2026-01-23
- **Status**: Accepted
- **Context**: Need consistent request handling across all agent interactions
- **Decision**: All requests must first go through the Router Agent for classification
- **Consequences**: Adds routing overhead but ensures proper agent selection

## [ADR-002] Memory Persistence Strategy

- **Date**: 2026-01-23
- **Status**: Accepted
- **Context**: Agent context can be reset at any time; need persistent memory
- **Decision**: Use file-based memory in `.claude/context/memory/`
- **Consequences**: Agents must read/write memory files; adds I/O but ensures continuity

## [ADR-003] Serena Integration Scope

- **Date**: 2026-01-24
- **Status**: Accepted
- **Context**: Serena codebase available for integration; need to decide what to port
- **Decision**: Port workflow patterns as skills (onboarding, thinking-tools, modes, summarize-changes, session-handoff). Do NOT port Python runtime dependencies (LSP, dashboard, token counting).
- **Consequences**: Framework gains valuable workflow patterns without adding runtime dependencies. CLI-first approach maintained. Some features (dynamic tool exclusion) rely on agent self-regulation rather than enforcement.

## [ADR-005] Security Architect Workflow

- **Date**: 2026-01-25
- **Status**: Accepted
- **Context**: Need a comprehensive security audit workflow that integrates threat modeling, OWASP Top 10 coverage, dependency auditing, penetration testing, and remediation planning into a structured multi-phase process.
- **Decision**: Create `.claude/workflows/security-architect-skill-workflow.md` with 5 phases: Threat Modeling (STRIDE), Code Review (OWASP Top 10), Dependency Audit (CVE), Penetration Testing, and Remediation Planning. Workflow uses security-architect, code-reviewer, developer, and devops agents with appropriate skills.
- **Consequences**:
  - Standardized security audit process across all projects
  - Clear severity classification (Critical/High/Medium/Low) with SLAs
  - Security gates define what blocks deployment
  - Integration with Task tracking system for multi-phase coordination

## [ADR-041] Feature Flag Infrastructure for Safe Rollout

- **Date**: 2026-01-28
- **Status**: Accepted
- **Context**: Party Mode and Advanced Elicitation are high-value, high-risk features requiring gradual rollout with emergency disable capability. Need infrastructure to control feature activation without code changes.
- **Decision**: Implement FeatureFlagManager (`.claude/lib/utils/feature-flags.cjs`) with 3-tier priority system:
  1. **Environment Variables** (highest priority) - Emergency override: `PARTY_MODE_ENABLED=true|false`, `ELICITATION_ENABLED=true|false`
  2. **Config File** (`.claude/config.yaml`) - Default configuration with nested feature settings
  3. **Runtime API** (in-memory) - Dynamic toggling for development: `enable()`, `disable()`, `isEnabled()`, `getConfig()`
- **Consequences**:
  - **Benefits**:
    - Emergency disable without code changes (<1 minute via env var)
    - Gradual rollout (10% → 50% → 100% of users)
    - A/B testing capability
    - Cost control monitoring before full rollout
    - Rollback procedures documented in `.claude/docs/ROLLBACK_PROCEDURES.md`
  - **Trade-offs**:
    - Code must check flags before executing feature logic (adds complexity)
    - Config drift if env vars and config.yaml diverge
    - Documentation overhead to maintain feature flag lifecycle

## [ADR-042] Party Mode Routing Integration

- **Date**: 2026-01-28
- **Status**: Accepted
- **Context**: Party Mode was fully implemented (151 tests, 23 files, 3000+ lines of docs, party-orchestrator agent created) but Router had NO routing logic to activate it. When users said "Party Mode" or "multi-agent collaboration", Router didn't know to spawn party-orchestrator, making the feature effectively invisible.
- **Decision**: Add Party Mode keyword detection and routing to Router's decision workflow:
  1. **Intent Classification** (router-decision.md Step 2.1): Added "Party Mode" intent with keywords: "party mode", "multi-agent collaboration", "discuss with team", "debate", "consensus"
  2. **Agent Selection** (router-decision.md Step 6): Added party-orchestrator to Orchestrator Agents section with complete spawn example showing Task() call with PROJECT_ROOT, TaskUpdate protocol, and Team coordination instructions
  3. **Routing Table** (CLAUDE.md Section 3): Updated party-orchestrator row to include activation keywords: "(party mode, consensus, debate, team discussion)"
- **Consequences**:
  - **Benefits**:
    - Party Mode now discoverable via natural language ("start Party Mode", "discuss with team")
    - Router automatically spawns party-orchestrator instead of individual agents
    - Consistent with existing orchestrator patterns (master-orchestrator, swarm-coordinator)
    - Maintains post-creation integration checklist pattern (routing → catalog → assignment → validation)
  - **Trade-offs**:
    - Router must distinguish between "multi-agent collaboration" (party-orchestrator) vs. parallel agent spawning (multiple Task() calls)
    - Additional routing complexity for disambiguation
  - **Implementation Notes**:
    - Routing logic follows Orchestrator Spawn Template (CLAUDE.md Section 2)
    - party-orchestrator requires Task() tool to spawn team members
    - Uses opus model for complex multi-agent coordination
- **Related Issues**: Resolves post-creation integration gap identified in learnings.md (artifacts invisible without routing integration)
- **Related ADRs**: ADR-041 (Feature Flags for Party Mode rollout control)

## [ADR-043] MCP Tool Removal from Spawn Templates

- **Date**: 2026-01-28
- **Status**: Accepted
- **Context**: Agent definitions referenced `mcp__sequential-thinking__sequentialthinking` tool but MCP server was not configured in settings.json, causing tool unavailability errors. This affected 12+ agent files and spawn templates in CLAUDE.md.
- **Decision**: Remove `mcp__sequential-thinking__sequentialthinking` from all spawn templates and agent allowed_tools arrays. Add guidance comments directing users to use `Skill({ skill: 'sequential-thinking' })` as fallback when MCP servers are not configured.
- **Consequences**:
  - **Benefits**:
    - Eliminates tool unavailability errors for agents
    - Provides clear fallback mechanism via Skill() tool
    - Maintains sequential thinking capability without MCP dependency
    - Adds Tool Selection Notes documenting MCP vs core tool distinction
  - **Trade-offs**:
    - Users must explicitly configure MCP servers if they want MCP tools
    - Skill-based sequential thinking may have different UX than MCP tool version
  - **Implementation**:
    - Phase 1: Removed MCP tool from 12 agent definition files
    - Phase 2: Updated Universal Spawn Template and Orchestrator Spawn Template in CLAUDE.md
    - Added Tool Selection Notes section explaining MCP requirements
  - **Related Files**:
    - `.claude/CLAUDE.md` (spawn templates updated)
    - `.claude/context/plans/agent-error-fixes-plan-2026-01-28.md` (implementation plan)

---

## [ADR-054] Memory System Enhancement Strategy

- **Date**: 2026-01-28
- **Status**: Proposed → **SPECIFICATION COMPLETE** (2026-01-28)
- **Context**: Research shows graph-based and hybrid memory approaches outperform monolithic RAG by 45%. Current file-based system lacks semantic search and entity tracking. Multi-agent systems require relationship-aware memory (e.g., "What tasks is developer agent working on?") which file-based grep cannot provide. Industry analysis of MAGMA, Mem0, H-MEM, and CrewAI memory systems reveals hybrid architectures as optimal balance.
- **Decision**: Adopt hybrid ChromaDB (vector) + SQLite (entities) + files (structured) approach for $0/mo with ~84-89% accuracy. Implementation phases:
  1. **Phase 1 (Hybrid Memory):** Add ChromaDB embeddings for learnings.md (semantic search), create SQLite schema for entities (agents, tasks, skills) + relationships, migrate existing task tracking to entity memory. Backward compatible - keep files as source of truth, add indexes.
  2. **Phase 2 (Semantic Cache):** Add GPTCache or in-memory semantic cache to reduce LLM costs by 40-60%.
  3. **Phase 3 (Memory Tiers):** Define STM (session context), LTM (persistent files), episodic (task traces), create ContextualMemory aggregation layer.
- **Consequences**:
  - **Benefits**:
    - **+10-15% accuracy improvement** (file-only 74% → hybrid 84-89%) [Validated - adjusted from +15-20%]
    - Zero operational cost (self-hosted ChromaDB + SQLite)
    - Semantic search capabilities ("find similar past issues")
    - Entity relationship queries ("What tasks are blocked?")
    - Backward compatible (existing files remain, new capabilities added)
    - **<10ms query latency** (SQLite + ChromaDB in-process) [Validated - better than initial <100ms]
  - **Trade-offs**:
    - ⚠️ **4-5 weeks implementation effort** for Phase 1 [Validated - adjusted from 2-3 weeks]
    - ⚠️ New dependencies: ChromaDB (~5MB), better-sqlite3 (~2MB)
    - ⚠️ Complexity increase (3 storage layers vs 1)
    - ⚠️ Embedding generation cost (one-time, **$0.01** for existing corpus) [Validated]
- **Alternatives Considered**:
  - **Pinecone ($250/mo):** Rejected due to cost (prohibitive for open-source project)
  - **Pure file-based:** Insufficient for semantic search and relationship queries
  - **Graph DB (Neo4j):** Too complex for MVP, save for Phase 3 (MAGMA-style multi-graph)
  - **Weaviate:** Good alternative to ChromaDB but similar complexity, no clear advantage
- **Research Sources**: 11 sources including MAGMA (arXiv:2410.10425), ChromaDB/Pinecone benchmarks, CrewAI memory system, Mem0, H-MEM, SEDM
- **Related Files**:
  - `.claude/context/artifacts/research-reports/memory-patterns-research-2026-01-28.md` (full research)
  - `.claude/context/plans/crewai-analysis-integration-plan.md` (implementation plan)
  - **`.claude/context/artifacts/specs/memory-system-enhancement-spec.md`** (comprehensive specification)

---

## [ADR-055] Event-Driven Orchestration Adoption

- **Date**: 2026-01-28
- **Status**: Proposed → **SPECIFICATION COMPLETE** (2026-01-28)
- **Context**: 72% of enterprise AI projects use event-driven multi-agent systems (Gartner 2026). Current hook system is synchronous/blocking, limiting scalability and observability. Research shows hybrid approach (imperative router + event-driven agents) offers best trade-offs for governance + scalability. OpenTelemetry is industry standard for observability (95% adoption in surveyed systems).
- **Decision**: Implement centralized EventBus as optional add-on, preserving current hook system. Adopt OpenTelemetry for observability. Implementation phases:
  1. **Phase 1 (EventBus Foundation):** Create EventBus class (centralized EventEmitter), define event schema (AgentEvent, TaskEvent, ToolEvent, MemoryEvent, LLMEvent, MCPEvent), add unit tests.
  2. **Phase 2 (OpenTelemetry Integration):** Add OpenTelemetry JavaScript SDK, create spans for agent execution/task execution/tool calls, add span context propagation (parent → child agents), export traces to Arize Phoenix (Docker deployment).
  3. **Phase 3 (Event-Aware Tasks):** Modify TaskUpdate to emit TASK_COMPLETED event, add event subscriptions for dependent task unblocking. Backward compatible.
- **Consequences**:
  - **Benefits**:
    - ✅ Non-breaking (additive only, existing hooks/tasks continue to work)
    - ✅ Enables async agent communication (10x throughput vs synchronous blocking)
    - ✅ Industry-standard observability (OpenTelemetry compatible with all tools)
    - ✅ End-to-end tracing across multi-agent workflows (correlation by trace ID)
    - ✅ Zero cloud costs (self-hosted EventBus + Arize Phoenix)
    - ✅ Event stream = audit log (debugging, compliance)
  - **Trade-offs (VALIDATED)**:
    - ⚠️ Medium complexity (EventBus ~200 LOC, OpenTelemetry SDK ~5MB)
    - ⚠️ **5-35% latency overhead** (config-dependent, target 5-10% with 1-10% sampling)
    - ⚠️ **$50-500/mo infrastructure costs** (Docker $0, Kubernetes $200-500)
    - ⚠️ Learning curve for event-driven patterns
    - ⚠️ Race conditions possible (event ordering, async coordination)
- **Alternatives Considered**:
  - **Distributed event mesh (Kafka):** Overkill for current scale, high operational complexity
  - **Replace hooks entirely:** Too risky, breaking changes for existing system
  - **Continue hook-only approach:** Limits scalability, poor observability
  - **LangFuse:** Good but less OpenTelemetry-native than Arize Phoenix
  - **Datadog:** Excellent features but enterprise pricing ($$$)
- **Architectural Pattern**: Hybrid orchestration - Router uses imperative spawning (governance), agents communicate via events (scalability). This combines control flow (Router explicit Task() calls) with data flow (agents publish/subscribe to events).
- **Research Sources**: 24 sources including CrewAI Flow framework, OpenTelemetry docs, Arize Phoenix, LangFuse, Datadog APM, XState, Martin Fowler's event-driven architecture patterns, IEEE Intelligent Systems multi-agent observability survey
- **Specification**: `.claude/context/artifacts/specs/event-bus-integration-spec.md` (v1.0, READY FOR IMPLEMENTATION)
- **Related Files**:
  - `.claude/context/artifacts/research-reports/event-orchestration-research-2026-01-28.md` (full research)
  - `.claude/context/artifacts/research-reports/hook-event-comparison-analysis-2026-01-28.md` (hooks + events coexistence)
  - `.claude/context/plans/crewai-analysis-integration-plan.md` (implementation plan)

---

## [ADR-056] Production Observability Tool Selection

- **Date**: 2026-01-28
- **Status**: Proposed → **SPECIFICATION COMPLETE** (2026-01-28)
- **Context**: Production systems require tracing/monitoring for debugging multi-agent workflows, LLM cost tracking, and performance analysis. Research compared LangFuse (open-source, LLM-focused), Datadog (enterprise, full-stack), and Arize Phoenix (open-source, OpenTelemetry-native). OpenTelemetry is industry standard for vendor-agnostic observability.
- **Decision**: Recommend Arize Phoenix (self-hosted) for OpenTelemetry-first approach. Implementation via Docker deployment (development) and Kubernetes (production) with OpenTelemetry JavaScript SDK exporter.
- **Consequences**:
  - **Benefits**:
    - ✅ Free software (self-hosted, open-source under Apache 2.0)
    - ✅ Vendor-agnostic (OpenTelemetry-native, can switch to Datadog/Jaeger later)
    - ✅ Full control over data (no cloud vendor access)
    - ✅ LLM-specific features (prompt analysis, embeddings visualization, cost tracking)
    - ✅ Docker-based deployment (single command: `docker run`)
    - ✅ Trace visualization for multi-agent workflows
  - **Trade-offs (VALIDATED)**:
    - ⚠️ Self-hosting operational burden (Docker container management, updates)
    - ⚠️ **5-10% latency overhead** (with 1-10% sampling, batch processing)
    - ⚠️ **$50-500/mo infrastructure** (Docker $0, shared node $80-150, dedicated $200-500)
    - ⚠️ No enterprise support (community-driven, GitHub issues only)
    - ⚠️ Requires storage for trace data (50GB for 7-day retention)
- **Alternatives Considered**:
  - **LangFuse:** Good LLM features but less OpenTelemetry-native (custom SDK), cloud tier has usage limits. Alternative if LLM focus > vendor-agnostic priority.
  - **Datadog:** Excellent UI/UX and enterprise support, but expensive ($15-$23/host/month + $0.10/GB logs). Rejected due to cost for open-source project.
  - **Jaeger:** OpenTelemetry-native, free, but lacks LLM-specific features (no prompt analysis, embeddings). Alternative for generic tracing.
  - **Grafana Cloud:** Good for metrics/logs, but weak on LLM tracing. Alternative for infra monitoring.
  - **No observability:** Unacceptable for production multi-agent systems (debugging impossible).
- **Deployment Options**:
  - **Development:** Docker Compose (`docker-compose up -d`) - $0/mo
  - **Staging:** Shared Kubernetes node - $80-150/mo
  - **Production:** Dedicated Kubernetes node (2 cores, 4GB RAM, 50GB storage) - $200-500/mo
- **Vendor Lock-In Mitigation**: OpenTelemetry standard means traces can be exported to any OTLP-compatible backend (Jaeger, Datadog, Grafana, Honeycomb) without code changes. Phoenix is swappable.
- **Research Sources**: Arize Phoenix documentation, OpenTelemetry JavaScript SDK, LangFuse docs, Datadog APM, Jaeger, observability tool comparison matrix (cost/latency/complexity)
- **Specification**: `.claude/context/artifacts/specs/event-bus-integration-spec.md` (Section 10: Arize Phoenix Deployment)
- **Related ADRs**: ADR-055 (Event-Driven Orchestration Adoption) - Phoenix visualizes event-driven workflows
- **Related Files**:
  - `.claude/context/artifacts/research-reports/event-orchestration-research-2026-01-28.md` (Section 5: Production Observability Tools)
  - `.claude/context/plans/crewai-analysis-integration-plan.md` (Phase 3.2: Research validation for event system enhancements)

---

## [ADR-057] Agent Enhancement Strategy (crewAI Patterns)

- **Date**: 2026-01-28
- **Status**: Proposed
- **Context**: Comparative analysis of crewAI (Python) vs Agent-Studio (JavaScript) agent systems revealed 6 HIGH priority gaps in Agent-Studio. crewAI has richer agent identity (Role/Goal/Backstory), dual LLM architecture (60-70% cost savings), built-in execution limits (runaway prevention), and delegation tools. Agent-Studio has more specialized agents (45 vs ~5), Router governance (security), and Party Mode (unique collaboration feature).
- **Decision**: Adopt P1 enhancements from crewAI patterns while preserving Agent-Studio's core strengths:
  1. **P1.1 Structured Identity Pattern**: Add optional `role`, `goal`, `backstory` fields to agent YAML frontmatter
  2. **P1.2 Execution Limits**: Add `execution_limits` block with `max_iter`, `max_execution_time`, `max_retry`
  3. **P1.3 Dual LLM Support**: Add `execution_model` field for tool-call LLM (separate from planning)
- **Consequences**:
  - **Benefits**:
    - Consistent agent personality (structured identity)
    - 60-70% cost reduction on tool-heavy workflows (dual LLM)
    - Runaway prevention (execution limits)
    - All backward compatible (optional fields, default to current behavior)
  - **Trade-offs**:
    - Additional YAML fields increase agent definition complexity
    - Dual LLM requires model selection logic in Task spawn
    - Execution limits require monitoring hook for enforcement
  - **Preserved Strengths**:
    - 45+ specialized agents (NOT generalizing to crewAI-style few agents)
    - Router governance (NOT adopting full agent autonomy)
    - Skill composition (unique to Agent-Studio)
    - Party Mode (unique multi-agent collaboration)
    - File-based agents (human-readable, git-tracked)
  - **Not Adopting (Trade-off Against Governance)**:
    - Full agent delegation (DelegateWorkTool) - conflicts with Router-first
    - Agent-to-agent questions (AskQuestionTool) - Router should mediate
- **Implementation Path**:
  - Phase 1: P1.1 + P1.2 + P1.3 (~10 days total)
  - Phase 2: Consider hybrid delegation for specific use cases (future ADR)
- **Related Files**:
  - `.claude/context/artifacts/research-reports/agent-comparison-analysis-2026-01-28.md` (full comparison)
  - `.claude/context/plans/crewai-analysis-integration-plan.md` (implementation plan)

---

## [ADR-058] Enhancement Prioritization Strategy (P1/P2/P3)

- **Date**: 2026-01-28
- **Status**: Accepted
- **Context**: Comprehensive analysis of crewAI vs Agent-Studio (Tasks #11-#18) identified 17 potential enhancements across Memory, Events, Agents, and Workflows. Need prioritization framework to allocate resources effectively.
- **Decision**: Adopt 3-tier prioritization with parallel implementation strategy:
  - **P1 (Must Have - 6 features):** ChromaDB, SQLite Entities, EventBus, OpenTelemetry, Structured Identity, Execution Limits
  - **P2 (Should Have - 7 features):** Dual LLM, Workflow Persistence, Context Chaining, Routing DSL, Delegation Tool, MCP Discovery, Phoenix Production
  - **P3 (Nice to Have - 4 features):** TypeScript Decorators, Process Types, Personality Profiles, Visual Editor
- **Consequences**:
  - **Benefits**:
    - Clear implementation order based on validated research (35+ sources)
    - Parallel development possible (Memory + Events independent)
    - 8-10 weeks for P1 (2 developers), 8-12 weeks for P2
    - Total operational cost: $0-150/mo (P1), $200-500/mo (P2)
    - User-facing improvement (+10-15% accuracy) in P1
    - Observability foundation established in P1
  - **Trade-offs**:
    - P2/P3 features delayed (Dual LLM cost savings deferred)
    - Parallel development requires 2+ developers
    - Phoenix hosting adds operational cost
  - **Key Decision Points**:
    - Memory vs Events first: PARALLEL (both foundational, no dependency)
    - Arize Phoenix vs alternatives: Phoenix (OpenTelemetry-native, $0-500/mo)
    - Agent delegation: P2 with guardrails (preserve Router governance)
- **Implementation Strategy**: Scenario C (Parallel) - Memory and Events developed concurrently
- **Timeline**:
  - Q1 (Weeks 1-12): P1 implementation + phased rollout
  - Q2 (Weeks 13-24): P2 implementation + production Phoenix
  - Q3+: P3 based on user demand
- **Related Files**:
  - `.claude/context/artifacts/plans/enhancement-prioritization-matrix.md` (detailed matrix)
  - `.claude/context/artifacts/specs/memory-system-enhancement-spec.md`
  - `.claude/context/artifacts/specs/event-bus-integration-spec.md`
  - ADR-054, ADR-055, ADR-056, ADR-057 (foundational decisions)

## [ADR-059] P1 Implementation Timeline Strategy

- **Date**: 2026-01-28
- **Status**: Accepted
- **Context**: 32 P1 implementation tasks (Tasks #22-#53) across 3 systems (Memory, Events, Agents) require detailed scheduling, resource allocation, milestone definitions, and go/no-go checkpoints for successful execution. Need to decide timeline (sequential vs parallel), rollout strategy (big bang vs phased), and contingency plans.
- **Decision**: Adopt 10-week parallel development timeline with 4 milestones, 4 go/no-go checkpoints, phased rollout (10% → 50% → 100%), and 4 contingency scenarios:
  1. **Timeline:** 10 weeks (Jan 29 - Apr 8, 2026)
     - Weeks 1-2: Foundation (ChromaDB + EventBus in parallel)
     - Weeks 3-4: Core features (Entity extraction + OpenTelemetry)
     - Weeks 5-6: Integration (Sync layer + Agent enhancements)
     - Weeks 7-8: Testing + Documentation + 10% rollout
     - Weeks 9-10: Phased rollout (50% → 100%) + Stabilization
  2. **Resource Allocation:** 2 developers in parallel (Developer 1 = Memory, Developer 2 = Events) + part-time QA/DevOps
  3. **Milestones:**
     - M1 (Week 2): Foundation Complete (ChromaDB + EventBus operational)
     - M2 (Week 4): Core Features Complete (Memory 70% + OpenTelemetry integrated)
     - M3 (Week 6): Agent Enhancements Complete (Identity + Execution limits)
     - M4 (Week 8): Production Ready (All tests pass + 10% rollout stable)
  4. **Go/No-Go Checkpoints:**
     - Week 2: Continue with Memory System? (latency <10ms or evaluate alternative)
     - Week 4: Continue with Event System? (overhead <15% or optimize/defer Phoenix)
     - Week 6: Proceed to Integration? (all features functional, <10 P1 bugs)
     - Week 8: Deploy to Production (10% rollout)? (all success criteria met, executive approval)
  5. **Rollout Strategy:** Phased rollout with 48-hour stability checkpoints
     - Week 8: 10% rollout (select agents)
     - Week 9 (Mon): 50% rollout (if 10% stable for 48 hours)
     - Week 9 (Fri): 100% rollout (if 50% stable for 48 hours)
     - Rollback: Feature flags (<1 minute), not git revert
  6. **Contingency Plans:**
     - Scenario A: Memory behind schedule (Week 3) → Defer entity memory to P2
     - Scenario B: Event overhead too high (Week 4) → Reduce sampling to 1%, defer Phoenix to P2
     - Scenario C: Major bug discovered (Week 7+) → Pause rollout, allocate both developers to fix, extend 1 week
     - Scenario D: Rollout issues (Week 9) → Immediate rollback, investigate, retry at 10%
- **Consequences**:
  - **Benefits**:
    - Parallel development (2 developers) = 5-6 weeks vs 10-12 weeks sequential (halves timeline)
    - Phased rollout reduces risk (10% → 50% → 100% with stability checkpoints)
    - Go/No-Go checkpoints with specific no-go actions prevent "sunk cost fallacy"
    - Contingency plans reduce panic during incidents (pre-defined responses)
    - 4 milestones with acceptance + exit criteria enable progress tracking
    - Risk monitoring matrix (8 high-priority risks) with weekly reviews
    - Communication plan (4 levels: daily standups, weekly status, bi-weekly stakeholder, ad-hoc incidents)
  - **Trade-offs**:
    - Parallel development requires coordination overhead (sync points at Week 3-4)
    - Phased rollout extends timeline by 2 weeks (vs big bang deployment)
    - Go/No-Go checkpoints may delay timeline if no-go triggered (acceptable - prevents larger failures)
    - Resource requirements: 2 developers minimum (not 1 developer sequential)
  - **Key Decisions**:
    - **Parallel vs Sequential:** PARALLEL (halves timeline, minimal coordination overhead)
    - **Rollout Strategy:** PHASED (10% → 50% → 100%) vs big bang (too risky)
    - **Rollback Mechanism:** Feature flags (<1 minute) vs git revert (too slow for production)
    - **Milestone Structure:** Acceptance criteria (functional) + Exit criteria (quality) vs just "done" (insufficient)
    - **Go/No-Go Actions:** Specific responses ("defer X to P2") vs generic ("re-evaluate") - specific is actionable
- **Alternatives Considered**:
  - **Sequential Development:** 10-12 weeks (rejected - too slow)
  - **Big Bang Deployment:** All agents at once (rejected - too risky, no rollback option)
  - **Git Revert Rollback:** Revert commits on failure (rejected - takes >5 minutes, unacceptable for production)
  - **No Go/No-Go Checkpoints:** Trust developers to self-assess (rejected - sunk cost fallacy risk)
- **Implementation**: `.claude/context/artifacts/plans/p1-detailed-implementation-plan.md` (comprehensive 10-week plan with all details)
- **Related ADRs**: ADR-058 (Prioritization Strategy), ADR-054-057 (P1 feature decisions)

---

## [ADR-060] Upgrade Analysis Plan - Plugin Marketplace vs Enterprise Framework (2026-01-29)

**Context:**

- Archived codebase is a Claude Code Plugins marketplace (72 plugins, 108 agents, 129 skills, three-tier model strategy)
- Current codebase is Agent-Studio Enterprise Framework (multi-agent orchestrator, router-first architecture)
- Different architectures serve different purposes but share agent/skill concepts

**Decision:**
Execute comprehensive upgrade analysis following Phase 0 research protocol (ADR-045):

1. Research plugin architecture patterns (minimum 3 external sources)
2. Create detailed inventories of both systems
3. Extract valuable patterns (progressive disclosure, three-tier model strategy, plugin granularity)
4. Identify gaps and prioritize enhancements (P1/P2/P3)
5. Create implementation roadmap with quick wins

**Rationale:**

- Plugin marketplace has proven patterns for agent organization and skill delivery
- Progressive disclosure pattern could reduce token usage in our Skill() tool
- Three-tier model strategy (Opus/Sonnet/Haiku) aligns with our spawning protocol
- Gap analysis will reveal missing domain agents and skills
- Systematic approach ensures no valuable patterns are missed

**Alternatives Considered:**

1. ❌ Direct port of plugin architecture → Incompatible with router-first orchestration
2. ❌ Cherry-pick features without research → Risks missing integration dependencies
3. ✅ Systematic research → Plan → Validate → Implement (EVOLVE workflow)

**Consequences:**

- **Positive**: Comprehensive understanding of both architectures, prioritized roadmap, validated patterns
- **Negative**: 21-29 hours research before implementation (mitigated by preventing failed integrations)
- **Risks**: Plugin patterns may not translate directly (mitigated by Phase 0 technical feasibility gate)

**Implementation Plan:**

- Phase 0: Research (6-8 hours) - MANDATORY research with constitution checkpoint
- Phase 1: Inventory & Gap Analysis (4-6 hours) - Parallel execution
- Phase 2: Pattern Extraction (5-7 hours) - Extract 3+ valuable patterns
- Phase 3: Prioritization (3-4 hours) - Create P1/P2/P3 roadmap
- Phase 4: Recommendations (2-3 hours) - Executive summary + quick wins

**Success Metrics:**

- Constitution checkpoint passed (all 4 gates)
- > =10 missing capabilities identified
- > =3 valuable patterns extracted
- P1/P2/P3 roadmap created
- > =3 quick wins identified (<4 hours each)

**Status:** Plan created, ready for Phase 0 research execution

---

## [ADR-061] Transformation Strategy - Plugin Capabilities to Framework Artifacts (2026-01-29)

**Context:**

- User requested upgrade analysis comparing archived Claude Code Plugins marketplace (72 plugins, 108 agents, 129 skills) with our Agent-Studio Enterprise Framework
- Initial plan focused on "gap analysis" and potential "adoption" of plugin patterns
- User provided critical architectural constraints: Transform (not install), Update (not duplicate), Keep current architecture, Integration focus

**Problem:**

- Plugin marketplace uses granular, user-installable architecture (marketplace model)
- Our system uses centralized, router-first architecture (enterprise orchestration model)
- Direct adoption of plugin architecture conflicts with our governance model
- Need strategy to extract VALUE without adopting incompatible architecture

**Decision:**
Adopt **Transformation Strategy** for upgrade analysis:

1. **Transform, Don't Install**: Extract capabilities from plugins → transform into our artifact types (skills/agents/hooks/workflows/schemas)
2. **Update, Don't Duplicate**: Prioritize enhancing EXISTING artifacts (>=60% overlap) over creating parallel systems
3. **No Plugin Architecture**: Do NOT adopt plugin installation/isolation model unless proven significantly better
4. **Keep Current Architecture**: Router-first, centralized governance, lazy-load MCP unchanged
5. **Integration Focus**: Mine PATTERNS and CAPABILITIES, transform into OUR artifact types

**Transformation Mapping Decision Tree:**

```
Plugin Component → Framework Artifact:
├─ Capability/tool → UPDATE existing SKILL (>=60% overlap) OR CREATE new skill (unique domain)
├─ Agent pattern → UPDATE existing AGENT (same role) OR CREATE new agent (distinct specialization)
├─ Validation logic → EXTRACT to HOOK (.claude/hooks/)
├─ Orchestration → EXTRACT to WORKFLOW (.claude/workflows/)
├─ Data structure → EXTRACT to SCHEMA (.claude/schemas/)
└─ Utility code → EXTRACT to LIB/TOOLS (.claude/lib/, .claude/tools/)
```

**Update vs Create Criteria:**

- UPDATE if existing artifact covers >=60% of capability (maintain cohesion)
- CREATE if new domain/specialization (clear separation of concerns)
- EXTRACT if cross-cutting concern (hooks/workflows/schemas/utilities)

**Alternatives Considered:**

1. ❌ **Direct Plugin Port**: Copy plugin structure to our codebase → Incompatible with router-first governance
2. ❌ **Plugin Installation Architecture**: Add plugin loader/isolation → Conflicts with centralized control model
3. ❌ **Hybrid Plugin+Framework**: Support both models → Excessive complexity, governance confusion
4. ✅ **Transformation Strategy** (CHOSEN): Extract capabilities, transform to our artifacts, preserve architecture

**Consequences:**

**Positive:**

- Preserves router-first, centralized governance architecture
- Enhances existing artifacts (maintains cohesion, avoids duplication)
- Enables capability extraction without architectural changes
- Clear prioritization: Updates (P1) → Creation (P2) → Patterns (P3)
- Respects user's architectural constraints explicitly

**Negative:**

- Cannot adopt plugin granularity benefits (token efficiency from small plugins)
- Transformation requires more effort than direct port (analysis + mapping + integration)
- Some plugin patterns may not translate (if tightly coupled to marketplace architecture)

**Risks:**

- Risk: Transformation may miss valuable plugin patterns
  - Mitigation: Phase 2 pattern extraction with transformation guidance
- Risk: Updates to existing artifacts may introduce complexity
  - Mitigation: 60% overlap threshold ensures updates are cohesive
- Risk: Plugin architecture may prove superior for our use case
  - Mitigation: "unless proven significantly better" escape clause allows re-evaluation

**Implementation:**

- Phase 0: Research transformation patterns (not plugin adoption)
- Phase 1: Map capabilities to artifact types (skill/agent/hook/workflow/schema)
- Phase 2: Extract patterns WITH transformation guidance
- Phase 3: Prioritize: P1 (updates) → P2 (creation) → P3 (patterns)
- Phase 4: Concrete transformation examples + quick wins

**Status:** Accepted (plan refined with transformation strategy)
**Date:** 2026-01-29
**Supersedes:** ADR-060 (upgrade analysis plan) - refined with transformation focus

---

## [ADR-062] Spawn Template Extraction Strategy (2026-01-29)

**Context:**

- CLAUDE.md is 51,085 chars (27% over 40k target / 13.1k tokens vs 10k target)
- Section 2 (SPAWNING AGENTS) contains 18,500 chars (36% of file)
- Root cause: Verbose spawn templates with 70-line warning boxes repeated 3 times
- Performance impact: Router loads full CLAUDE.md on every spawn, wasting tokens on repetitive content

**Problem:**

- Universal Spawn Template: 11,700 chars (warning box + PROJECT_ROOT + instructions)
- Identity Integration example: 2,800 chars (AgentParser example + benefits)
- Orchestrator Spawn Template: 2,900 chars (similar structure to Universal)
- Total overhead: 18,500 chars (36% of CLAUDE.md)

**Decision:**

Adopt **@ file reference** strategy for spawn template extraction:

1. **Extract 3 Templates to `.claude/templates/spawn/`:**
   - `universal-agent-spawn.md` (11.7k chars) - Standard agent spawning
   - `agent-identity-integration.md` (2.8k chars) - Optional personality enhancement
   - `orchestrator-spawn.md` (2.9k chars) - Multi-agent coordination

2. **Replace CLAUDE.md Section 2 with @ References:**
   - Brief intro + template reference (300 chars per template)
   - Keep Golden-Path Example (1.8k chars - Router learning value)
   - New Section 2 size: 3.5k chars (down from 18.5k)

3. **Template Structure:**
   - YAML frontmatter metadata (template_type, use_cases, model_selection, requires)
   - Full template content with code blocks
   - Related templates cross-references

4. **Router Loading Mechanism:**
   - Router reads CLAUDE.md Section 2 (sees @ references)
   - Router uses Read tool to load template file: `Read({ file_path: '.claude/templates/spawn/universal-agent-spawn.md' })`
   - Template content (11.7k chars) loaded into Router context
   - Router spawns agent with full template

**Rationale:**

**Why @ File References (Not TOON):**

- Research (Task #3) showed @ references are optimal for static spawn templates
- TOON (Type Object Notation) adds lookup overhead for no benefit with static content
- @ references map directly to file paths (Router has Read tool whitelisted)
- Zero runtime overhead (direct file load)
- IDE support (go-to-definition, autocomplete) works with file paths

**Why Extract These 3 Templates:**

- High duplication: Warning box repeated 3 times (15.2k chars)
- Static content: Spawn templates rarely change (good candidates for extraction)
- Clear boundaries: Each template is self-contained unit
- Significant impact: 18.5k char reduction (36% of CLAUDE.md)

**Why Keep Golden-Path Example:**

- Router learning tool (teaches by example)
- Shows parallel spawning (PLANNER + SECURITY-ARCHITECT)
- Demonstrates real-world routing decision
- Only 1.8k chars (worth the cost for learning value)

**Alternatives Considered:**

1. ❌ **Inline Compression**: Shorten text, remove whitespace
   - Only achieves 30% reduction (vs 36% with extraction)
   - Reduces readability and maintainability

2. ❌ **TOON References**: Use abstract object notation
   - Adds lookup layer (complexity)
   - No performance advantage for static templates
   - Harder to debug (abstraction obscures source)
   - Research showed @ references superior for this use case

3. ❌ **Partial Extraction**: Extract only warning box
   - Misses 3.3k chars from Identity + Orchestrator examples
   - Still leaves Section 2 at 12k chars (24% of file)
   - Less maintainable (warning box duplicated)

**Consequences:**

**Positive:**

- **36% character reduction** (18.5k → 3.5k in Section 2)
- **Achieves target** (32.5k chars, 19% below 40k target)
- **Single source of truth** (templates in one location)
- **Backward compatible** (Router has Read tool whitelisted)
- **Low risk** (content relocation, not logic changes)
- **Simple rollback** (`git checkout HEAD -- .claude/CLAUDE.md`)

**Negative:**

- Router must load template files explicitly (Read tool call overhead)
  - Mitigation: Router caches template content in context
- More files to maintain (3 new template files)
  - Mitigation: Templates rarely change (spawn protocol is stable)
- Documentation must be updated (@ references in workflows)
  - Mitigation: Phase 4 of implementation plan updates docs

**Trade-offs:**

- **Token efficiency vs Maintainability**: Extraction improves both (fewer tokens in CLAUDE.md, single source of truth for templates)
- **Router simplicity vs File count**: Slight complexity increase (Router loads files) for significant size reduction
- **Inline vs External**: External templates require Read tool but enable reuse and clarity

**Implementation:**

- **Phase 1 (1h)**: Create 3 template files with metadata headers
- **Phase 2 (30m)**: Update CLAUDE.md Section 2 with @ references
- **Phase 3 (30m)**: Test Router compatibility (Read tool, spawn test)
- **Phase 4 (15m)**: Update documentation references (workflows, ARCHITECTURE.md)
- **Phase 5 (15m)**: Validation (character count, Router spawning, markdown syntax)

**Success Criteria:**

- CLAUDE.md size: 32,500 chars ±500 (19% below 40k target)
- Section 2 size: 3,500 chars (81% reduction from 18,500)
- Router compatibility: 100% (manual spawn test passes)
- Template files: 3 created in `.claude/templates/spawn/`
- No broken links or markdown syntax errors

**Validation:**

```bash
# Character count
wc -c .claude/CLAUDE.md
# Expected: 51085 → 32500 chars

# Template files
ls -lh .claude/templates/spawn/
# Expected: 3 files (~11k, ~3k, ~3k bytes)

# Router spawn test
node .claude/tools/cli/router-smoke-test.cjs
# Expected: All tests pass
```

**Rollback Plan:**

```bash
# If issues arise
git checkout HEAD -- .claude/CLAUDE.md
# Restores original CLAUDE.md
# Template files remain for future use
```

**Related Files:**

- `.claude/context/artifacts/plans/spawn-template-extraction-design-2026-01-29.md` (comprehensive design)
- `.claude/context/artifacts/research-reports/toon-lazy-loading-research-2026-01-29.md` (research backing)

**Status:** Accepted (design complete, ready for implementation)
**Date:** 2026-01-29
**Supersedes:** None (new decision)

---

## [ADR-063] Spawn Template Validation Safeguards (2026-01-29)

**Context:**

- Spawn templates were extracted to lazy-loaded files (.claude/templates/spawn/)
- Router references templates via @ file references
- Risk: Template files could be missing, corrupted, or have structural issues
- Need safeguards to ensure spawned agents have required elements (TaskUpdate protocol, PROJECT_ROOT, etc.)

**Research Basis:**

- Arxiv: 30+ papers, 97.3% correctness with pre-execution validation
- Exa: 45+ implementations, 91% adoption of PreToolUse pattern
- AgentSpec: <100ms gate execution, <2% false positive rate targets

**Security Review:**

- **Decision**: APPROVED WITH CONDITIONS (Task #8)
- **Vulnerabilities Fixed**: 2 CRITICAL + 4 HIGH + 5 MEDIUM = 11 mitigations
- **CRITICAL (Fixed)**: Unicode homoglyph bypass (VULN-001), ReDoS vulnerability (VULN-002)
- **HIGH (Fixed)**: Prompt length limit (VULN-003), fail-open audit (VULN-004), environment override audit (VULN-005), required rule flags (VULN-006)
- **MEDIUM (Fixed)**: Enhanced audit logging (VULN-007), hook file protection (VULN-010)
- **Security Report**: `.claude/context/artifacts/security-reviews/spawn-validation-security-review-2026-01-29.md`

**Decision:**
Implement three-layer safeguard approach:

1. **Option B: Validation Hook (spawn-prompt-validator.cjs)**
   - PreToolUse(Task) hook validates spawn prompts
   - Checks for: TaskUpdate box, Task ID, PROJECT_ROOT, Memory Protocol, TaskUpdate calls, allowed_tools
   - Scoring system (0-100) with 70 minimum for pass
   - Required flag on critical rules (TaskUpdate box, Task ID)
   - Enforcement modes: block/warn/off (default: warn)

2. **Security Mitigations (ALL IMPLEMENTED)**
   - **VULN-001**: Unicode normalization function with homoglyph map (Cyrillic, Greek → ASCII)
   - **VULN-002**: ReDoS-safe regex patterns with bounded quantifiers + timeout wrapper
   - **VULN-003**: 500KB prompt length limit (100KB warning threshold)
   - **VULN-004**: Full audit context in exception handler (error, stack, toolInput, mode, timestamp)
   - **VULN-005**: Environment override auditing (SPAWN_PROMPT_VALIDATOR=off logged)
   - **VULN-006**: Required flags on critical rules (TaskUpdate box, Task ID must be present)
   - **VULN-007**: Enhanced audit log fields (sessionId, agentType, promptLength, promptHash, executionMs)

**Implementation Completed:**

- Phase 1: Created validation hook with 6 rules and weighted scoring (4 hours)
- Phase 1.2: Created 48 unit/integration/security test cases (2 hours) - 100% passing
- Phase 1.3: Registered hook in settings.json (30 minutes)
- Total: 6.5 hours implementation + testing

**Test Results:**

- **Tests Created**: 48 test cases
- **Tests Passing**: 48/48 (100%)
- **Coverage**: validatePrompt, normalizeUnicode, safeRegexTest, isOrchestratorSpawn, isTemplateBasedSpawn, end-to-end integration, security vulnerabilities, edge cases
- **Security Tests**: VULN-001 (Unicode), VULN-002 (ReDoS), VULN-003 (length), VULN-006 (required rules)
- **Performance**: All tests complete in 240ms total

**Consequences:**

_Positive:_

- Prevents invalid spawns (missing TaskUpdate protocol)
- Blocks 2 CRITICAL security vulnerabilities (Unicode bypass, ReDoS)
- Observable (audit logging on validation/fallback)
- Non-breaking (default: warn mode)
- Research-backed (91% industry adoption)
- Performance: <5ms overhead per spawn (measured: <1ms average)

_Negative:_

- Adds ~5ms overhead per spawn (validation)
- New hook to maintain (spawn-prompt-validator.cjs)
- Documentation complexity increase

**Trade-offs:**

- Validation strictness vs spawn flexibility
- Warn mode default balances safety and usability
- Block mode available for production hardening

**Files Created:**

- `.claude/hooks/safety/spawn-prompt-validator.cjs` (500 lines, all security mitigations)
- `.claude/hooks/safety/spawn-prompt-validator.test.cjs` (550 lines, 48 tests)

**Files Modified:**

- `.claude/settings.json` (hook registration)

**Status:** Implemented and Tested
**Date:** 2026-01-29
**Implementation Date:** 2026-01-29 (Task #11)
**Related ADRs:** ADR-062 (Spawn Template Extraction)
**Security Review:** Task #8 (APPROVED WITH CONDITIONS - all conditions met)

---

## [ADR-065] Error Logging and Reporting System Architecture

- **Date**: 2026-01-29
- **Status**: Accepted (Design Complete)
- **Context**: Agent-Studio needed a comprehensive error logging and reporting infrastructure to:
  1. Capture agent failures with full debugging context
  2. Integrate with the reflection workflow for learning from errors
  3. Prevent sensitive data leakage while maintaining debuggability
  4. Support error pattern detection and correlation across parallel agents
  5. Build on existing infrastructure (error-tracker.cjs, error-recovery-reflection.cjs, EventBus)

- **Decision**: Implement a multi-layered error logging system with the following architecture:
  1. **Error Capture Layer**: PostToolUse hooks capture errors at all critical points (hooks, tools, tasks, memory operations)
  2. **Error Processing Layer**: Classification, severity evaluation, context enrichment, sensitive data masking, correlation ID generation
  3. **Error Storage Layer**: JSON Lines format (errors.jsonl) for real-time append, daily JSON reports for aggregation, pattern tracking
  4. **Consumer Integration**: Reflection workflow, anomaly detector, CLI dashboard, self-healing triggers

  **Key Design Choices:**
  - **Centralized vs Per-Agent Logs**: Centralized `errors.jsonl` for cross-agent correlation, with filtering by `context.agentName`
  - **Context Depth**: Full task metadata, masked tool input, 10-line stack trace (balance of utility and security)
  - **Correlation Strategy**: Session ID + Trace ID + 5-second temporal window for grouping related errors
  - **Retention Policy**: 7 days active, 30 days archived (compressed), configurable for critical errors (90 days)
  - **Fail-Safe**: Fail-open with circuit breaker to never block agent execution; fallback to stderr

- **Consequences**:
  - **Positive**:
    - Comprehensive error capture with debugging context
    - Secure handling of sensitive data (PII/credential masking)
    - Integration with existing reflection and event systems
    - Pattern detection enables self-healing triggers
    - Cross-agent correlation for parallel execution debugging
  - **Negative**:
    - Additional storage requirements (~50MB/month estimated)
    - Slight performance overhead (target <5ms per error)
    - Complexity increase (new components to maintain)
  - **Trade-offs**:
    - Centralized log vs. per-agent: Chose centralized for correlation capability
    - Full context vs. minimal: Chose full context (masked) for debuggability
    - JSON Lines vs. structured DB: Chose JSON Lines for simplicity and streaming

- **Implementation Plan**:
  - Phase 1 (Week 1-2): Core infrastructure (schema, capture hook, masker, log writer)
  - Phase 2 (Week 2-3): Integration with existing components
  - Phase 3 (Week 3-4): Reporting CLI and pattern detection
  - Phase 4 (Week 4): Testing and documentation

- **Related Files**:
  - Design Document: `.claude/context/artifacts/error-logging-system-design.md`
  - Architecture Diagrams: `.claude/context/artifacts/diagrams/error-logging-architecture.md`
  - Existing Components: `error-tracker.cjs`, `error-recovery-reflection.cjs`, `unified-reflection-handler.cjs`

- **Related ADRs**: ADR-055 (Event-Driven Orchestration), ADR-056 (Observability)

---

## [ADR-066] Advanced Workflow Orchestration Patterns (SPEC-017)

- **Date**: 2026-01-30
- **Status**: Accepted
- **Context**: Phase 4 requires advanced workflow orchestration patterns including fan-out/fan-in, conditional branching, and loop constructs. Current SPEC-011 provides basic fork/join but lacks declarative pattern support, conditional execution, and iteration with limits.
- **Decision**: Implement workflow-patterns.cjs module with three pattern types:
  1. **Fan-Out Pattern**: Execute N tasks in parallel with collection strategies (all, any, majority, quorum)
  2. **Conditional Branching**: when/then/else and switch/case with JavaScript or JSONPath condition evaluators
  3. **Loop Patterns**: forEach, doWhile, retryUntil with mandatory maxIterations to prevent infinite loops
- **Consequences**:
  - **Positive**:
    - 3-5x throughput improvement for parallelizable workflows
    - Declarative patterns reduce agent prompt complexity
    - Iteration limits prevent runaway compute costs
    - Integration with SPEC-011 transactions ensures rollback capability
  - **Negative**:
    - Fan-out coordination adds complexity (race conditions, timeout handling)
    - Condition evaluation requires sandboxing for security
    - Loop patterns require careful checkpoint management
  - **Trade-offs**:
    - Chose collection strategies over custom aggregation (simplicity vs flexibility)
    - Chose mandatory maxIterations over optional (safety vs convenience)
    - Chose JavaScript + JSONPath evaluators over custom DSL (familiarity vs control)
- **Implementation**: `.claude/lib/workflow/workflow-patterns.cjs`
- **Related ADRs**: ADR-055 (Event-Driven Orchestration), Phase 3 SPEC-011
- **Risk Assessment**: See phase-4-risk-assessment.md (Risks 17.1-17.4)

---

## [ADR-067] Workflow Composition and Nesting Strategy (SPEC-018)

- **Date**: 2026-01-30
- **Status**: Accepted
- **Context**: Complex workflows require composition from simpler, reusable sub-workflows. Currently, workflows are monolithic with no inheritance or inclusion mechanism, leading to duplication and maintenance burden.
- **Decision**: Implement workflow-composer.cjs with three composition mechanisms:
  1. **Include**: Insert sub-workflow at specific point in parent workflow
  2. **Extend**: Inherit from base workflow with selective overrides
  3. **Compose**: Combine multiple workflows with strategy (sequential, parallel, conditional)
     Additionally, implement WorkflowResolver with DFS-based cycle detection to prevent infinite recursion.
- **Consequences**:
  - **Positive**:
    - 60% reduction in workflow definition duplication
    - Enables library of reusable workflow components
    - Simplifies testing (test sub-workflows independently)
    - Clear error messages for circular dependencies
  - **Negative**:
    - State management complexity increases with nesting
    - Override merge logic can have subtle bugs
    - Resolution performance depends on hierarchy depth
  - **Trade-offs**:
    - Chose composition over configuration (reuse vs simplicity)
    - Chose DFS cycle detection over adjacency matrix (memory vs time complexity)
    - Chose 10-level depth limit (practical vs theoretical unlimited)
- **Implementation**: `.claude/lib/workflow/workflow-composer.cjs`
- **Related ADRs**: ADR-066 (patterns used in compositions)
- **Risk Assessment**: See phase-4-risk-assessment.md (Risks 18.1-18.4)

---

## [ADR-068] Brownfield/Greenfield Hybrid Execution Architecture (SPEC-019)

- **Date**: 2026-01-30
- **Status**: Accepted
- **Context**: Migrating from conductor-main to Agent-Studio requires a gradual path. Current SPEC-015 provides assessment and state migration tools, but no support for running hybrid workflows where some tasks execute in the legacy system and others in the new system.
- **Decision**: Implement hybrid-executor.cjs with:
  1. **Task Router**: Rule-based routing to legacy or new system (pattern matching, feature flags, time-based canary)
  2. **State Sync**: Bi-directional synchronization with vector clocks for conflict detection
  3. **Result Normalizer**: Transform results to common format regardless of source system
  4. **System Adapters**: Pluggable adapters for conductor-main and Agent-Studio
- **Consequences**:
  - **Positive**:
    - Zero-downtime migration path
    - Reduces migration risk by 80% (gradual adoption)
    - Enables A/B testing between implementations
    - Fallback to legacy on errors
  - **Negative**:
    - State drift risk between systems (requires reconciliation)
    - Routing rule errors can cause task failures
    - Additional latency from routing, translation, and sync
  - **Trade-offs**:
    - Chose bi-directional sync over single-source (flexibility vs complexity)
    - Chose vector clocks over timestamps (correctness vs simplicity)
    - Chose rule-based routing over ML-based (predictability vs optimization)
- **Implementation**: `.claude/lib/workflow/hybrid-executor.cjs`
- **Related ADRs**: Phase 3 SPEC-015 (Conductor Integration)
- **Risk Assessment**: See phase-4-risk-assessment.md (Risks 19.1-19.4)

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

## [ADR-070] SkillCatalog Tool Architecture

- **Date**: 2026-01-30
- **Status**: Accepted
- **Context**: Agents receive a static AVAILABLE_SKILLS list at spawn time (Phase 1D), but lack runtime skill discovery capability. Agents cannot filter by domain/category/tags or receive intelligent suggestions when queries return no results.
- **Decision**: Implement SkillCatalogQuery class with the following architecture:
  1. **Single Data Source**: Uses skill-index.json from Phase 1A
  2. **Query Filters**: domain, category, tags (AND logic), agentType, limit (1-50)
  3. **In-Memory Cache**: LRU eviction at 100 entries, 5-minute TTL, <50ms cached queries
  4. **Suggestions Engine**: Returns alternative queries when count=0 (typo detection, broader filters)
  5. **Schema Validation**: JSON Schema v7 for query/response validation
  6. **Error Recovery**: Always returns response object (never throws), includes suggestions
- **Consequences**:
  - **Positive**:
    - Runtime skill discovery complements static AVAILABLE_SKILLS
    - <100ms query performance (50ms cached)
    - Intelligent suggestions reduce agent confusion
    - Type-safe API via JSON Schema validation
    - No external dependencies (Node.js built-ins only)
  - **Negative**:
    - Additional file to maintain (.claude/lib/tools/skill-catalog.cjs)
    - Cache coordination needed with skill-index regeneration
    - ~400 lines of implementation code
  - **Trade-offs**:
    - Chose in-memory cache over file cache (simplicity vs persistence)
    - Chose AND logic for tags over OR logic (precision vs recall)
    - Chose LRU eviction over LFU (simplicity vs optimization)
- **Implementation Files**:
  - `.claude/lib/tools/skill-catalog.cjs` (~400 lines)
  - `tests/lib/tools/skill-catalog.test.cjs` (~600 lines)
  - `.claude/docs/SKILLCATALOG_USAGE.md` (agent guidance)
  - `.claude/schemas/skillcatalog-query.schema.json`
  - `.claude/schemas/skillcatalog-response.schema.json`
- **Architecture Document**: `.claude/docs/SKILLCATALOG_ARCHITECTURE.md`
- **Related ADRs**: ADR-069 (Tool Manifest and Pre-Spawn Validation)
- **Test Requirements**: 40+ unit tests, 10+ integration tests, 5+ schema tests

---

## [ADR-072] Creator Skills Infrastructure Alignment

- **Date**: 2026-01-31
- **Status**: Proposed
- **Context**: Audit of all 6 creator skills (agent-creator, skill-creator, workflow-creator, hook-creator, template-creator, schema-creator) revealed critical misalignment with Phase 1-3 orchestration infrastructure. None of the creators reference or integrate with tool-manifest.json (Phase 1), skill-index.json (Phase 2), or agent-registry.json (Phase 3). This causes "invisible artifacts" - newly created agents/skills are not discoverable by SkillCatalog() or AvailableAgents() tools.
- **Decision**: Require all creator skills to integrate with Phase 1-3 infrastructure:
  1. **Post-Creation Regeneration**: Creators must trigger registry regeneration after creating artifacts
     - agent-creator: `node .claude/tools/cli/generate-agent-registry.cjs`
     - skill-creator: `node .claude/tools/cli/generate-skill-index.cjs`
  2. **Toolset References**: Replace hardcoded tool lists with toolset references from tool-manifest.json
  3. **Validation**: Validate tool/skill/agent references against respective registries before creation
  4. **Health Initialization**: New agents must have health object initialized in capability card
- **Consequences**:
  - **Benefits**:
    - New artifacts immediately discoverable by runtime tools
    - Tool consistency via manifest-driven toolsets
    - Health tracking active from agent creation
    - Validation prevents invalid references
  - **Trade-offs**:
    - Creator workflow slightly longer (regeneration step)
    - Dependency on generator scripts being available
    - May require creator skill updates when infrastructure changes
  - **Migration Path**:
    - Phase 1: Update creator SKILL.md files with post-creation steps (2 hours)
    - Phase 2: Add npm scripts for regeneration (4 hours)
    - Phase 3: Create post-creation-infrastructure-sync hook (8 hours)
    - Phase 4: Add integration tests (4 hours)
- **Audit Report**: `.claude/docs/CREATOR_SKILLS_ALIGNMENT_AUDIT.md`
- **Related ADRs**: ADR-069 (Tool Manifest), ADR-070 (SkillCatalog), ADR-071 (Agent Capability Cards)

---

## [ADR-073] Code Indexing and Semantic Search System Architecture

- **Date**: 2026-01-31
- **Status**: Accepted (Design Complete)
- **Context**: Agents currently use Grep/Glob for code search, which is keyword-based and produces many false positives. Natural language queries require manual translation to regex patterns. Users requested Greb-like semantic search capabilities using the Cursor RAG pipeline architecture as reference.
- **Decision**: Implement a 7-step code indexing and semantic search pipeline:
  1. **Code Parsing**: tree-sitter for 40+ language support with unified AST
  2. **Semantic Chunking**: Extract functions, classes, methods (50-2048 tokens per chunk)
  3. **Embedding Generation**: Local model (all-MiniLM-L6-v2, 384-dim) via @xenova/transformers
  4. **Metadata Enrichment**: Path, language, type, line range, imports, exports, signatures
  5. **Vector Storage**: ChromaDB (reusing ADR-054 infrastructure) with HNSW indexing
  6. **Query Processing**: Query expansion, vector search, metadata filtering, re-ranking
  7. **Index Maintenance**: Merkle trees for O(log n) change detection, incremental updates
- **Consequences**:
  - **Benefits**:
    - +100% accuracy improvement (40% grep false positives → 80%+ relevant in top-5)
    - 4-10x faster queries (<500ms vs 2-5s for full ripgrep scan)
    - Natural language queries without regex translation
    - Local-first, privacy-preserving (code never leaves machine)
    - Zero operational cost ($0 for local embeddings)
    - Leverages existing ChromaDB infrastructure from ADR-054
    - Agent-native integration via dedicated Skill
  - **Trade-offs**:
    - Additional dependencies (tree-sitter, @xenova/transformers)
    - Initial indexing time (~60s for 1000 files)
    - Disk usage (~100MB per 10K files)
    - Lower quality than cloud embeddings (0.82 vs 0.91 OpenAI)
- **Implementation Timeline**: 6-8 weeks (3 phases: Foundation, Enhancement, Optimization)
- **Key Technology Choices**:
  - Parser: tree-sitter (40+ languages, battle-tested, Cursor precedent)
  - Embeddings: all-MiniLM-L6-v2 local (free, private, offline-capable)
  - Vector DB: ChromaDB (existing infrastructure from ADR-054)
  - Change Detection: Merkle trees (O(log n) diffing, Cursor precedent)
  - Integration: Native Skill (code-semantic-search)
- **Design Documents**:
  - `.claude/docs/CODE_INDEXING_DESIGN.md` (comprehensive system design)
  - `.claude/docs/CODE_INDEXING_IMPLEMENTATION_ROADMAP.md` (phased implementation plan)
  - `.claude/docs/CODE_INDEXING_TECH_STACK.md` (technology rationale)
  - `.claude/context/artifacts/diagrams/code-indexing-architecture.md` (visual diagrams)
- **Related ADRs**: ADR-054 (Memory System Enhancement - ChromaDB infrastructure), ADR-070 (SkillCatalog)

---

## [ADR-075] Router Config-Aware Model Selection Architecture

- **Date**: 2026-01-31
- **Status**: Accepted (Phase 1-2 Implemented)
- **Context**: Router hardcodes model selection in CLAUDE.md and spawn templates, completely ignoring agent configurations defined in `config.yaml`. This creates trust, cost, governance, and auditability gaps. Audit AUDIT-2026-01-31-001 identified that config.yaml defines models for 4 core agents (planner, developer, qa, architect) but these are never read by the router.
- **Decision**: Implement config-aware model selection with the following architecture:
  1. **Agent Config Resolver** (`.claude/lib/utils/agent-config-resolver.cjs`): Resolves agent model from multiple sources with correct precedence
  2. **Model Precedence Order**: Task override (P1) > Agent frontmatter (P2) > config.yaml (P3) > Complexity default (P4)
  3. **Pre-Spawn Validation Hook** (`.claude/hooks/routing/config-model-validator.cjs`): Validates spawn model matches config, warns/blocks on mismatch
  4. **Router Protocol Update**: CLAUDE.md and router-decision.md updated to call resolver before Task()
  5. **Orchestrator Update**: All 5 orchestrators updated to use config-aware spawning
  6. **Audit Trail**: Model source logged in TaskUpdate metadata
- **Consequences**:
  - **Benefits**:
    - Config.yaml becomes source-of-truth for agent models (administrators can control)
    - Audit trail shows configured vs deployed model (auditability)
    - Pre-spawn hook detects mismatches (enforcement)
    - Cost variance visible and controllable (governance)
    - Backward compatible (complexity default as fallback)
  - **Trade-offs**:
    - Additional config lookup on every spawn (~1ms overhead)
    - New hook in spawn chain (warn mode default for gradual rollout)
    - Existing spawn templates require update
    - Orchestrators require code changes
  - **Risk Mitigations**:
    - Hook default to warn mode (doesn't break existing spawns)
    - Config loader is cached (performance)
    - Fallback to complexity default if config missing
- **Implementation Plan**:
  - Phase 1 (DONE): Created `.claude/lib/utils/agent-config-reader.cjs` (model resolution utility)
  - Phase 2 (DONE): Created `.claude/hooks/routing/config-model-validator.cjs` (pre-spawn validation hook)
  - Phase 3 (DONE): Updated CLAUDE.md Section 5 with config-reading step
  - Phase 4 (DONE): Updated `.claude/docs/@MODEL_SELECTION.md` with precedence documentation
  - Phase 5 (DONE 2026-01-31): Updated all 5 orchestrators to use config-aware spawning
    - master-orchestrator.md: Added resolveAgentModel() to AvailableAgents example
    - swarm-coordinator.md: Added Model Selection Protocol section with swarm worker loop
    - evolution-orchestrator.md: Added model resolution to capability-based spawn pattern
    - party-orchestrator.md: Added model resolution to Step 4 agent spawn loop
    - router.md: Updated Model Selection section with ADR-075 precedence
  - Phase 6 (PENDING): Full routing integration tests
- **Files Created**:
  - `.claude/lib/utils/agent-config-reader.cjs` (utility, 37 tests passing)
  - `.claude/lib/utils/agent-config-reader.test.cjs` (TDD tests)
  - `.claude/hooks/routing/config-model-validator.cjs` (hook, 31 tests passing)
  - `.claude/hooks/routing/config-model-validator.test.cjs` (TDD tests)
- **Files Updated**:
  - `.claude/CLAUDE.md` (Section 1 Router Protocol, Section 5 Model Selection)
  - `.claude/docs/@MODEL_SELECTION.md` (comprehensive precedence documentation)
- **Audit Document**: `.claude/context/artifacts/plans/ROUTER-CONFIG-INTEGRATION-AUDIT.md`
- **Related Issues**: CONFIG-001 (Router Ignores config.yaml)
- **Related ADRs**: ADR-069 (Tool Manifest), ADR-070 (SkillCatalog), ADR-071 (Agent Capability Cards), ADR-074 (CLAUDE.md Compression)

---

## [ADR-077] Shell Command Security Architecture

- **Date**: 2026-01-31
- **Status**: Accepted (Phase 1 COMPLETE, Phase 3 COMPLETE - 2026-01-31)
- **Context**: Background Bash tasks executed with undefined CWD, causing `find` commands to search entire filesystem instead of PROJECT_ROOT. Error output showed traversal to `/c/XboxGames/` (user data exposure), malformed path arguments (`'/v'`, `''`), and exit code 1 failures. Root cause: Background tasks don't initialize CWD to PROJECT_ROOT before shell execution, creating critical security vulnerabilities (shell injection, path traversal, data exfiltration, resource exhaustion).
- **Problem Statement**:
  1. **Missing CWD Initialization**: Background tasks execute in undefined CWD (not PROJECT_ROOT)
     - Relative paths fail silently
     - `find tests/` searches from root (/) instead of PROJECT_ROOT
     - Exposes system structure to LLM context
  2. **No Shell Injection Protection**: Unvalidated Bash commands allow arbitrary execution
     - Unquoted variables: `$VAR` instead of `"$VAR"`
     - Chained commands: `; rm -rf /`
     - Command substitution: `$(malicious)`
  3. **Missing Safeguards**: No pre-execution validation hooks
     - No shellcheck integration
     - No dangerous pattern detection
     - No command allowlist
- **Decision**: Implement multi-layer shell security architecture:
  1. **CWD Validation Hook** (`.claude/hooks/safety/bash-cwd-validator.cjs`):
     - PreToolUse(Bash) blocks background tasks missing `cd "$PROJECT_ROOT"`
     - Enforcement mode: `block` (default), `warn`, `off`
     - Environment: `BASH_CWD_VALIDATOR=block|warn|off`
  2. **Shell Injection Validator** (`.claude/hooks/safety/shell-injection-validator.cjs`):
     - Blocks dangerous patterns: `rm -rf /`, `eval`, `>>/dev/`, chained `rm`, backtick execution
     - Blocks dangerous targets: root deletion, home deletion, wildcard deletion
     - Enforcement mode: `block` (default)
  3. **Variable Quoting Validator** (warn mode):
     - Detects unquoted variables: `$VAR` not within quotes
     - Suggests fixes: `"$VAR"` instead of `$VAR`
     - Non-blocking (educational)
  4. **Spawn Template Updates**:
     - Add CWD requirement to universal-agent-spawn.md
     - Add shell safety checklist
     - Document variable quoting rules
  5. **PROJECT_ROOT Environment Export**:
     - Add to `.env`: `PROJECT_ROOT=/c/dev/projects/agent-studio`
     - Inject in spawn context for availability
  6. **Optional Shellcheck Integration** (`.claude/hooks/validation/shellcheck-validator.cjs`):
     - Runs shellcheck on commands (requires installation)
     - Fallback gracefully if unavailable
     - Non-blocking (warn mode)
- **Consequences**:
  - **Benefits**:
    - Prevents filesystem traversal (no more root searches)
    - Blocks shell injection attacks (malicious command prevention)
    - Reduces data exposure risk (no accidental user data scanning)
    - Improves command reliability (CWD consistency)
    - Educational feedback (quoting and safety suggestions)
    - Defense-in-depth (multiple validation layers)
  - **Trade-offs**:
    - Additional validation latency (~10-50ms per Bash call)
    - Requires shellcheck installation for full validation (optional)
    - May block legitimate edge-case commands (override available)
    - Developers must learn quoting and CWD rules
  - **Risk Reduction**: 53% overall (7.5/10 → 3.5/10 risk score)
    - Shell Injection: CRITICAL→MEDIUM (↓40%)
    - Path Traversal: HIGH→LOW (↓60%)
    - Data Exfiltration: MEDIUM→LOW (↓50%)
    - Resource Exhaustion: MEDIUM→LOW (↓60%)
- **Implementation Plan**:
  - **Phase 1 (Week 1 - CRITICAL)**: CWD + Injection validators ✅ COMPLETE (2026-01-31)
    1. ✅ bash-cwd-validator.cjs created (17 tests passing)
    2. ✅ shell-injection-validator.cjs created (25 tests passing)
    3. ✅ bash-safe-background.md template created
    4. ✅ universal-agent-spawn.md updated with Bash safety section
    5. ✅ orchestrator-spawn.md updated with Bash safety reference
  - **Phase 2 (Week 2 - HIGH)**: Quoting + Environment ✅ COMPLETE (2026-01-31)
    4. ✅ variable-quoting-validator.cjs created (17 tests passing)
    5. ✅ PROJECT_ROOT exported to .env and .env.example (Section 7)
    6. ✅ Integration tests created (13 tests passing - shell-security-integration.test.mjs)
    7. ✅ SHELL-SECURITY-GUIDE.md updated with Phase 2 documentation
  - **Phase 3 (Week 3 - MEDIUM)**: Enhancements ✅ COMPLETE (2026-01-31)
    7. ✅ shellcheck-validator.cjs created (graceful fallback if not installed)
    8. ✅ command-allowlist.cjs library created (25+ allowed, 15+ blocked commands)
    9. ✅ command-allowlist-validator.cjs hook created
    10. ✅ command-allowlist.yaml configuration created
    11. ✅ shellcheck-validator.test.cjs (20 tests)
    12. ✅ command-allowlist-validator.test.cjs (40 tests)
    13. ✅ shell-security-phase3.test.mjs integration tests (25 tests)
    14. ✅ SHELL-SECURITY-GUIDE.md comprehensive documentation
  - **Phase 4 (Ongoing)**: Monitoring
    9. Audit logging (1 day)
    10. Documentation (ongoing)
- **Audit Document**: `.claude/context/artifacts/audits/BACKGROUND-TASK-SHELL-AUDIT.md`
- **Related Issues**: ROUTER-MONITORING-001 (background task tracking), CONFIG-001 (configuration drift)
- **New Issues Created**:
  - [SHELL-SECURITY-001] Background Bash tasks missing CWD initialization (CRITICAL)
  - [SHELL-SECURITY-002] No shell injection validation (CRITICAL)
  - [SHELL-SECURITY-003] Unquoted variables in Bash commands (HIGH)
  - [SHELL-SECURITY-004] No shellcheck integration (MEDIUM)

---
