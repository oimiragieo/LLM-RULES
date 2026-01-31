# Creator Skills Alignment Audit Report

**Date:** 2026-01-31
**Auditor:** Architect Agent
**Scope:** All creator/updater skills alignment with Phase 1-3 orchestration system

## Executive Summary

This audit evaluates all creator skills against the Phase 1-3 orchestration infrastructure. The finding is **CRITICAL**: **ALL six creator skills are misaligned** with the new infrastructure. None of them reference or integrate with:

- **Phase 1:** Tool manifests (`tool-manifest.json`), pre-spawn validation, toolsets
- **Phase 2:** Skill index (`skill-index.json`), `SkillCatalog()` tool
- **Phase 3:** Agent registry (`agent-registry.json`), `AvailableAgents()` tool, capability cards

This creates a significant gap where new artifacts are created but not properly integrated into the discovery and routing systems.

---

## Summary Table

| Creator Skill      | Phase 1 (Tools) | Phase 2 (Skills) | Phase 3 (Agents) | Overall Status |
| ------------------ | --------------- | ---------------- | ---------------- | -------------- |
| `agent-creator`    | **RED**         | **RED**          | **RED**          | **CRITICAL**   |
| `skill-creator`    | **RED**         | **YELLOW**       | **RED**          | **HIGH**       |
| `workflow-creator` | **RED**         | **RED**          | **RED**          | **HIGH**       |
| `hook-creator`     | **RED**         | **RED**          | **RED**          | **HIGH**       |
| `template-creator` | **RED**         | **RED**          | **RED**          | **MEDIUM**     |
| `schema-creator`   | **RED**         | **RED**          | **RED**          | **MEDIUM**     |

### Status Legend

- **GREEN**: Fully aligned with Phase infrastructure
- **YELLOW**: Partial alignment (references exist but incomplete)
- **RED**: No alignment (missing integration)

---

## Phase 1-3 Infrastructure Reference

### Phase 1: Tool Manifest System

**Files:**

- `.claude/config/tool-manifest.json` - Central tool registry
- `.claude/hooks/routing/pre-spawn-tool-validator.cjs` - Pre-spawn validation
- `.claude/tools/cli/generate-tool-manifest.cjs` - Generator script

**Key Concepts:**

- **Toolsets:** DEVELOPER, PLANNER, ORCHESTRATOR, ROUTER, RESEARCHER, READ_ONLY, DATA_SCIENCE
- **Tool availability:** Per-agent role restrictions
- **Mandatory tools:** `TaskUpdate`, `Skill` for all agents
- **Reserved tools:** `Task` (orchestrators only), `AskUserQuestion` (router only)

**Integration Point:** Creators should reference toolsets from manifest, not hardcode tool lists.

### Phase 2: Skill Discovery System

**Files:**

- `.claude/config/skill-index.json` - Runtime skill registry (434 skills)
- `.claude/tools/cli/generate-skill-index.cjs` - Generator script

**Key Concepts:**

- **SkillCatalog()** tool for runtime skill discovery
- Skill metadata: `requiredTools`, `agentPrimary`, `agentSupporting`, `tags`, `priority`
- Domain/category classification for routing

**Integration Point:** New skills must be registered in skill-index.json, not just skill-catalog.md.

### Phase 3: Agent Capability System

**Files:**

- `.claude/context/agent-registry.json` - Runtime agent registry (49 agents)
- `.claude/schemas/agent-capability-card.schema.json` - Capability card schema
- `.claude/lib/tools/agent-registry-generator.cjs` - Generator script
- `.claude/tools/cli/generate-agent-registry.cjs` - CLI tool

**Key Concepts:**

- **AvailableAgents()** tool for runtime agent discovery
- Capability cards with: `capabilities`, `health`, `constraints`
- Health-aware routing: `healthy`, `degraded`, `unavailable`
- Capability routing via `.claude/config/capability-routing.json`

**Integration Point:** New agents must have capability cards generated and registered.

---

## Detailed Findings by Creator

### 1. agent-creator (`.claude/skills/agent-creator/SKILL.md`)

**Purpose:** Creates specialized AI agents on-demand

**Phase 1 - Tool Awareness:** **RED**

- **Finding:** Uses hardcoded tool lists in spawn examples
- **Evidence:** Lines showing spawn with explicit tool arrays, not referencing toolsets
- **Gap:** No reference to `tool-manifest.json` or toolset names (DEVELOPER, ORCHESTRATOR)
- **Impact:** New agents may be spawned with incorrect tool lists

**Phase 2 - Skill Discovery:** **RED**

