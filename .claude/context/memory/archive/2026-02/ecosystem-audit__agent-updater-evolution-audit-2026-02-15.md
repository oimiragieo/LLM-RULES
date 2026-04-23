<!-- Agent: architect | Task: audit | Session: 2026-02-15 -->

# Agent-Updater & Evolution Workflow Integration Audit

## Executive Summary

The agent-updater skill provides a well-structured 7-step workflow for refreshing existing agents with risk scoring and TDD gates, and is properly wired into the EVOLVE workflow's Phase 4 (LOCK) dispatch table. However, this audit identifies **8 findings** ranging from CRITICAL to LOW severity. The most severe issue is a hardcoded `buildPatchPlan()` function in `main.cjs` that returns identical file lists regardless of which agent is being updated, rendering the "exact patch plan" output misleading. Additionally, the agent-updater-workflow.yaml marks the OBTAIN (research) phase as `optional: true`, directly contradicting Iron Law 1 of the evolution-workflow.md which states "NO ARTIFACT WITHOUT RESEARCH." Backup/rollback logic is declared in the workflow YAML but has zero implementation in the scripts. The output schema omits fields actually returned by `main.cjs`, and no runtime schema validation exists.

---

## Findings

### Finding 1: Hardcoded `buildPatchPlan()` Ignores Target Agent

- **Severity**: CRITICAL
- **Current State**: The `buildPatchPlan(target)` function at `C:\dev\projects\agent-studio\.claude\skills\agent-updater\scripts\main.cjs:81-107` accepts a `target` parameter but never uses it. It always returns the same three `promptFiles` (`developer.md`, `qa.md`, `code-reviewer.md`), the same two `workflowFiles` (`enterprise-workflow.md`, `router-decision.md`), and the same four `hookEnforcementPoints`.
- **Gap**: When invoked for any agent (e.g., `--agent security-architect`), the patch plan still lists `developer.md`, `qa.md`, `code-reviewer.md` as prompt files to update. The target agent's own file is never included in `promptFiles`. The `objective` string is also hardcoded to a single use case ("microtask ownership, search/token-saver policy").
- **Impact**: (1) The patch plan output is factually incorrect for any agent other than developer/qa/code-reviewer. (2) Consumers relying on the plan to scope file changes will miss the actual target agent file and touch unrelated files. (3) The skill's documented contract ("Every run must output a structured patch plan") is violated because the plan is static, not computed.
- **Proposed Fix**: Refactor `buildPatchPlan(target)` to dynamically resolve files based on the target agent.

```javascript
// BEFORE (main.cjs:81-107)
function buildPatchPlan(target) {
  return {
    objective: 'Refresh agent prompt/frontmatter with explicit microtask ownership...',
    promptFiles: [
      '.claude/agents/core/developer.md',
      '.claude/agents/core/qa.md',
      '.claude/agents/specialized/code-reviewer.md',
    ],
    // ... hardcoded
  };
}

// AFTER
function buildPatchPlan(target) {
  const targetPath = target; // e.g., '.claude/agents/core/planner.md'
  const promptFiles = [targetPath]; // Always include the target agent
  // Optionally discover related agents via routing-table or registry
  return {
    objective: `Refresh agent prompt/frontmatter for ${path.basename(targetPath, '.md')}.`,
    promptFiles,
    workflowFiles: discoverRelatedWorkflows(targetPath),
    hookEnforcementPoints: discoverRelevantHooks(targetPath),
    validationCommands: [
      `node .claude/tools/cli/validate-integration.cjs ${targetPath}`,
      'node .claude/tools/cli/generate-agent-registry.cjs',
      'pnpm lint',
    ],
  };
}
```

- **Validation**: Run `node .claude/skills/agent-updater/scripts/main.cjs --agent planner` and verify that `patchPlan.promptFiles` includes `.claude/agents/core/planner.md` (not developer.md).

---

### Finding 2: OBTAIN Phase Marked Optional in Workflow YAML (Contradicts Iron Law 1)

- **Severity**: HIGH
- **Current State**: In `C:\dev\projects\agent-studio\.claude\workflows\updaters\agent-updater-workflow.yaml:127-128`, the obtain phase is declared as:

```yaml
obtain:
  description: Research best practices for the change type (optional)
  optional: true
```

The gate at line 152-154 is:

```yaml
- id: gate-obtain
  condition: 'true'
  on_fail: pass
  message: 'Research phase is optional for updates'
```

