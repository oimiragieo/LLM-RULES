# Conductor-Main Integration Strategy

**Document ID**: `conductor-main-integration-strategy`
**Created**: 2026-01-29
**Author**: PLANNER Agent (Task #17)
**Purpose**: Design migration strategy for conductor-main to adopt Agent-Studio features

---

## Executive Summary

This document outlines the strategy for integrating Agent-Studio's spec-driven features into the conductor-main production codebase. The integration is designed to be non-disruptive, backward-compatible, and incremental.

**Key Principles**:
1. **Zero Breaking Changes**: Existing conductor-main workflows must continue to function
2. **Incremental Adoption**: Features can be enabled one at a time
3. **Easy Rollback**: Feature flags allow instant disable without code changes
4. **Validation First**: Comprehensive testing before production deployment

**Timeline**: 2-3 weeks for full integration (Phase B-D can run in parallel)

---

## Gap Analysis: Conductor-Main vs Agent-Studio

### Feature Comparison Matrix

| Feature Category | Conductor-Main | Agent-Studio | Gap Analysis |
|-----------------|----------------|--------------|--------------|
| **Context Artifacts** | | | |
| product.md | Manual creation | CDD skill assisted | Integration: Low effort |
| tech-stack.md | Manual creation | Auto-generated (SPEC-005) | **NEW CAPABILITY** |
| workflow.md | Manual creation | Templates available | Integration: Low effort |
| **Track Management** | | | |
| spec.md | Template-based | Structured (SPEC-001) | Enhancement available |
| plan.md | Template-based | Phase-gated (SPEC-004) | Enhancement available |
| metadata.json | Manual schema | Validated (SPEC-007) | **SCHEMA MIGRATION** |
| **Audit & Traceability** | | | |
| Git notes | Manual/optional | Automatic (SPEC-002) | **NEW CAPABILITY** |
| Commit verification | None | Hash-based (SPEC-002) | **NEW CAPABILITY** |
| Audit reports | None | CLI tool (SPEC-002) | **NEW CAPABILITY** |
| **Workflow Execution** | | | |
| State persistence | setup_state.json | Generalized (SPEC-003) | **SCHEMA MIGRATION** |
| Phase verification | Manual checkpoints | Automatic (SPEC-004) | Enhancement available |
| Crash recovery | Limited | Full (SPEC-003) | **NEW CAPABILITY** |
| **Code Quality** | | | |
| Style guides | Per-project | Framework-provided (SPEC-006) | Integration: Low effort |
| Code review | Manual | Agent-assisted | Integration available |
| **Analytics** | | | |
| Track metrics | None | Automatic (SPEC-008) | **NEW CAPABILITY** |
| Progress reports | Manual | Generated (SPEC-008) | **NEW CAPABILITY** |
| Effort tracking | Manual | Schema-based (SPEC-007) | Enhancement available |
| **Onboarding** | | | |
| Project detection | Manual | Automatic (SPEC-005) | **NEW CAPABILITY** |
| Tech inference | Manual | Heuristic (SPEC-005) | **NEW CAPABILITY** |
| Adaptive setup | Basic | Context-aware (SPEC-009) | Enhancement available |

### Priority Classification

**P1 - High Value, Low Risk** (Enable First):
- SPEC-002 (Git Notes Audit): Non-breaking, adds audit trail
- SPEC-006 (Code Styleguides): Non-breaking, improves code quality
- SPEC-008 (Track Analytics): Non-breaking, adds reporting

**P2 - High Value, Medium Risk** (Enable After Validation):
- SPEC-003 (Workflow Checkpointing): State format migration required
- SPEC-005 (Brownfield Detection): Auto-generates context
- SPEC-007 (Track Metadata Schema): Schema validation added

**P3 - Medium Value, Requires Migration** (Enable Last):
- SPEC-001 (Spec-Init): Workflow change
- SPEC-004 (Phase Verification): Enforcement change
- SPEC-009 (Adaptive Questioning): UX change

---

## Migration Phases

### Phase A: Assessment (Day 1)

**Objective**: Analyze conductor-main for compatibility and identify migration risks.

#### A.1: Run Assessment Tool

```bash
# From conductor-main root
node .claude/tools/cli/conductor-migration-assess.cjs

# Expected output:
# [ASSESS] Analyzing conductor-main...
# [ASSESS] Found 23 tracks in ./tracks/
# [ASSESS] Found 145 commits with manual notes
# [ASSESS] Found setup_state.json (legacy format)
# [ASSESS] Detected tech stack: Node.js, TypeScript, PostgreSQL
#
# Compatibility Report:
# - Track metadata: 78% compatible (missing: estimatedEffort, acceptance_criteria)
# - Workflow state: 65% compatible (format: legacy setup_state.json)
# - Git notes: 0% compatible (no structured notes)
#
# Recommendations:
# 1. Run metadata migration for 23 tracks
# 2. Run state format migration for 1 workflow
# 3. Enable git-notes-audit hook for new commits
```

#### A.2: Review Assessment Report

**Checklist**:
- [ ] Track count and metadata compatibility
- [ ] Workflow state format differences
- [ ] Git notes current usage
- [ ] Tech stack detection accuracy
- [ ] Risk areas identified

#### A.3: Create Migration Plan

Based on assessment, customize this template:

```markdown
# Conductor-Main Migration Plan

## Tracks to Migrate
- [List of tracks with metadata gaps]

## State Files to Transform
- setup_state.json --> workflow-state.schema.json format

## Hooks to Enable
- SPEC-002: git-notes-audit.cjs
- SPEC-004: phase-completion-guard.cjs (warn mode first)

## Estimated Effort
- Assessment: 2 hours (complete)
- Migration scripts: 4 hours
- Validation: 4 hours
- Documentation: 2 hours
- Total: 12 hours (~1.5 days)
```

---

### Phase B: Feature Enablement (Days 2-3)

**Objective**: Enable Agent-Studio features incrementally with validation.

#### B.1: Enable Git Notes Audit (SPEC-002)

**Step 1: Install Hook**
```bash
# Copy hook to conductor-main
cp agent-studio/.claude/hooks/audit/git-notes-audit.cjs \
   conductor-main/.claude/hooks/audit/

# Update settings.json
{
  "hooks": [
    {
      "matcher": "Bash",
      "hook_path": ".claude/hooks/audit/git-notes-audit.cjs"
    }
  ]
}
```

**Step 2: Configure Environment**
```bash
# In conductor-main .env
GIT_NOTES_AUDIT_ENABLED=true
GIT_NOTES_CREDENTIAL_MASKING=true
```

**Step 3: Validate**
```bash
# Make test commit
git commit -m "test: verify git notes hook"

# Check notes attached
git notes show HEAD
# Expected: Task metadata, timestamp, verification hash
```

**Rollback**:
```bash
GIT_NOTES_AUDIT_ENABLED=false
# or remove hook from settings.json
```

#### B.2: Enable Code Styleguides (SPEC-006)

**Step 1: Copy Styleguides**
```bash
cp -r agent-studio/.claude/context/artifacts/code-styleguides \
      conductor-main/.claude/context/artifacts/
```

**Step 2: Update Developer Agent**
```markdown
<!-- In conductor-main developer agent prompt -->
## Code Style References
Read and follow these style guides:
- `.claude/context/artifacts/code-styleguides/general.md`
- `.claude/context/artifacts/code-styleguides/typescript.md`
```

**Rollback**: Remove styleguide references from agent prompts

#### B.3: Enable Track Analytics (SPEC-008)

**Step 1: Install Analytics Library**
```bash
cp agent-studio/.claude/lib/utils/track-analytics.cjs \
   conductor-main/.claude/lib/utils/
```

**Step 2: Install CLI Tool**
```bash
cp agent-studio/.claude/tools/cli/analytics-report.cjs \
   conductor-main/.claude/tools/cli/
```

**Step 3: Validate**
```bash
# Generate report for existing tracks
node .claude/tools/cli/analytics-report.cjs --output report.md

# Expected: Markdown report with project metrics
```

**Rollback**: Remove library and CLI tool

#### B.4: Enable Workflow Checkpointing (SPEC-003)

**Step 1: Install State Manager**
```bash
cp agent-studio/.claude/lib/workflow/workflow-state-manager.cjs \
   conductor-main/.claude/lib/workflow/

cp agent-studio/.claude/schemas/workflow-state.schema.json \
   conductor-main/.claude/schemas/
```

**Step 2: Migrate Existing State**
```bash
# Run state migration script
node .claude/tools/cli/migrate-workflow-state.cjs \
  --input ./setup_state.json \
  --output ./.claude/context/runtime/workflow-state/conductor-setup.json
```

**Step 3: Update Workflow Engine**
```javascript
// In conductor workflow, replace:
const state = require('./setup_state.json');

// With:
const { WorkflowStateManager } = require('./.claude/lib/workflow/workflow-state-manager.cjs');
const stateManager = new WorkflowStateManager('conductor-setup');
const state = await stateManager.load();
```

**Rollback**:
```bash
WORKFLOW_STATE_ENABLED=off
# or revert to setup_state.json usage
```

#### B.5: Enable Phase Verification (SPEC-004)

**Step 1: Install Hook (Warn Mode)**
```bash
cp agent-studio/.claude/hooks/validation/phase-completion-guard.cjs \
   conductor-main/.claude/hooks/validation/

# Set warn mode for initial deployment
PHASE_COMPLETION_GUARD=warn
```

**Step 2: Configure Settings**
```json
{
  "hooks": [
    {
      "matcher": "Edit|Write",
      "hook_path": ".claude/hooks/validation/phase-completion-guard.cjs"
    }
  ]
}
```

**Step 3: Monitor Warnings**
```bash
# Check hook output for false positives
grep "PHASE_COMPLETION_GUARD" logs/*.log
```

**Step 4: Enable Block Mode (After Validation)**
```bash
PHASE_COMPLETION_GUARD=block
```

**Rollback**:
```bash
PHASE_COMPLETION_GUARD=off
```

---

### Phase C: Validation (Days 3-4)

**Objective**: Verify all features work correctly in conductor-main context.

#### C.1: Integration Test Suite

**Test Categories**:

1. **Git Notes Verification**
   - [ ] Notes attached to all new commits
   - [ ] Notes contain task ID, phase, decisions
   - [ ] Verification hash is valid
   - [ ] Audit report generates correctly

2. **Workflow Checkpointing**
   - [ ] State saves after each phase
   - [ ] Resume detects existing state
   - [ ] State schema validates correctly
   - [ ] Cleanup works on completion

3. **Phase Verification**
   - [ ] Spec requirement enforced (warn mode)
   - [ ] Phase completion blocked without verification
   - [ ] Checkpoint commits created correctly
   - [ ] No false positives on non-track files

4. **Analytics**
   - [ ] Queries return correct data
   - [ ] Reports generate for all tracks
   - [ ] Performance within targets (<500ms)
   - [ ] No memory leaks

5. **Code Styleguides**
   - [ ] Guides loaded into agent context
   - [ ] Generated code follows guides
   - [ ] No agent prompt bloat

#### C.2: Regression Testing

```bash
# Run existing conductor-main test suite
npm test

# Expected: All existing tests pass
# No regressions from Agent-Studio integration
```

#### C.3: Performance Benchmarking

```bash
# Run performance comparison
node .claude/tools/cli/performance-benchmark.cjs --compare baseline.json

# Expected output:
# Metric              | Before  | After   | Delta
# --------------------|---------|---------|-------
# Commit overhead     | 0ms     | 45ms    | +45ms (notes)
# Workflow start      | 100ms   | 150ms   | +50ms (state load)
# Phase transition    | 50ms    | 130ms   | +80ms (checkpoint)
# Analytics query     | N/A     | 450ms   | NEW
```

**Acceptance Criteria**:
- Commit overhead: <100ms
- Workflow start: <500ms
- Phase transition: <200ms

#### C.4: User Acceptance Testing

**Scenarios to Test**:

1. **New Feature Development**
   - Start conductor-setup-workflow
   - Verify state persists across sessions
   - Complete all phases
   - Verify git notes on all commits
   - Generate analytics report

2. **Resume After Interruption**
   - Start workflow, complete Phase 1
   - Interrupt (close session)
   - Restart and verify resume prompt
   - Continue from Phase 2

3. **Error Recovery**
   - Start workflow
   - Simulate Phase 2 failure
   - Verify smart revert works
   - Resume from checkpoint

---

### Phase D: Documentation & Training (Day 5)

**Objective**: Update documentation and train team on new features.

#### D.1: Update Conductor-Main README

```markdown
# Conductor-Main

## New Features (Agent-Studio Integration)

### Git Notes Audit Trail
All commits now include structured git notes with task metadata.
View notes: `git notes show <commit>`
Generate audit report: `node .claude/tools/cli/audit-report-generator.cjs`

### Workflow Checkpointing
Long-running workflows now support crash recovery.
State is saved after each phase.
Resume: Workflows prompt to resume or start fresh on restart.

### Phase Verification
Phase completion is verified before progression.
Spec must exist before plan can be created.
Checkpoint commits created at phase boundaries.

### Track Analytics
Generate project metrics reports.
Command: `node .claude/tools/cli/analytics-report.cjs`
Reports include completion rates, effort tracking, insights.

### Code Styleguides
Language-specific style guides available.
Location: `.claude/context/artifacts/code-styleguides/`
Automatically injected into developer agent prompts.
```

#### D.2: Create Migration Guide

```markdown
# Conductor-Main Migration Guide

## Prerequisites
- Agent-Studio v2.2.1 or later
- Node.js 18+
- Git 2.30+

## Quick Start
1. Run assessment: `node .claude/tools/cli/conductor-migration-assess.cjs`
2. Review compatibility report
3. Enable features incrementally (see Phase B)
4. Validate with test suite (see Phase C)

## Feature Flags
| Feature | Environment Variable | Default |
|---------|---------------------|---------|
| Git Notes | GIT_NOTES_AUDIT_ENABLED | true |
| Checkpointing | WORKFLOW_STATE_ENABLED | true |
| Phase Verification | PHASE_COMPLETION_GUARD | warn |
| Analytics | TRACK_ANALYTICS_ENABLED | true |

## Rollback Procedures
[See Phase B rollback commands]

## Known Limitations
[See Known Issues section]
```

#### D.3: Team Training Session

**Agenda** (1 hour):
1. Overview of new features (15 min)
2. Demo: Git notes and audit reports (10 min)
3. Demo: Workflow checkpointing and resume (10 min)
4. Demo: Analytics reports (10 min)
5. Q&A (15 min)

---

## Risk Assessment

### Risk 1: State Format Incompatibility

**Description**: setup_state.json format differs from workflow-state.schema.json
**Impact**: HIGH - Workflow resume may fail
**Probability**: MEDIUM

**Mitigation**:
- Migration script transforms format
- Dry-run mode validates before migration
- Backup original state file

**Detection**:
```bash
# Validate migrated state
node .claude/tools/cli/validate-workflow-state.cjs --state workflow-state.json
```

**Rollback**:
```bash
# Restore original state
cp setup_state.json.backup setup_state.json
WORKFLOW_STATE_ENABLED=off
```

### Risk 2: Git Notes Overhead

**Description**: Git notes add 45ms per commit
**Impact**: LOW - Acceptable overhead
**Probability**: HIGH (expected)

**Mitigation**:
- Async note attachment (future enhancement)
- Batch notes for multiple commits

**Acceptance**: 45ms overhead is acceptable for audit trail value

### Risk 3: Phase Verification False Positives

**Description**: Hook may block legitimate operations
**Impact**: MEDIUM - Developer frustration
**Probability**: MEDIUM

**Mitigation**:
- Start in warn mode
- Whitelist non-track directories
- Monitor logs for false positives

**Detection**:
```bash
grep "PHASE_COMPLETION_GUARD.*blocked" logs/*.log | wc -l
# If > 5 per day, investigate false positives
```

**Rollback**:
```bash
PHASE_COMPLETION_GUARD=warn
# or
PHASE_COMPLETION_GUARD=off
```

### Risk 4: Metadata Schema Migration

**Description**: Existing metadata.json may not validate
**Impact**: MEDIUM - Analytics queries may fail
**Probability**: MEDIUM

**Mitigation**:
- Schema allows additionalProperties (forward compatible)
- Migration script adds missing required fields
- Validation runs in warn mode first

**Detection**:
```bash
node .claude/tools/cli/validate-track-metadata.cjs --dir ./tracks/
# Lists invalid metadata files
```

---

## Rollback Procedures

### Per-Feature Rollback

| Feature | Rollback Command | Recovery Time |
|---------|------------------|---------------|
| Git Notes | `GIT_NOTES_AUDIT_ENABLED=false` | <1 minute |
| Checkpointing | `WORKFLOW_STATE_ENABLED=off` | <1 minute |
| Phase Verification | `PHASE_COMPLETION_GUARD=off` | <1 minute |
| Analytics | Remove analytics-report.cjs | <1 minute |
| Styleguides | Remove styleguide references | <5 minutes |

### Full Rollback

```bash
# Emergency: Disable all Agent-Studio features
export GIT_NOTES_AUDIT_ENABLED=false
export WORKFLOW_STATE_ENABLED=off
export PHASE_COMPLETION_GUARD=off
export TRACK_ANALYTICS_ENABLED=false

# Restore original state files
cp setup_state.json.backup setup_state.json

# Remove Agent-Studio hooks from settings.json
# (manual edit required)

# Restart Claude session
```

### Rollback Decision Matrix

| Symptom | Likely Cause | Rollback Action |
|---------|--------------|-----------------|
| Commits slow (>5s) | Git notes overhead | Disable git notes |
| Workflow won't start | State format issue | Disable checkpointing |
| Edits blocked | Phase verification | Set warn mode |
| High memory usage | Analytics queries | Disable analytics |
| Agent prompts too long | Styleguide injection | Remove styleguide refs |

---

## Success Criteria

### Phase A (Assessment)

- [ ] Assessment tool runs successfully
- [ ] Compatibility report generated
- [ ] Migration plan created
- [ ] Risk areas documented

### Phase B (Enablement)

- [ ] Git notes attaching to commits
- [ ] Workflow state saves correctly
- [ ] Phase verification in warn mode
- [ ] Analytics reports generating
- [ ] Styleguides loaded

### Phase C (Validation)

- [ ] All integration tests pass
- [ ] No regressions in existing tests
- [ ] Performance within targets
- [ ] User acceptance tests pass

### Phase D (Documentation)

- [ ] README updated
- [ ] Migration guide created
- [ ] Team training completed
- [ ] Rollback procedures documented

### Overall Success

- [ ] Zero breaking changes to existing workflows
- [ ] All features operational in conductor-main
- [ ] Team comfortable with new capabilities
- [ ] Rollback procedures tested

---

## Timeline Summary

| Phase | Duration | Activities |
|-------|----------|------------|
| Phase A | 1 day | Assessment, planning |
| Phase B | 2 days | Feature enablement (incremental) |
| Phase C | 1-2 days | Validation, testing |
| Phase D | 1 day | Documentation, training |
| **Total** | **5-6 days** | |

**Parallel Opportunities**:
- Phase B and C can overlap (enable feature, validate, enable next)
- Phase D can start during Phase C

**Recommended Schedule**:
- Day 1: Assessment + Start Phase B
- Day 2-3: Continue Phase B + Start Phase C
- Day 4: Complete Phase C
- Day 5: Phase D + Final validation

---

## Appendix A: Migration Scripts

### A.1: Workflow State Migration

```javascript
// .claude/tools/cli/migrate-workflow-state.cjs

const fs = require('fs');
const path = require('path');

function migrateState(inputPath, outputPath) {
  // Read legacy format
  const legacy = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

  // Transform to new format
  const migrated = {
    workflowId: legacy.workflow_name || 'conductor-setup',
    currentPhase: legacy.current_phase || 1,
    status: legacy.status || 'in_progress',
    completedPhases: legacy.completed_phases || [],
    phaseHistory: legacy.phases?.map((p, i) => ({
      phase: i + 1,
      startTime: p.started_at,
      endTime: p.completed_at,
      status: p.completed_at ? 'completed' : 'pending',
    })) || [],
    decisions: legacy.decisions || [],
    checkpoints: [],
    createdAt: legacy.created_at || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Write new format
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(migrated, null, 2));

  console.log(`Migrated: ${inputPath} --> ${outputPath}`);
  return migrated;
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  const inputIdx = args.indexOf('--input');
  const outputIdx = args.indexOf('--output');

  if (inputIdx === -1 || outputIdx === -1) {
    console.log('Usage: migrate-workflow-state.cjs --input <path> --output <path>');
    process.exit(1);
  }

  migrateState(args[inputIdx + 1], args[outputIdx + 1]);
}

module.exports = { migrateState };
```

### A.2: Track Metadata Migration

```javascript
// .claude/tools/cli/migrate-track-metadata.cjs

const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');

function migrateMetadata(inputPath, schema) {
  const metadata = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

  // Add required fields if missing
  if (!metadata.trackId) {
    const dirname = path.basename(path.dirname(inputPath));
    metadata.trackId = `${dirname}_${Date.now().toString().slice(-8)}`;
  }

  if (!metadata.type) {
    metadata.type = 'feature'; // Default type
  }

  if (!metadata.status) {
    metadata.status = 'in_progress';
  }

  // Add optional fields with defaults
  if (!metadata.estimatedEffort) {
    metadata.estimatedEffort = {
      days: 0,
      breakdown: {},
    };
  }

  if (!metadata.acceptance_criteria) {
    metadata.acceptance_criteria = [];
  }

  // Validate against schema
  const ajv = new Ajv();
  const validate = ajv.compile(schema);
  const valid = validate(metadata);

  if (!valid) {
    console.warn(`Validation warnings for ${inputPath}:`, validate.errors);
  }

  // Write migrated metadata
  fs.writeFileSync(inputPath, JSON.stringify(metadata, null, 2));
  console.log(`Migrated: ${inputPath}`);

  return metadata;
}

module.exports = { migrateMetadata };
```

---

## Appendix B: Compatibility Checklist

### Pre-Migration Checklist

- [ ] Node.js 18+ installed
- [ ] Git 2.30+ installed
- [ ] Agent-Studio v2.2.1 cloned/available
- [ ] Backup of conductor-main created
- [ ] Test environment available

### Post-Migration Checklist

- [ ] All hooks registered in settings.json
- [ ] Environment variables configured
- [ ] State files migrated
- [ ] Metadata files validated
- [ ] Test suite passes
- [ ] Performance benchmarks pass
- [ ] Documentation updated
- [ ] Team trained

---

**End of Conductor-Main Integration Strategy**

Generated by: PLANNER Agent
Task ID: 17
Date: 2026-01-29
Location: C:\dev\projects\agent-studio\.claude\context\plans\conductor-main-integration-strategy.md