- **Finding:** No reference to skill-index.json or SkillCatalog
- **Evidence:** Agent creation process doesn't register skills the agent uses
- **Gap:** New agents' skill associations not added to skill-index.json
- **Impact:** SkillCatalog() queries won't find agents for skills

**Phase 3 - Agent Orchestration:** **RED**

- **Finding:** No capability card generation
- **Evidence:** Post-creation steps don't include agent-registry-generator
- **Gap:** New agents not added to agent-registry.json
- **Impact:** AvailableAgents() won't discover new agents; health tracking inactive

**Critical Issues:**

1. Creates "invisible agents" - not discoverable by AvailableAgents()
2. No health tracking initialization for new agents
3. Router won't automatically route to new agents by capability

**Recommendations:**

- Add post-creation step: Run `node .claude/tools/cli/generate-agent-registry.cjs`
- Add toolset validation against tool-manifest.json
- Generate capability card from agent frontmatter

---

### 2. skill-creator (`.claude/skills/skill-creator/SKILL.md`)

**Purpose:** Creates skills with MCP conversion support

**Phase 1 - Tool Awareness:** **RED**

- **Finding:** No validation of required tools against tool-manifest.json
- **Evidence:** Skill templates specify tools without manifest validation
- **Gap:** New skills may require unavailable tools (MCP tools without servers)
- **Impact:** Skills may fail at runtime due to missing tools

**Phase 2 - Skill Discovery:** **YELLOW**

- **Finding:** Updates `skill-catalog.md` but NOT `skill-index.json`
- **Evidence:** Post-creation steps mention catalog but not index
- **Gap:** skill-index.json not regenerated after skill creation
- **Impact:** SkillCatalog() tool returns stale data

**Phase 3 - Agent Orchestration:** **RED**

- **Finding:** No agent assignment validation
- **Evidence:** Agent assignments not verified against agent-registry.json
- **Gap:** Skills may be assigned to non-existent agents
- **Impact:** Skill-to-agent mapping broken

**Critical Issues:**

1. skill-index.json becomes stale after skill creation
2. MCP tool requirements not validated against configured servers
3. Agent assignments not verified

**Recommendations:**

- Add post-creation step: Run `node .claude/tools/cli/generate-skill-index.cjs`
- Validate required tools against tool-manifest.json
- Verify agent assignments against agent-registry.json

---

### 3. workflow-creator (`.claude/skills/workflow-creator/SKILL.md`)

**Purpose:** Creates multi-agent orchestration workflows

**Phase 1 - Tool Awareness:** **RED**

- **Finding:** Workflow agent coordination uses hardcoded tool lists
- **Evidence:** Workflow templates include explicit tool arrays
- **Gap:** No reference to toolsets from manifest
- **Impact:** Workflows may spawn agents with mismatched tools

**Phase 2 - Skill Discovery:** **RED**

- **Finding:** No skill validation for workflow steps
- **Evidence:** Workflow skills not verified against skill-index.json
- **Gap:** Workflows may reference non-existent skills
- **Impact:** Workflow execution fails at skill invocation

**Phase 3 - Agent Orchestration:** **RED**

- **Finding:** No agent availability checking
- **Evidence:** Workflows don't validate agents exist in registry
- **Gap:** Workflows may reference unavailable/unhealthy agents
- **Impact:** Workflow execution fails due to agent issues

**Critical Issues:**

1. Workflows created without validating participating agents exist
2. Skill references not validated
3. No health-aware agent selection

**Recommendations:**

- Validate workflow agents against agent-registry.json
- Validate workflow skills against skill-index.json
- Use AvailableAgents() patterns for agent selection
- Reference toolsets from manifest for agent spawning

---

### 4. hook-creator (`.claude/skills/hook-creator/SKILL.md`)

**Purpose:** Creates and registers hooks

**Phase 1 - Tool Awareness:** **RED**

- **Finding:** Hook tool usage not validated
- **Evidence:** Hooks may intercept tools not in manifest
- **Gap:** No validation that hook targets valid tools
- **Impact:** Hooks may attempt to intercept non-existent tools

**Phase 2 - Skill Discovery:** **RED**

- **Finding:** Hook-skill associations not tracked
- **Evidence:** No integration with skill-index.json
- **Gap:** Skills provided by hooks not discoverable
- **Impact:** Hook capabilities hidden from SkillCatalog()

**Phase 3 - Agent Orchestration:** **RED**

- **Finding:** No agent registration for hook capabilities
- **Evidence:** Hook-based capabilities not in agent-registry
- **Gap:** Hooks that add agent capabilities invisible to AvailableAgents()
- **Impact:** Hook-enhanced routing not discoverable