This means the gate always passes and the phase can be skipped entirely.

- **Gap**: `evolution-workflow.md` Iron Law 1 explicitly states: "NO ARTIFACT WITHOUT RESEARCH. Phase O (OBTAIN) is MANDATORY and cannot be bypassed." The `research-enforcement.cjs` hook enforces this for Write/Edit to artifact paths. However, the workflow YAML's `optional: true` creates an internal inconsistency: if the WorkflowEngine respects the YAML, it will skip research; if the hook enforces it, the write will be blocked -- causing a confusing failure mode.
- **Impact**: (1) If the WorkflowEngine is used to drive execution, research is skipped for agent updates. (2) The `research-enforcement.cjs` hook would then block the subsequent write, causing a confusing mid-workflow failure. (3) The YAML and the evolution-workflow.md contradict each other, creating ambiguity about whether updates actually require research.
- **Proposed Fix**: Two options depending on architectural intent:

**Option A (Recommended): Research is mandatory for all updates** -- align with Iron Law 1:

```yaml
obtain:
  description: Research best practices for the change type
  optional: false # Align with evolution-workflow.md Iron Law 1
  steps:
    # ... existing steps unchanged
  gates:
    - id: gate-obtain
      condition: "steps['analyze-change-patterns'].output.pattern_analysis !== null"
      on_fail: abort
      message: 'Research phase must produce pattern analysis for updates'
```

**Option B: Explicitly relax for updates** -- but document as ADR exception:

```yaml
obtain:
  description: Research best practices for the change type (optional for low-risk updates)
  optional: true
  # NOTE: ADR-XXX permits skipping research for low-risk agent updates.
  # High-risk updates MUST complete research. See classifyRisk() in main.cjs.
```

If Option B is chosen, `research-enforcement.cjs` must also be updated to allow writes when `evolution-state.json` indicates an `agent-update` type with low risk.

- **Validation**: After fix, run a simulated agent-update workflow and verify the obtain phase executes (Option A) or that research-enforcement does not block low-risk updates (Option B).

---

### Finding 3: Backup/Rollback Logic Declared But Not Implemented

- **Severity**: HIGH
- **Current State**: The `agent-updater-workflow.yaml` defines:
  - `updater_config.backup_enabled: true` (line 20)
  - `updater_config.backup_location: .claude/context/backups/agents/` (line 21)
  - A `lock` phase step `create-backup` with handler `createBackup` (line 162)
  - A `compensate` section with `restore_backup` and `revert_routing` actions (lines 328-335)

However:

- `main.cjs` contains zero backup logic (no backup creation, no backup restoration)
- The backup directory `.claude/context/backups/` contains only `.gitkeep`
- No `createBackup` handler implementation exists anywhere in the skill directory
- No `restore_backup` compensate handler exists
- grep for `createBackup|restore_backup|backup_id` in the agent-updater skill returns zero matches

- **Gap**: The workflow YAML specifies backup as a blocking gate (`gate-lock-backup` requires `backup_id !== null`), but no code implements it. If the WorkflowEngine actually evaluates this gate, it would always fail and abort.
- **Impact**: (1) Agent updates have no safety net -- if an update corrupts an agent file, there is no automated rollback path. (2) The workflow YAML is aspirational, not functional. (3) The `compensate` section creates a false sense of safety.
- **Proposed Fix**: Implement backup/restore in `main.cjs` or a separate utility:

```javascript
// Add to main.cjs or create backup-utils.cjs
function createBackup(agentPath) {
  const backupDir = path.join(PROJECT_ROOT, '.claude', 'context', 'backups', 'agents');
  fs.mkdirSync(backupDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupName = `${path.basename(agentPath, '.md')}-${timestamp}.md`;
  const backupPath = path.join(backupDir, backupName);
  const fullAgentPath = path.join(PROJECT_ROOT, agentPath);
  fs.copyFileSync(fullAgentPath, backupPath);
  return { backupId: backupName, backupPath: backupPath };
}

function restoreBackup(backupPath, agentPath) {
  const fullAgentPath = path.join(PROJECT_ROOT, agentPath);
  fs.copyFileSync(backupPath, fullAgentPath);
}
```

- **Validation**: Run `node .claude/skills/agent-updater/scripts/main.cjs --agent developer --mode execute`, then verify a backup file exists in `.claude/context/backups/agents/`.

---

### Finding 4: Output Schema Does Not Match Actual `main.cjs` Output

