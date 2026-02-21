# Post-Creation Validation Workflow

**Version:** 1.0.0
**Created:** 2026-01-28
**Purpose:** Prevent "Invisible Artifact" pattern by validating integration completeness after artifact creation

## Overview

This workflow ensures that all created artifacts are properly integrated into the ecosystem before being considered complete. It addresses the gap identified in the Party Mode incident where a fully-implemented feature was invisible to the Router due to missing CLAUDE.md routing entry.

**Source of Truth:** Integration status for all artifacts is tracked in `.claude/context/data/artifact-graph.json`. This graph represents the dependency relationships and integration completion state for every artifact in the ecosystem.

## When to Use

- **MANDATORY** after ANY artifact creation via creator skills
- After restoring archived artifacts
- After manual artifact creation (emergency cases only)
- During periodic ecosystem health checks

## The 10-Item Integration Checklist

Every created artifact MUST pass all applicable items before the creator skill marks its task as complete.

### Checklist

| #   | Item                        | Applies To        | Validation Method                        |
| --- | --------------------------- | ----------------- | ---------------------------------------- |
| 1   | **CLAUDE.md Routing Entry** | Agents, Workflows | `grep "<artifact-name>" CLAUDE.md`       |
| 2   | **Skill Catalog Entry**     | Skills            | `grep "<skill-name>" skill-catalog.md`   |
| 3   | **Routing Table Keywords**  | Agents            | `grep "<keywords>" routing-table.cjs`    |
| 4   | **Agent Assignment**        | Skills, Workflows | At least one agent references artifact   |
| 5   | **Memory File Updates**     | All               | learnings.md or decisions.md updated     |
| 6   | **Schema Validation**       | All               | Passes appropriate JSON schema           |
| 7   | **Tests Passing**           | All with tests    | `npm test` or equivalent passes          |
| 8   | **Documentation Complete**  | All               | No placeholder text (TBD, TODO, etc.)    |
| 9   | **Evolution State Updated** | All               | evolution-state.json reflects completion |
| 10  | **Router Discoverability**  | Agents, Skills    | Router can route requests to artifact    |

### Detailed Validation Steps

#### Item 1: CLAUDE.md Routing Entry

**Applies to:** Agents, Workflows

**Why:** Artifacts not in CLAUDE.md routing table are invisible to the Router.

**How to validate:**

```bash
# For agents
grep -i "<agent-name>" .claude/CLAUDE.md | grep -i "routing table"

# For workflows
grep -i "<workflow-name>" .claude/CLAUDE.md | grep -i "workflow"
```

**Common failures:**

- Agent created but table not updated
- Workflow created but not added to Enterprise Workflows section

#### Item 2: Skill Catalog Entry

**Applies to:** Skills

**Why:** Skills not in catalog are undiscoverable by agents.

**How to validate:**

```bash
grep -i "<skill-name>" .claude/context/artifacts/catalogs/skill-catalog.md
```

**Common failures:**

- Skill SKILL.md created but catalog not updated
- Skill category mismatch in catalog

#### Item 3: Router Enforcer Keywords

**Applies to:** Agents

**Why:** Router uses keywords to match requests to agents.

**How to validate:**

```bash
# Check intentKeywords
grep -i "<domain-keyword>" .claude/lib/routing/routing-table.cjs

# Check INTENT_TO_AGENT mapping
grep -i "<agent-name>" .claude/lib/routing/routing-table.cjs
```

**Common failures:**

- No keywords added for new domain agent
- Keywords added but not mapped to agent

#### Item 4: Agent Assignment

**Applies to:** Skills, Workflows

**Why:** Unassigned skills/workflows cannot be invoked through agent routing.

**How to validate:**

```bash
# Check if skill is assigned to any agent
grep -r "<skill-name>" .claude/agents/
```

**Common failures:**

- Skill created but no agent lists it
- Workflow created but no agent references it

#### Item 5: Memory File Updates

**Applies to:** All artifacts

**Why:** Memory files capture learnings and decisions for future sessions.

**How to validate:**

```bash
# Check for recent updates mentioning artifact
grep -i "<artifact-name>" .claude/context/memory/learnings.md
grep -i "<artifact-name>" .claude/context/memory/decisions.md
```

**Common failures:**

- No learning recorded from creation process
- No decision record for design choices

#### Item 6: Schema Validation

**Applies to:** All artifacts with schemas

**Why:** Invalid schema = unpredictable behavior.

**How to validate:**

```bash
# Use ecosystem validator
node .claude/tools/cli/validate-agents.mjs <artifact-path>
```

**Common failures:**

- Missing required YAML frontmatter fields
- Invalid field values

#### Item 7: Tests Passing

**Applies to:** All artifacts with tests

**Why:** Failing tests = broken functionality.

**How to validate:**

```bash
# Run tests for specific artifact
npm test -- --grep "<artifact-name>"
```

**Common failures:**