**Critical Issues:**

1. Hook targets not validated against tool-manifest.json
2. Hook capabilities not registered anywhere
3. No way to discover what hooks add to system

**Recommendations:**

- Validate hook tool targets against tool-manifest.json
- Consider hook-capability registry for discovery
- Document hook impacts on tool/skill/agent availability

---

### 5. template-creator (`.claude/skills/template-creator/SKILL.md`)

**Purpose:** Creates templates for agents, skills, workflows

**Phase 1 - Tool Awareness:** **RED**

- **Finding:** Templates hardcode tool lists
- **Evidence:** Template examples show explicit tool arrays
- **Gap:** Templates don't reference toolsets from manifest
- **Impact:** Generated artifacts have outdated tool lists

**Phase 2 - Skill Discovery:** **RED**

- **Finding:** No skill placeholder validation
- **Evidence:** Template skill references not validated
- **Gap:** Templates may include non-existent skill references
- **Impact:** Generated artifacts have broken skill references

**Phase 3 - Agent Orchestration:** **RED**

- **Finding:** No agent placeholder validation
- **Evidence:** Template agent references not validated
- **Gap:** Templates may include non-existent agent references
- **Impact:** Generated artifacts have broken agent references

**Critical Issues:**

1. Templates become stale when Phase 1-3 infrastructure changes
2. No mechanism to update templates when manifest/registry changes
3. Template validation incomplete

**Recommendations:**

- Add toolset references (not hardcoded tools) in templates
- Validate skill/agent placeholders against registries
- Consider template versioning tied to infrastructure versions

---

### 6. schema-creator (`.claude/skills/schema-creator/SKILL.md`)

**Purpose:** Creates JSON Schema validation files

**Phase 1 - Tool Awareness:** **RED**

- **Finding:** No reference to tool-manifest schema
- **Evidence:** Schema creation doesn't use manifest as reference
- **Gap:** Tool-related schemas not aligned with manifest structure
- **Impact:** Schema validation may conflict with manifest

**Phase 2 - Skill Discovery:** **RED**

- **Finding:** No reference to skill-index schema
- **Evidence:** Skill-related schemas not aligned with index structure
- **Gap:** Schema validation may conflict with skill-index
- **Impact:** Skill validation inconsistent

**Phase 3 - Agent Orchestration:** **YELLOW**

- **Finding:** References `agent-capability-card.schema.json`
- **Evidence:** Schema creator knows about capability card schema
- **Gap:** Not enforced as required output for agent schemas
- **Impact:** Partial awareness but incomplete integration

**Critical Issues:**

1. Schemas created in isolation from Phase 1-3 infrastructure
2. No schema inheritance/composition with existing infrastructure schemas
3. Validation inconsistencies possible

**Recommendations:**

- Reference existing infrastructure schemas (tool-manifest, skill-index, agent-capability-card)
- Add schema compatibility validation
- Consider schema registry for discovery

---

## Integration Gap Analysis

### Gap 1: Post-Creation Regeneration Missing

**Current State:** Creators update markdown catalogs but not JSON registries
**Required State:** Post-creation must regenerate:

- `tool-manifest.json` (if tools change)
- `skill-index.json` (always for skill creation)
- `agent-registry.json` (always for agent creation)

**Impact:** Runtime discovery tools return stale data

### Gap 2: Validation Against Infrastructure

**Current State:** Creators validate against markdown docs
**Required State:** Validate against JSON registries:

- Tool availability from tool-manifest.json
- Skill existence from skill-index.json
- Agent availability from agent-registry.json

**Impact:** Invalid references created

### Gap 3: Toolset Reference (Not Hardcoding)

**Current State:** Hardcoded tool lists: `['Read', 'Write', 'Edit', ...]`
**Required State:** Reference toolsets: `toolset: DEVELOPER` or `tools: toolsets.DEVELOPER`

**Impact:** Tool list drift as manifest evolves

### Gap 4: Health Tracking Initialization

**Current State:** New agents have no health tracking
**Required State:** Initialize health object with `status: 'healthy'`

**Impact:** AvailableAgents() excludeFailed logic broken for new agents

---

## Recommendations

### Immediate (P0) - This Sprint

1. **Update agent-creator post-creation steps:**

   ```markdown
   ### Post-Creation Steps (BLOCKING)

   1. Run: `node .claude/tools/cli/generate-agent-registry.cjs`
   2. Verify agent appears in agent-registry.json
   3. Validate toolset against tool-manifest.json
   ```