- **Severity**: MEDIUM
- **Current State**: The output schema at `C:\dev\projects\agent-studio\.claude\skills\agent-updater\schemas\output.schema.json` declares:

```json
{
  "required": ["ok"],
  "properties": {
    "ok": { "type": "boolean" },
    "mode": { "type": "string" },
    "risk": { "type": "string" },
    "target": { "type": "object" },
    "patchPlan": { "type": "object" }
  }
}
```

But `main.cjs` actually returns additional fields that are not in the schema:

- `trigger` (string: "manual" | "reflection" | "evolve")
- `requiredInvocations` (array of strings)
- `tddBacklog` (array of objects with `phase` and `items`)

It also returns error-case fields not in the schema:

- `stage` (string)
- `error` (string)
- `recommendation` (string)

- **Gap**: (1) The schema is incomplete -- consumers validating output against the schema would reject valid output with `trigger`, `requiredInvocations`, `tddBacklog`. (2) No runtime validation of the schema exists in `main.cjs` (it never references or loads the schema file). (3) The input schema is similarly underspecified -- it accepts `agent`, `trigger`, `mode`, `changes` but `main.cjs` also accepts `name` and `help` as flags.
- **Impact**: Downstream consumers (evolution-orchestrator, WorkflowEngine) cannot reliably validate agent-updater output. Schema drift makes the schemas misleading rather than useful.
- **Proposed Fix**: Update `output.schema.json` to match actual output:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "agent-updater output",
  "type": "object",
  "required": ["ok"],
  "properties": {
    "ok": { "type": "boolean" },
    "mode": { "type": "string", "enum": ["plan", "execute"] },
    "risk": { "type": "string", "enum": ["low", "medium", "high"] },
    "trigger": { "type": "string", "enum": ["manual", "reflection", "evolve"] },
    "target": {
      "type": "object",
      "properties": {
        "agentName": { "type": "string" },
        "agentPath": { "type": "string" },
        "exists": { "type": "boolean" }
      }
    },
    "patchPlan": {
      "type": "object",
      "properties": {
        "objective": { "type": "string" },
        "promptFiles": { "type": "array", "items": { "type": "string" } },
        "workflowFiles": { "type": "array", "items": { "type": "string" } },
        "hookEnforcementPoints": { "type": "array", "items": { "type": "string" } },
        "validationCommands": { "type": "array", "items": { "type": "string" } }
      }
    },
    "requiredInvocations": { "type": "array", "items": { "type": "string" } },
    "tddBacklog": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "phase": { "type": "string", "enum": ["RED", "GREEN", "REFACTOR", "VERIFY"] },
          "items": { "type": "array", "items": { "type": "string" } }
        }
      }
    },
    "stage": { "type": "string" },
    "error": { "type": "string" },
    "recommendation": { "type": "string" }
  }
}
```

Also add runtime validation in `main.cjs`:

```javascript
const Ajv = require('ajv');
const outputSchema = require('../schemas/output.schema.json');
// ... validate before returning
```

- **Validation**: After updating schema, run `npx ajv validate -s .claude/skills/agent-updater/schemas/output.schema.json -d <(node .claude/skills/agent-updater/scripts/main.cjs --agent developer)` and confirm it passes.

---

### Finding 5: Evolution Orchestrator Type Dispatch Ambiguity

- **Severity**: MEDIUM
- **Current State**: The `evolution-orchestrator.md` dispatches to `agent-updater` in Phase L (LOCK) via:

```javascript
case 'agent-update':
  Skill({ skill: 'agent-updater' });
  break;