- Tests written but not run before completion
- Tests passing locally but not in CI

#### Item 7 (Addition): Dependency Vulnerability Scan

**Trigger**: Any artifact that imports or requires external libraries (npm packages, pip packages, cargo crates, etc.)

**Required scan**: Before marking the artifact complete, run a dependency vulnerability scan:

```bash
# For npm/Node.js artifacts
pnpm audit --audit-level=high

# For Python artifacts
pip audit --vulnerability-service pypi

# For Rust artifacts
cargo audit
```

**Block condition**: Artifact MUST NOT be considered complete if the scan reports any **HIGH** or **CRITICAL** severity CVE via an imported dependency.

**Pass condition**: Either (a) scan returns 0 high/critical vulnerabilities, OR (b) vulnerable dependency has been replaced with a safe alternative, OR (c) a documented risk acceptance exists in `.claude/context/memory/decisions.md` with explicit human approval.

**Exception**: Pure markdown/documentation artifacts with no code imports are exempt.

**Log**: Record scan results in artifact's post-creation report. Include CVE IDs if any found.

#### Item 8: Documentation Complete

**Applies to:** All artifacts

**Why:** Incomplete docs = unusable artifact.

**How to validate:**

```bash
# Check for placeholder text
grep -i "TODO\|TBD\|FIXME\|<fill" <artifact-path>
```

**Common failures:**

- Template placeholders not replaced
- Sections left empty

#### Item 9: Evolution State Updated

**Applies to:** All artifacts

**Why:** Evolution state is the audit trail.

**How to validate:**

```bash
# Check evolution-state.json
grep -i "<artifact-name>" .claude/context/evolution-state.json
```

**Common failures:**

- Evolution started but not completed in state
- Missing completion timestamp

#### Item 10: Router Discoverability

**Applies to:** Agents, Skills

**Why:** The ultimate test - can the Router actually use this artifact?

**How to validate:**

```
# Manual test
Ask Router: "I need help with <artifact-domain>"
# Should route to newly created artifact
```

**Common failures:**

- All registrations complete but Router logic has bug
- Keywords conflict with another agent

---

## Step 11: Trigger Reflection for Integration Assessment

**Purpose**: Connect creation → integration → reflection feedback loop

**When**: After artifact integration validation completes (regardless of pass/fail)

### 11.1 Reflection Trigger Logic

```javascript
// After completing Steps 1-10 (integration checklist)
function triggerReflectionForArtifact(artifactId, validationResult) {
  const reflectionRequest = {
    taskId: getCurrentTaskId(),
    trigger: 'artifact_creation',
    artifactId,
    timestamp: new Date().toISOString(),
    priority: 'medium',
    context: {
      validationResult,
      integrationScore: validationResult.score,
      gaps: validationResult.gaps,
    },
  };

  // Queue for reflection-agent
  appendToQueue('.claude/context/runtime/reflection-spawn-request.json', reflectionRequest);
}
```

### 11.2 Reflection Assessment Focus

When reflection-agent processes artifact creation tasks, it should assess:

1. **Integration Completeness** (via Step 4.5 in reflection-agent.md):
   - Read artifact graph
   - Run `quickIntegrationCheck()`
   - Classify integration health (excellent/good/gaps/significant/critical)

2. **Creation Quality**:
   - Artifact follows framework patterns
   - Documentation complete
   - No placeholder text

3. **Learnings Extraction**:
   - What integration steps were challenging?
   - What could improve the creator workflow?
   - Should we add validation reminders?

### 11.3 Integration Health in RBT Diagnosis

The reflection report will include integration health in the RBT framework:

```markdown
## RBT Diagnosis

### Roses (Strengths)

- Artifact created with complete documentation
- All tests passing

### Buds (Growth Opportunities)

- Integration score: 65% (gaps: catalog entry, agent assignment)
- Could improve: Add catalog entry immediately after file creation

### Thorns (Issues)

- Critical integration gap: No routing keywords added to CLAUDE.md
- Artifact is invisible to Router until fixed
```

### 11.4 Self-Healing Trigger

If reflection detects recurring integration gaps across 3+ artifact creations:

```markdown
**Self-Healing Recommendation**: Pattern detected - creators frequently miss catalog updates.
Consider:

1. Add blocking validation to creator skills
2. Create pre-completion checklist reminder
3. Invoke artifact-integrator automatically after creator completion
```

---

## Validation CLI Tool

Use the automated validation tool:

```bash
# Validate a single artifact
node .claude/tools/cli/validate-integration.cjs <artifact-path>

# Validate all recently created artifacts
node .claude/tools/cli/validate-integration.cjs --recent

# Exit codes
# 0 = All checks passed
# 1 = One or more checks failed
```

---

## Integration with Creator Skills

All creator skills MUST include this validation step BEFORE marking task complete:

### Required Step in Creator Skills

