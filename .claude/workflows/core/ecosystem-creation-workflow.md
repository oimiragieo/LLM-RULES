# Ecosystem Creation Workflow

<!-- Agent: technical-writer | Task: #47 | Session: 2026-02-08 -->

## Overview

This workflow defines the end-to-end process for creating artifacts within the Claude Code Enterprise Framework. It ensures every artifact is properly integrated with its companion artifacts, preventing the 70% orphan rate that occurs when artifacts are created without their ecosystem.

## Phases

### Phase 1: Routing (Router)

**Trigger:** User requests artifact creation or Router detects artifact creation intent.

**Gate 4 Check (Creator Workflow):**

- Router detects creation intent (skill, agent, hook, workflow, template, schema, command, rule, tool)
- Checks if target path matches creator output patterns
- Determines which creator skill is required

**Routing Decision:**

- Router spawns appropriate creator agent
- Creator type determined by artifact type and path pattern
- Research-synthesis skill MUST be invoked first (research-first protocol)

### Phase 2: Research (research-synthesis skill)

**MANDATORY for all artifact creation.**

**MCP-First Tool Priority:**

1. **Exa** (preferred) - Academic research, pattern discovery
2. **Ref** (fallback) - Code examples, implementation patterns
3. **WebSearch** (last resort) - General documentation, blog posts

**Research Requirements:**

- Minimum 3 queries
- Minimum 3 distinct sources
- Research report produced (`.claude/context/artifacts/research-reports/`)
- Query budget: 5 max per research session (prevents context overflow)
- Report size limit: 10 KB (enforces focused research)

**Output:** Research report documenting:

- Existing patterns in ecosystem
- Similar artifacts in codebase
- Best practices from external sources
- Design recommendations

### Phase 3: Pre-Check (companion-check.cjs)

**Step 0.5 in creator skills** - Companion awareness check before creation.

**Process:**

1. Load companion matrix from `ecosystem-impact-graph.json`
2. Check which companions already exist for this artifact type
3. Generate companion checklist for creator awareness
4. Display must-have / should-have / nice-to-have companions

**Companion Matrix Structure:**

```json
{
  "companionMatrix": {
    "skill": {
      "mustHave": ["skill-catalog-entry", "agent-assignment"],
      "shouldHave": ["example-usage", "test-coverage"],
      "niceToHave": ["command-delegation", "workflow-reference"]
    }
  }
}
```

**Check Strategies:**

- `file-exists` - Check if companion file exists at path
- `grep-in-file` - Search for reference in target file
- `json-key-exists` - Verify JSON structure has key
- `glob-match` - Pattern match for multiple files
- `settings-registered` - Check settings.json registration (hooks only)

**Output:** Companion checklist displayed to creator agent (awareness, not blocking).

### Phase 4: Creation (creator skill)

**Creator Skill Invocation:**

Agent invokes appropriate creator skill based on artifact type:

- `skill-creator` → `.claude/skills/**/SKILL.md`
- `agent-creator` → `.claude/agents/**/*.md`
- `hook-creator` → `.claude/hooks/**/*.cjs`
- `workflow-creator` → `.claude/workflows/**/*.md`
- `template-creator` → `.claude/templates/**/*`
- `schema-creator` → `.claude/schemas/**/*.json`
- `command-creator` → `.claude/commands/*.md`
- `rule-creator` → `.claude/rules/*.md`
- `tool-creator` → `.claude/tools/**/*.{cjs,mjs}`

**Creation Steps:**

1. Validate artifact name (SEC-ICE-001: no path traversal)
2. Check if artifact already exists (avoid overwrites)
3. Generate artifact content from research + templates
4. Validate against schema (if applicable)
5. Write artifact to correct location
6. Update catalog/registry (must-have integration)

**Post-Creation Steps (blocking):**

- Update CLAUDE.md routing references (if routing-relevant)
- Update relevant catalogs/registries
- Assign artifact to at least one agent
- Validate against schema/structure rules
- Record learnings/issues/decisions in memory

### Phase 5: Integration (artifact-integrator)

**Triggered:** Post-creation integration hook detects artifact completion.

**Step 3.1 - Companion Matrix Analysis:**

1. Read companion matrix for created artifact type
2. Check which must-have companions exist
3. Check which should-have companions exist
4. Check which nice-to-have companions exist

**Integration Analysis:**

- **Must-Have Missing:** Queue follow-up task (blocking recommendation)
- **Should-Have Missing:** Warn and queue (warning recommendation)
- **Nice-To-Have Missing:** Informational only (no action)

**Integration Queue:**

Missing companions queued to `.claude/context/runtime/integration-queue.jsonl`:

```json
{
  "artifactPath": ".claude/skills/<new-skill-name>/SKILL.md",
  "artifactType": "skill",
  "missingCompanions": ["agent-assignment", "example-usage"],
  "severity": "mustHave",
  "queuedAt": "2026-02-08T12:00:00.000Z"
}
```

**Router Step 0.5:** If integration queue has entries, Router spawns artifact-integrator in background (non-blocking).

### Phase 6: Follow-Up (auto-spawn / manual)

**Auto-Spawn Suggestions (SEC-ICE-002 controls):**

- **Depth Limit:** 2 (prevents infinite recursion)
- **Per-Event Cap:** 5 (prevents amplification attacks)
- **Cycle Detection:** Track DAG of spawns, block if cycle detected
- **Kill Switch:** `AUTO_SPAWN_COMPANIONS=off` disables all auto-spawning

**Auto-Spawn for Must-Have Companions:**

If must-have companion missing and auto-spawn enabled:

1. Generate companion creation task
2. Check depth limit (current depth < 2)
3. Check per-event cap (spawns this event < 5)
4. Check cycle detection (no circular dependencies)
5. Spawn companion creator if all checks pass

**Manual Review for Recommended/Optional:**

Should-have and nice-to-have companions are NOT auto-spawned:

- Artifact-integrator creates follow-up task
- Router reviews task list during next session
- User/Router decides whether to create companions

**Cycle Prevention:**

```
skill-creator → agent-creator → skill-creator (BLOCKED - cycle detected)
hook-creator → settings.json update → schema-creator (ALLOWED - no cycle)
```

## Security Controls

### SEC-ICE-001: Artifact Name Validation

**Threat:** Path traversal attacks via malicious artifact names.

**Protection:**

- Validate artifact names with strict regex: `^[a-z0-9][a-z0-9-]*[a-z0-9]$`
- Only lowercase letters, numbers, hyphens allowed
- Must start and end with alphanumeric (no leading/trailing hyphens)
- No path separators (`/`, `\`) allowed
- No parent directory references (`..`) allowed

**Enforcement:** All creator skills validate artifact names before path construction.

**Test Coverage:** 22 tests across 3 functions (isValidArtifactName, normalizePath, isPathWithinProject).

### SEC-ICE-002: Auto-Spawn Amplification Limits

**Threat:** Recursive companion spawning creates exponential agent proliferation.

**Protection:**

1. **Depth Limit:** Maximum 2 levels of auto-spawn (creator → companion → stop)
2. **Per-Event Cap:** Maximum 5 auto-spawns per creation event
3. **Cycle Detection:** DAG tracking prevents circular companion creation
4. **Kill Switch:** `AUTO_SPAWN_COMPANIONS=off` environment variable disables all auto-spawning

**Example Attack (Blocked):**

```
User creates skill A
  → Auto-spawns agent B (depth 1)
    → Auto-spawns skill C (depth 2)
      → Would auto-spawn agent D (BLOCKED - depth limit 2)
```

**Example Normal Use (Allowed):**

```
User creates skill A
  → Auto-spawns catalog entry (depth 1, companion 1)
  → Auto-spawns agent assignment (depth 1, companion 2)
  → Manual review for remaining companions
```

**Enforcement:** companion-check.cjs enforces limits before spawning. Kill switch checked first (fail-safe).

**Test Coverage:** 6 tests covering kill switch, depth limit, per-event cap, cycle detection.

## Companion Matrix Reference

See `ecosystem-impact-graph.json` for the complete companion matrix defining required/recommended/optional companions for all 9 artifact types:

- **Skills:** catalog entry (must), agent assignment (must), example usage (should), test coverage (should), command delegation (nice), workflow reference (nice)
- **Agents:** registry entry (must), routing keyword (must), skill assignment (should), workflow reference (should), personality/voice (nice)
- **Hooks:** settings.json registration (must), @ENFORCEMENT_HOOKS.md entry (must), test coverage (should), performance metrics (nice)
- **Workflows:** @WORKFLOW_AGENT_MAP.md entry (must), agent assignment (must), phase diagram (should), example execution (nice)
- **Templates:** catalog entry (must), template-catalog.md entry (must), usage examples (should), validation schema (nice)
- **Schemas:** catalog entry (must), validation hook (should), test coverage (should), examples (nice)
- **Commands:** command-catalog.md entry (must), skill delegation (must), help text (should), shortcut documentation (nice)
- **Rules:** workspace conventions (must), enforcement hook (should), examples (should), exceptions list (nice)
- **Tools:** tool-catalog.md entry (must), help text (must), test coverage (should), performance benchmarks (nice)

## Related Workflows

- **router-decision.md** - Master routing workflow (Gate 4: Creator Workflow)
- **enterprise-workflow.md** - Multi-phase execution (creation is Implement phase)
- **evolution-workflow.md** - EVOLVE process (Phase O: Research, Phase E: Evaluation includes companion analysis)
- **feature-development-workflow.md** - Feature development phases (artifacts created during implementation)

## Integration with Existing System

**Router Step 0.5 (Integration Queue Check):**

Before routing, Router checks `.claude/context/runtime/integration-queue.jsonl` for pending integrations. If entries exist, Router spawns artifact-integrator in background.

**Post-Creation Hook (post-creation-integration.cjs):**

Detects TaskUpdate with status=completed for creator tasks. Enqueues integration analysis to integration-queue.jsonl.

**Creator Skills Step 0.5 (Companion Check):**

All 9 creator skills now include Step 0.5 between Step 0 (existence check) and Step 1 (research). Displays companion checklist for awareness before creation begins.

**Artifact-Integrator Skill:**

Processes integration queue entries. Performs Step 3.1 (companion matrix analysis). Proposes follow-up tasks for missing must-have/should-have companions.

## Metrics

**Before Interwoven Ecosystem:**

- 70% orphan rate (artifacts created without integration)
- Manual integration fixes required
- Discovered gaps weeks/months after creation

**After Interwoven Ecosystem:**

- Projected <20% orphan rate (companion matrix + auto-integration)
- Proactive integration gap detection (Step 0.5 + Step 3.1)
- Real-time companion awareness (before creation begins)

## Escape Hatches

**Override Auto-Spawn:** Set `AUTO_SPAWN_COMPANIONS=off` to disable companion auto-spawning (manual review only).

**Override Companion Check:** Companion check is advisory only (displays checklist, does not block creation).

**Override Integration Queue:** Delete `.claude/context/runtime/integration-queue.jsonl` to clear pending integration tasks.

**Override Research-First:** Research-synthesis can be skipped if artifact is trivial (update existing artifact, minor documentation change). Use artifact-updater skill instead of creator skills for updates.