```

This dispatch exists at lines 342-343 and again at 732-733 of the orchestrator file. The `evolution-state.json` schema (in `evolution-workflow.md:878`) lists `agent-update` as a valid type.

- **Gap**: The orchestrator's Phase E (EVALUATE) state transition template at line 162-172 only shows the type enum as `"agent|skill|workflow|hook|schema|template"` -- it omits `agent-update`, `skill-update`, and `workflow-update`. This means an orchestrator following the template literally would never set `type: "agent-update"` during evaluation, even though the dispatch in Phase L depends on it. The determination of whether a request is "new agent" vs "agent update" is left entirely to the orchestrator's judgment with no programmatic check.
- **Impact**: (1) The orchestrator may misclassify an update request as a new creation, invoking `agent-creator` instead of `agent-updater`. (2) There is no automated detection: the evolution triggers in the frontmatter include both "create new agent" and "refresh agent"/"update existing agent", but no code maps these triggers to the correct `type` value. (3) If misclassified as `agent` (new), it would go through `agent-creator` which would fail at the EVALUATE gate because the agent already exists.
- **Proposed Fix**: (1) Add `agent-update`, `skill-update`, `workflow-update` to the Phase E state transition template in `evolution-orchestrator.md`. (2) Add a programmatic type classifier in the orchestrator's EVALUATE phase:

```javascript
// In evolution-orchestrator.md Phase E, after gap analysis:
function classifyEvolutionType(request, existingArtifacts) {
  const targetExists = existingArtifacts.some(a => a.name === request.name);
  if (request.intent === 'refresh' || request.intent === 'update' || targetExists) {
    return `${request.artifactType}-update`; // e.g., 'agent-update'
  }
  return request.artifactType; // e.g., 'agent' (new creation)
}
```

- **Validation**: Invoke the orchestrator with "refresh the planner agent" and verify that `evolution-state.json` shows `type: "agent-update"` (not `type: "agent"`).

---

### Finding 6: Missing artifact-integrator Invocation After Completion

- **Severity**: MEDIUM
- **Current State**: The `agent-updater` SKILL.md workflow (steps 1-7) and `main.cjs` output do not reference `artifact-integrator` anywhere. The `requiredInvocations` array in `main.cjs:145-149` lists `framework-context`, `research-synthesis`, `skill-updater`, and `verification-before-completion` -- but not `artifact-integrator`.

The `evolution-workflow.md` Phase 6 (ENABLE) explicitly requires:

```javascript
// 7. Run artifact integration analysis (ADR-100)
Skill({ skill: 'artifact-integrator' });
```

The `evolution-orchestrator.md` skills array includes `artifact-integrator`.

- **Gap**: When `agent-updater` is invoked standalone (not through the full EVOLVE orchestrator), the artifact-integrator step is never triggered. This means updated agents may have stale graph edges in `artifact-graph.json`, missing catalog updates, or orphaned relationships.
- **Impact**: (1) Updated agents that gain new skills or lose old skills will have incorrect dependency edges in the artifact graph. (2) The post-creation-integration hook (`post-creation-integration.cjs`) may queue integration checks, but the agent-updater itself does not invoke the integrator to process the queue. (3) Router Step 0.5 would eventually catch this, but there is a gap between update completion and the next router cycle.
- **Proposed Fix**: Add `artifact-integrator` to the requiredInvocations in `main.cjs` and to Step 6 in the SKILL.md workflow:

```javascript
// main.cjs - add to requiredInvocations array
requiredInvocations: [
  "Skill({ skill: 'framework-context' })",
  "Skill({ skill: 'research-synthesis' })",
  "Skill({ skill: 'skill-updater' }) // if skill parity changes are needed",
  "Skill({ skill: 'verification-before-completion' })",
  "Skill({ skill: 'artifact-integrator' })", // NEW: post-update integration check
],
```

In SKILL.md, add after Step 6:

```markdown
6.5. Invoke artifact-integrator to update graph edges and detect integration gaps.
```

- **Validation**: After fix, run `node .claude/skills/agent-updater/scripts/main.cjs --agent developer` and verify `requiredInvocations` includes `artifact-integrator`.

---

### Finding 7: Parity Gap with skill-updater

- **Severity**: MEDIUM
- **Current State**: `skill-updater` (SKILL.md) has a mature Step 3 "Gap Analysis" that checks 10 enterprise bundle components:

```
- SKILL.md clarity + trigger rules
- scripts/main.cjs deterministic output contract
- hooks/pre-execute.cjs and hooks/post-execute.cjs
- schemas/input.schema.json and schemas/output.schema.json
- commands/<skill>.md and top-level .claude/commands/ delegator
- templates/implementation-template.md
- rules/<skill>.md
- workflow doc in .claude/workflows/*skill-workflow.md
- agent assignments, CLAUDE references, skill catalog coverage
```

`agent-updater` has no equivalent enterprise bundle gap analysis step. Its workflow simply says "Generate an exact patch plan" without checking the agent's entire integration surface.

Additionally, `skill-updater` has two command surfaces (`/skill-updater`, `/skill-refresh`), while `agent-updater` has one command (`/agent-updater`) that is properly wired in `.claude/commands/agent-updater.md`.

- **Gap**: Agent updates do not systematically check the agent's full integration surface (routing-table keywords, agent-registry entry, CLAUDE.md references, skill assignments, hook enforcement, workflow assignments). The updater may fix the prompt but leave stale routing keywords or missing registry entries.
- **Impact**: Updated agents may have prompt improvements that are undermined by stale routing or missing skill assignments.
- **Proposed Fix**: Add an enterprise bundle gap analysis step to the SKILL.md workflow, adapted for agents:

```markdown
### Step 3.5: Enterprise Bundle Gap Analysis

Check the target agent's full integration surface:

- Agent `.md` file: frontmatter validity (model, tools, skills, permissionMode)
- Routing keywords in `.claude/lib/routing/routing-table.cjs`
- Agent registry entry in `.claude/context/agent-registry.json`
- CLAUDE.md Section 3 routing table reference
- Assigned skills existence check (all skills in skills array exist)
- Hook enforcement alignment (hooks referencing this agent)
- Workflow assignments in `@WORKFLOW_AGENT_MAP.md`
```

- **Validation**: After adding the gap analysis step, invoke the agent-updater for `security-architect` and verify it checks routing-table keywords and skill assignments.

---

### Finding 8: State Machine Integration -- Workflow YAML Does Not Reference evolution-state-guard Hook

- **Severity**: LOW
- **Current State**: The `agent-updater-workflow.yaml` has steps like `update-state-evaluate`, `update-state-validate`, etc., that call `updateEvolutionState` handlers. These presumably write to `evolution-state.json`. The `evolution-state-guard.cjs` hook monitors Write/Edit operations targeting `evolution-state.json` and validates state transitions.

However:

- The workflow YAML does not reference `evolution-state-guard.cjs` in any enforcement or gate definition
- The state updates in the YAML use `handler: updateEvolutionState` but this handler is not implemented in `main.cjs`
- The `main.cjs` script does not read or write `evolution-state.json` at all

- **Gap**: The workflow YAML assumes a WorkflowEngine that calls named handlers (`checkEvolutionState`, `loadExistingAgent`, `createBackup`, `updateEvolutionState`, etc.), but no such engine implementation exists that is wired to these specific handlers. The `main.cjs` script is a standalone CLI tool that outputs a plan -- it does not drive the full workflow.
- **Impact**: (1) The workflow YAML is a specification document, not an executable workflow -- there is a gap between what it describes and what `main.cjs` implements. (2) State transitions during agent updates are not validated against the evolution state machine unless the full EVOLVE orchestrator is used. (3) Running `main.cjs` directly will not update `evolution-state.json`, leaving the state machine out of sync.
- **Proposed Fix**: This is an architectural gap across all updater skills (agent-updater, skill-updater, workflow-updater). Options:

**Option A (Short-term)**: Document that `main.cjs` is plan-only and the full workflow must be driven by the evolution-orchestrator.

**Option B (Long-term)**: Implement a WorkflowEngine that can execute the YAML phases, or add state management to `main.cjs`:

```javascript
// Add to main.cjs when mode === 'execute'
function updateEvolutionState(phase) {
  const statePath = path.join(PROJECT_ROOT, '.claude', 'context', 'evolution-state.json');
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  state.state = phase;
  state.currentEvolution.phase = phase;
  state.lastUpdated = new Date().toISOString();
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}
```

- **Validation**: If Option B is implemented, run `main.cjs --mode execute --agent developer` and verify `evolution-state.json` transitions through the expected states.

---

## Proposed Updates (Prioritized)

### Update 1: Fix Hardcoded buildPatchPlan (CRITICAL -- Priority 1)

- **Files to Change**: `C:\dev\projects\agent-studio\.claude\skills\agent-updater\scripts\main.cjs`
- **Before**: `buildPatchPlan()` returns static file list ignoring `target` parameter
- **After**: `buildPatchPlan(target)` dynamically resolves files based on target agent, always includes the target agent's own path in `promptFiles`
- **Validation Steps**:
  - `node .claude/skills/agent-updater/scripts/main.cjs --agent planner` -- verify `patchPlan.promptFiles` contains `planner.md`
  - `node .claude/skills/agent-updater/scripts/main.cjs --agent security-architect` -- verify `patchPlan.promptFiles` contains `security-architect.md`
  - Verify existing tests still pass: `pnpm test`
- **Risk Score**: medium (changes core output, but plan-only mode has no side effects)

### Update 2: Resolve OBTAIN Phase Optionality (HIGH -- Priority 2)

- **Files to Change**: `C:\dev\projects\agent-studio\.claude\workflows\updaters\agent-updater-workflow.yaml`
- **Before**: `obtain.optional: true`, gate condition `'true'`
- **After**: Either `optional: false` with meaningful gate condition, or documented ADR exception with `research-enforcement.cjs` alignment
- **Validation Steps**:
  - Verify no contradiction with `evolution-workflow.md` Iron Law 1
  - If optional for low-risk only: verify `research-enforcement.cjs` allows low-risk updates without research
- **Risk Score**: low (YAML change, no runtime code)

### Update 3: Implement Backup/Restore (HIGH -- Priority 3)

- **Files to Change**: `C:\dev\projects\agent-studio\.claude\skills\agent-updater\scripts\main.cjs` (add backup functions)
- **Before**: No backup code exists; workflow YAML references unimplemented handlers
- **After**: `createBackup()` and `restoreBackup()` functions implemented; backup directory populated during execution
- **Validation Steps**:
  - Run `--mode execute --agent developer` and verify backup file in `.claude/context/backups/agents/`
  - Corrupt the agent file, run restore, verify original content restored
- **Risk Score**: low (additive change, no existing behavior modified)

### Update 4: Align Output Schema (MEDIUM -- Priority 4)

- **Files to Change**: `C:\dev\projects\agent-studio\.claude\skills\agent-updater\schemas\output.schema.json`
- **Before**: Schema missing `trigger`, `requiredInvocations`, `tddBacklog`, error fields
- **After**: Schema includes all fields actually returned by `main.cjs`
- **Validation Steps**:
  - Run `main.cjs` and validate output against updated schema
  - `pnpm lint` passes
- **Risk Score**: low (schema-only change)

### Update 5: Add artifact-integrator to Required Invocations (MEDIUM -- Priority 5)

- **Files to Change**: `C:\dev\projects\agent-studio\.claude\skills\agent-updater\scripts\main.cjs`, `C:\dev\projects\agent-studio\.claude\skills\agent-updater\SKILL.md`
- **Before**: No artifact-integrator reference
- **After**: Added to `requiredInvocations` array and SKILL.md Step 6.5
- **Validation Steps**:
  - Run `main.cjs --agent developer` and verify `requiredInvocations` includes `artifact-integrator`
  - Grep SKILL.md for `artifact-integrator`
- **Risk Score**: low (additive change)

### Update 6: Add Enterprise Bundle Gap Analysis (MEDIUM -- Priority 6)

- **Files to Change**: `C:\dev\projects\agent-studio\.claude\skills\agent-updater\SKILL.md`
- **Before**: No systematic integration surface check
- **After**: Step 3.5 added with 7-point integration surface checklist
- **Validation Steps**:
  - Read updated SKILL.md and verify gap analysis step exists
  - Compare with skill-updater Step 3 for parity
- **Risk Score**: low (documentation-only)

### Update 7: Fix Evolution Type Classification in Orchestrator (MEDIUM -- Priority 7)

- **Files to Change**: `C:\dev\projects\agent-studio\.claude\agents\orchestrators\evolution-orchestrator.md`
- **Before**: Phase E state transition template omits `-update` type variants
- **After**: Template includes `agent-update|skill-update|workflow-update` in type enum; programmatic classifier documented
- **Validation Steps**:
  - Grep orchestrator for `agent-update` in Phase E section
  - Verify state transition template includes update types
- **Risk Score**: low (documentation fix in orchestrator prompt)

### Update 8: Document Workflow YAML vs main.cjs Execution Gap (LOW -- Priority 8)

- **Files to Change**: `C:\dev\projects\agent-studio\.claude\skills\agent-updater\SKILL.md`
- **Before**: No documentation about the YAML being a specification vs. `main.cjs` being the executable
- **After**: Clear note that `main.cjs` is plan-only mode; full execution requires evolution-orchestrator driving the YAML phases
- **Validation Steps**:
  - Read SKILL.md for execution model documentation
- **Risk Score**: low (documentation-only)

---

## Validation Plan

### Automated Checks

```bash
# 1. Verify main.cjs runs without errors for multiple agents
node .claude/skills/agent-updater/scripts/main.cjs --agent developer
node .claude/skills/agent-updater/scripts/main.cjs --agent planner
node .claude/skills/agent-updater/scripts/main.cjs --agent security-architect
node .claude/skills/agent-updater/scripts/main.cjs --agent nonexistent-agent

# 2. Validate output schema alignment (after Update 4)
# Pipe main.cjs output through schema validator
node -e "
  const output = require('./.claude/skills/agent-updater/scripts/main.cjs').main({agent:'developer'});
  const schema = require('./.claude/skills/agent-updater/schemas/output.schema.json');
  const required = schema.required || [];
  const missing = required.filter(k => !(k in output));
  const extra = Object.keys(output).filter(k => !(k in (schema.properties || {})));
  console.log('Missing required:', missing);
  console.log('Extra (not in schema):', extra);
  console.log('Aligned:', missing.length === 0 && extra.length === 0);
"

# 3. Verify OBTAIN phase configuration
grep -n 'optional:' .claude/workflows/updaters/agent-updater-workflow.yaml

# 4. Verify backup directory exists
ls -la .claude/context/backups/agents/ 2>/dev/null || echo "No backup directory"

# 5. Verify artifact-integrator reference
grep -c 'artifact-integrator' .claude/skills/agent-updater/SKILL.md
grep -c 'artifact-integrator' .claude/skills/agent-updater/scripts/main.cjs

# 6. Verify command wiring
cat .claude/commands/agent-updater.md

# 7. Run lint and format checks
pnpm lint:fix
pnpm format
```

### Manual Verification

1. **Hardcoded patch plan**: Run `main.cjs` for 3 different agents and manually verify that `promptFiles` is different for each.
2. **OBTAIN phase**: Trace through the YAML workflow and verify the obtain phase cannot be skipped when `optional` is corrected.
3. **Backup/restore**: After implementing backup, deliberately corrupt an agent file and verify restoration works.
4. **End-to-end EVOLVE**: Trigger a full EVOLVE workflow for `agent-update` type via the evolution-orchestrator and verify all 6 phases execute correctly, including research and artifact-integrator.
5. **Schema validation**: Compare the JSON output of `main.cjs` against both input and output schemas for every field.

---

## Cross-Reference Summary

| Artifact                  | Path                                                      | Status                                                            |
| ------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------- |
| SKILL.md                  | `.claude/skills/agent-updater/SKILL.md`                   | Needs artifact-integrator, gap analysis, execution model docs     |
| main.cjs                  | `.claude/skills/agent-updater/scripts/main.cjs`           | CRITICAL: hardcoded patchPlan, missing backup, missing integrator |
| Workflow YAML             | `.claude/workflows/updaters/agent-updater-workflow.yaml`  | HIGH: optional OBTAIN contradicts Iron Law 1                      |
| Output schema             | `.claude/skills/agent-updater/schemas/output.schema.json` | MEDIUM: missing 3 fields                                          |
| Input schema              | `.claude/skills/agent-updater/schemas/input.schema.json`  | LOW: missing `name` and `help` flags                              |
| Command                   | `.claude/commands/agent-updater.md`                       | OK: properly wired                                                |
| Rules                     | `.claude/skills/agent-updater/rules/agent-updater.md`     | OK: 5 rules, accurate                                             |
| Skill workflow            | `.claude/workflows/agent-updater-skill-workflow.md`       | OK: 7-step summary accurate                                       |
| evolution-workflow.md     | `.claude/workflows/core/evolution-workflow.md`            | Source of truth, correct                                          |
| evolution-state-guard.cjs | `.claude/hooks/evolution/evolution-state-guard.cjs`       | OK: state machine enforcement correct                             |
| research-enforcement.cjs  | `.claude/hooks/evolution/research-enforcement.cjs`        | OK: blocks artifact writes without research                       |
| evolution-orchestrator.md | `.claude/agents/orchestrators/evolution-orchestrator.md`  | MEDIUM: Phase E template missing update types                     |

---

## Appendix: Findings Severity Distribution

| Severity | Count | Finding Numbers                                                                 |
| -------- | ----- | ------------------------------------------------------------------------------- |
| CRITICAL | 1     | #1 (Hardcoded patchPlan)                                                        |
| HIGH     | 2     | #2 (OBTAIN optionality), #3 (Backup not implemented)                            |
| MEDIUM   | 4     | #4 (Schema drift), #5 (Type dispatch), #6 (Missing integrator), #7 (Parity gap) |
| LOW      | 1     | #8 (YAML vs main.cjs execution gap)                                             |