```markdown
## Step N: Integration Verification (BLOCKING)

BEFORE calling TaskUpdate({ status: "completed" }):

1. Run the 10-item checklist (above)
2. Run: `node .claude/tools/cli/validate-integration.cjs <artifact-path>`
3. Verify exit code is 0
4. If exit code is 1:
   - Read error output for specific failures
   - Fix each failure
   - Re-run validation
   - Only proceed when exit code is 0

This step is BLOCKING. Do NOT mark task complete until validation passes.
```

---

## Artifact Graph Integration

After completing the integration checklist, update the artifact graph to reflect the new artifact's status:

### Step: Update Artifact Graph

```bash
# Use the artifact-graph library to record the artifact
# This updates .claude/context/data/artifact-graph.json

node -e "
const ArtifactGraph = require('./.claude/lib/workflow/artifact-graph.cjs');
const graph = new ArtifactGraph('./.claude/context/data/artifact-graph.json');

// Add artifact node
graph.addNode({
  id: '{type}:{name}',
  type: '{artifact-type}',
  name: '{artifact-name}',
  created: new Date().toISOString()
});

// Add integration edges as you complete checklist items
graph.addEdge('{type}:{name}', 'agent:{assigned-agent}', 'assigned-to');

graph.save();
"
```

**Note:** The artifact-graph provides a canonical view of all artifact integrations and dependencies. This graph is automatically updated by the `post-creation-integration.cjs` hook (see below), but manual updates ensure accuracy.

---

## Automated Integration Detection

The system includes automated hooks that detect incomplete integrations:

### post-creation-integration.cjs Hook

**Location:** `.claude/hooks/workflow/post-creation-integration.cjs`

**Behavior:**

- Fires automatically when any creator task completes (PostToolUse on TaskUpdate)
- Detects creator completions via metadata or pattern matching
- Runs quick integration check using artifact-graph.cjs library
- Queues incomplete integrations to `.claude/context/runtime/integration-queue.jsonl`
- Never blocks (advisory mode) - allows task to complete while flagging gaps

### artifact-integrator Skill

**Reference:** `.claude/skills/artifact-integrator/SKILL.md`

**Purpose:** Automated integration analysis and remediation for artifacts with gaps. Use this skill when:

- You need comprehensive integration analysis across all artifact relationships
- You want to generate integration tasks for incomplete artifacts
- You're auditing the ecosystem for integration health

The artifact-integrator skill uses the artifact-graph library to identify missing integrations and generate detailed remediation tasks.

---

## Session Reminder Hook

A session hook reminds agents about recently created artifacts that may need integration verification:

**Hook:** `.claude/hooks/session/post-creation-reminder.cjs`

**Behavior:**

- Checks evolution-state.json for completions in last 24 hours
- Runs validation on those artifacts
- Outputs reminder if any fail validation

---

## Failure Recovery

### If Validation Fails After Task Marked Complete

1. Create follow-up task for remediation
2. Run validation to identify specific failures
3. Fix each failure
4. Re-run validation until passing
5. Update evolution-state.json with fix record

### If Artifact Already Deployed with Missing Integration

1. **Immediate:** Add missing registrations
2. **Root cause:** Determine why validation was skipped
3. **Prevention:** Ensure validation step is BLOCKING in creator skill

---

## Metrics

Track these metrics to measure workflow effectiveness:

| Metric                       | Target  | How to Measure                                   |
| ---------------------------- | ------- | ------------------------------------------------ |
| Integration completion rate  | 100%    | Artifacts passing all 10 items / Total artifacts |
| Time to integration          | < 5 min | Time from artifact creation to validation pass   |
| Invisible artifact incidents | 0       | Count of artifacts found without routing entry   |
| Validation failure rate      | < 10%   | Failed first validations / Total validations     |

---

## Related Documents

- **Artifact Graph System:** `.claude/lib/workflow/artifact-graph.cjs` (library for managing artifact relationships and integration status)
- **Artifact Graph CLI Tool:** `.claude/tools/cli/bootstrap-artifact-graph.cjs` (tool for building/updating the graph)
- **Integration Hook:** `.claude/hooks/workflow/post-creation-integration.cjs` (auto-detects incomplete integrations)
- **Artifact Integrator Skill:** `.claude/skills/artifact-integrator/SKILL.md` (remediation workflows)
- **Research Report:** `.claude/context/artifacts/research-reports/artifact-integration-best-practices-20260128.md`
- **Validation Tool:** `.claude/tools/cli/validate-integration.cjs`
- **Reminder Hook:** `.claude/hooks/session/post-creation-reminder.cjs`
- **Evolution Workflow:** `.claude/workflows/core/evolution-workflow.md`
- **Skill Lifecycle:** `.claude/workflows/core/skill-lifecycle.md`

---

## Version History

| Version | Date       | Changes                                               |
| ------- | ---------- | ----------------------------------------------------- |
| 1.0.0   | 2026-01-28 | Initial release addressing Party Mode integration gap |