2. **Update skill-creator post-creation steps:**

   ```markdown
   ### Post-Creation Steps (BLOCKING)

   1. Update skill-catalog.md (existing)
   2. Run: `node .claude/tools/cli/generate-skill-index.cjs`
   3. Verify skill appears in skill-index.json
   ```

3. **Create npm scripts for regeneration:**
   ```json
   {
     "scripts": {
       "generate:all": "npm run generate:tool-manifest && npm run generate:skill-index && npm run generate:agent-registry",
       "generate:tool-manifest": "node .claude/tools/cli/generate-tool-manifest.cjs",
       "generate:skill-index": "node .claude/tools/cli/generate-skill-index.cjs",
       "generate:agent-registry": "node .claude/tools/cli/generate-agent-registry.cjs"
     }
   }
   ```

### Medium Term (P1) - Next Sprint

4. **Create unified post-creation validation hook:**
   - `post-creation-infrastructure-sync.cjs`
   - Automatically regenerates affected registries
   - Validates new artifacts against infrastructure

5. **Update all creator templates:**
   - Replace hardcoded tool lists with toolset references
   - Add infrastructure validation placeholders
   - Include regeneration commands

6. **Add creator skill tests:**
   - Test that created artifacts are discoverable
   - Test that registries are updated
   - Test tool/skill/agent validation

### Future (P2) - Backlog

7. **Infrastructure-aware creator wizard:**
   - Query SkillCatalog() for available skills to assign
   - Query AvailableAgents() for agent dependencies
   - Query tool-manifest for available tools

8. **Automatic registry synchronization:**
   - File watcher on artifact directories
   - Auto-regenerate registries on change
   - CI/CD validation step

9. **Creator skill consolidation:**
   - Consider unified creator with artifact type parameter
   - Shared infrastructure validation logic
   - Single post-creation workflow

---

## Impact Assessment

### Risk Matrix

| Risk                            | Likelihood | Impact     | Mitigation                               |
| ------------------------------- | ---------- | ---------- | ---------------------------------------- |
| New agents not discoverable     | **HIGH**   | **HIGH**   | Regenerate agent-registry after creation |
| New skills not in SkillCatalog  | **HIGH**   | **MEDIUM** | Regenerate skill-index after creation    |
| Stale tool lists in spawns      | **MEDIUM** | **MEDIUM** | Use toolset references                   |
| Workflow agent validation fails | **MEDIUM** | **HIGH**   | Validate against registries              |
| Health tracking gap             | **LOW**    | **MEDIUM** | Initialize health in capability cards    |

### Affected Workflows

1. **Router Decision Workflow** - May not route to new agents
2. **Evolution Workflow** - Creates artifacts but they're invisible
3. **Swarm Coordination** - May fail to find agents by capability
4. **Feature Development** - May miss skills/agents in discovery

---

## Action Plan

### Phase 1: Documentation Update (2 hours)

- Update all 6 creator skill SKILL.md files
- Add infrastructure integration sections
- Add post-creation regeneration steps

### Phase 2: Script Creation (4 hours)

- Add npm scripts for registry regeneration
- Create post-creation validation script
- Add CI validation step

### Phase 3: Hook Implementation (8 hours)

- Create unified-post-creation-sync.cjs
- Integrate with existing creator guards
- Add telemetry for tracking

### Phase 4: Testing (4 hours)

- Add integration tests for creator-to-registry flow
- Test SkillCatalog/AvailableAgents after creation
- Regression tests for existing creators

---

## Appendix: Phase 1-3 Infrastructure Files

| File                                                 | Purpose                        | Generator                     |
| ---------------------------------------------------- | ------------------------------ | ----------------------------- |
| `.claude/config/tool-manifest.json`                  | Tool availability and toolsets | `generate-tool-manifest.cjs`  |
| `.claude/config/skill-index.json`                    | Runtime skill discovery        | `generate-skill-index.cjs`    |
| `.claude/context/agent-registry.json`                | Agent capabilities and health  | `generate-agent-registry.cjs` |
| `.claude/schemas/agent-capability-card.schema.json`  | Capability card validation     | Manual                        |
| `.claude/hooks/routing/pre-spawn-tool-validator.cjs` | Pre-spawn validation           | Manual                        |

---

## Audit Metadata

- **Audit ID:** ARCH-AUDIT-2026-01-31-001
- **Creator Skills Audited:** 6
- **Infrastructure Files Referenced:** 5
- **Critical Issues Found:** 12
- **Recommendations:** 9
- **Estimated Remediation Effort:** 18 hours

---

_This audit should be re-run after remediation to verify alignment._
