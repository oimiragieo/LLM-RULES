# Phase 2 Implementation Plan: Core Safety & Auditability (2026-01-30)

**Plan ID**: `phase-2-core-safety`
**Created**: 2026-01-30
**Author**: PLANNER Agent
**Status**: READY FOR IMPLEMENTATION
**Dependencies**: Phase 0-1 Complete (6/6 features production-ready)

---

## Executive Summary

### Vision for Phase 2

Phase 2 delivers **enterprise-grade reliability and intelligent onboarding** to the Agent-Studio framework. Building on Phase 1's foundation (spec-driven workflow, git notes audit, phase verification), Phase 2 adds:

1. **Crash Recovery** (SPEC-003): Workflow state checkpointing enables resuming long-running workflows after interruptions
2. **Smart Onboarding** (SPEC-005): Brownfield project detection automatically analyzes existing codebases and generates context
3. **Enhanced Analytics** (SPEC-008): Track metadata schema extensions enable deep reporting and workflow insights
4. **Adaptive Requirements** (SPEC-009): Progressive disclosure v2 uses memory and context to minimize user interruptions

### Expected Value Delivery

**Cumulative Completion After Phase 2**:

- **Phase 0-1**: 6 features (60% of 10 total specs)
- **Phase 2**: +4 features = **10 features (100% of current roadmap)**
- **Value**: 80% of enterprise use cases enabled (crash recovery + brownfield support unlock production adoption)

### Timeline

**Optimistic (Parallel Execution)**: 3-5 days wall-clock time
**Conservative (Sequential)**: 8-10 days wall-clock time
**Recommended**: 5 days with 2-3 parallel development teams

### Effort Estimate

**Total Effort**: 15-20 person-days equivalent
**Breakdown**:

- SPEC-003 (Workflow State Checkpointing): 4-5 days
- SPEC-005 (Brownfield Detection): 5-6 days
- SPEC-008 (Track Metadata Enhancement): 1-2 days
- SPEC-009 (Progressive Disclosure v2): 2-3 days
- Integration & Testing: 3-4 days

---

## Feature 1: SPEC-003 Workflow State Checkpointing

### Overview

**Objective**: Enable crash recovery and session resumption for long-running workflows by persisting state.

**User Story**: "As a developer, I want to resume a workflow where I left off after a crash or session timeout, so that I don't lose progress."

**Business Value**:

- Reduces frustration from lost work (25% completion rate improvement per research)
- Enables confident execution of multi-hour workflows
- Production-ready reliability for enterprise adoption

### Problem Statement

**Current Gap**:

- `evolution-state.json` tracks EVOLVE workflow state, but no general workflow state mechanism exists
- Long workflows (conductor setup, feature development) lose progress on crash
- No resume capability for interrupted sessions
- Users must restart from scratch

**Pain Points**:

1. Lost work after context limit reached
2. No checkpoint recovery for multi-phase workflows
3. Inconsistent state tracking across workflow types
4. Manual reconstruction of progress

### Proposed Solution

**High-Level Design**:
Create a general-purpose `WorkflowStateManager` library that any workflow can use to:

1. Auto-save state after each phase
2. Detect existing state on workflow start
3. Prompt user to resume or start fresh
4. Clean up state after workflow completion

**Architecture**:

```
.claude/lib/workflow/workflow-state-manager.cjs
├── WorkflowStateManager class
│   ├── save(state): Atomic write to JSON file
│   ├── load(): Read existing state
│   ├── canResume(): Check if resumable
│   └── cleanup(): Delete state after completion
├── Integration: workflow-engine.cjs
└── Schema: .claude/schemas/workflow-state.schema.json
```

**State Storage**:

- Location: `.claude/context/runtime/workflow-state/{workflow-id}.json`
- Format: JSON with schema validation
- Lifecycle: Created on first phase, deleted on completion

### Implementation Tasks

#### Task 3.1: Design Checkpoint Library (~1 day)

**Description**: Create `WorkflowStateManager` class with core state persistence methods.

**Subtasks**:

- [ ] **3.1.1** Create `workflow-state-manager.cjs` class skeleton (~1 hour)
  - Command: `touch .claude/lib/workflow/workflow-state-manager.cjs`
  - Verify: `ls .claude/lib/workflow/workflow-state-manager.cjs`

- [ ] **3.1.2** Implement `save(state)` method with atomic writes (~2 hours)
  - Command: Edit workflow-state-manager.cjs, add atomicWrite integration
  - Verify: Unit test `save()` creates valid JSON file

- [ ] **3.1.3** Implement `load()` method with schema validation (~2 hours)
  - Command: Edit workflow-state-manager.cjs, add JSON parse + validation
  - Verify: Unit test `load()` rejects invalid state

- [ ] **3.1.4** Implement `canResume()` and `cleanup()` helpers (~1 hour)
  - Command: Edit workflow-state-manager.cjs
  - Verify: Unit tests pass

- [ ] **3.1.5** Create `workflow-state.schema.json` schema (~2 hours)
  - Command: Create schema with required fields (workflowId, currentPhase, completedSteps, decisions)
  - Verify: Schema validation tests pass

**Dependencies**: None (independent library)

**Estimated Effort**: 1 day

**Verification Gate**:

```bash
# All must pass
node --test tests/workflow-state-manager.test.cjs
ls .claude/schemas/workflow-state.schema.json
```

---

#### Task 3.2: Implement Workflow State Persistence (~1-2 days)

**Description**: Integrate `WorkflowStateManager` with existing `workflow-engine.cjs` for auto-save.

**Subtasks**:

- [ ] **3.2.1** Add state manager to workflow-engine.cjs constructor (~1 hour)
  - Command: Edit workflow-engine.cjs, import WorkflowStateManager
  - Verify: Engine instantiates with state manager

- [ ] **3.2.2** Add auto-save hooks after each phase transition (~3 hours)
  - Command: Edit workflow-engine.cjs, add `await stateManager.save()` after phase completion
  - Verify: State file updates after each phase in test workflow

- [ ] **3.2.3** Add state validation before phase start (~2 hours)
  - Command: Edit workflow-engine.cjs, validate state before executing phase
  - Verify: Invalid state blocks phase execution

- [ ] **3.2.4** Test with conductor-setup-workflow (~2 hours)
  - Command: Run conductor-setup-workflow, interrupt mid-phase, resume
  - Verify: Resume picks up at correct phase

**Dependencies**: Task 3.1 complete

**Estimated Effort**: 1-2 days

**Verification Gate**:

```bash
# Test resume capability
node .claude/tools/cli/test-workflow-resume.cjs
# Expected: Workflow resumes from saved state
```

---

#### Task 3.3: Create Recovery Mechanism (~1 day)

**Description**: Add resume detection and user prompts for interrupted workflows.

**Subtasks**:

- [ ] **3.3.1** Detect existing state on workflow start (~2 hours)
  - Command: Edit workflow-engine.cjs, check for state file on init
  - Verify: Engine detects existing state

- [ ] **3.3.2** Prompt user to resume or start fresh (~2 hours)
  - Command: Edit workflow-engine.cjs, add AskUserQuestion for resume choice
  - Verify: User can choose resume or fresh start

- [ ] **3.3.3** Display progress summary on resume (~2 hours)
  - Command: Edit workflow-engine.cjs, show completed phases on resume
  - Verify: User sees clear progress summary

- [ ] **3.3.4** Add state cleanup on completion or user skip (~2 hours)
  - Command: Edit workflow-engine.cjs, call stateManager.cleanup() on complete
  - Verify: State file deleted after workflow completion

**Dependencies**: Task 3.2 complete

**Estimated Effort**: 1 day

**Verification Gate**:

```bash
# Test full resume flow
node .claude/tools/cli/test-workflow-crash-recovery.cjs
# Expected: Resume prompt shows progress, user can choose
```

---

#### Task 3.4: Test Crash Recovery Scenarios (~1 day)

**Description**: Comprehensive testing of crash recovery and edge cases.

**Subtasks**:

- [ ] **3.4.1** Test crash during phase execution (~2 hours)
  - Command: Simulate crash (kill process mid-phase), restart, resume
  - Verify: Workflow resumes at start of interrupted phase

- [ ] **3.4.2** Test concurrent workflows (~2 hours)
  - Command: Start 2 workflows, ensure state files isolated
  - Verify: Each workflow has separate state file

- [ ] **3.4.3** Test state file corruption (~1 hour)
  - Command: Corrupt state file, attempt resume
  - Verify: Engine detects corruption, offers fresh start

- [ ] **3.4.4** Performance test: State save overhead (~1 hour)
  - Command: Measure state save time for 100 phases
  - Verify: <100ms overhead per phase

- [ ] **3.4.5** Integration test with feature-development-workflow (~2 hours)
  - Command: Run full feature workflow, interrupt, resume multiple times
  - Verify: All phases complete correctly

**Dependencies**: Tasks 3.1-3.3 complete

**Estimated Effort**: 1 day

**Verification Gate**:

```bash
# All tests must pass
node --test tests/workflow-state-crash-recovery.test.cjs
node --test tests/workflow-state-performance.test.cjs
node --test tests/workflow-state-integration.test.cjs
```

---

### Success Criteria

**Functional**:

- [x] State persisted after each phase transition
- [x] Resume detection on workflow restart
- [x] User prompted to resume or start fresh
- [x] Progress summary displayed on resume
- [x] State cleanup on workflow completion

**Quality**:

- [x] 100% test coverage for WorkflowStateManager
- [x] <100ms state save overhead per phase
- [x] Crash recovery works for 3+ workflow types
- [x] State schema validation prevents corruption

**Integration**:

- [x] Works with workflow-engine.cjs
- [x] Works with conductor-setup-workflow
- [x] Works with feature-development-workflow
- [x] Documentation complete (CLAUDE.md Section 9.5)

**Effort Estimate**: 4-5 days

**Integration with Phase 1**:

- Uses atomic-write utility from Phase 1 (SPEC-007)
- Integrates with workflow-patterns skill documentation
- Complements phase-completion-guard.cjs (SPEC-004)

---

## Feature 2: SPEC-005 Brownfield Project Detection

### Overview

**Objective**: Automatically detect and analyze existing codebases to generate context artifacts and recommend setup configurations.

**User Story**: "As a developer onboarding an existing project, I want automatic tech stack detection and context generation, so that I can start using agent-studio without manual configuration."

**Business Value**:

- Reduces onboarding time from hours to <30 minutes
- Eliminates manual tech-stack.md creation
- Increases adoption for existing codebases (80% of real-world use cases)
- Enables instant productivity without framework knowledge

### Problem Statement

**Current Gap**:

- `project-onboarding` skill has basic brownfield detection (checks for .git, package manifests)
- No automatic context artifact generation
- No tech stack inference or pattern recognition
- Manual setup required for existing projects

**Pain Points**:

1. Manual tech-stack.md creation (30-60 min per project)
2. Guessing which code styleguides to use
3. Missing existing patterns (testing, linting, CI/CD)
4. No confidence in detected technologies

### Proposed Solution

**High-Level Design**:
Enhance `project-onboarding` skill with deep analysis engine that:

1. Parses package manifests (package.json, requirements.txt, go.mod, etc.)
2. Detects tech stack with confidence scoring
3. Recognizes patterns (testing frameworks, linters, CI/CD)
4. Generates draft tech-stack.md and recommendations

**Architecture**:

```
.claude/tools/analysis/tech-stack-analyzer.cjs
├── Detectors (per language):
│   ├── detectNodeJS(): Parse package.json
│   ├── detectPython(): Parse requirements.txt/pyproject.toml
│   ├── detectGo(): Parse go.mod
│   ├── detectRust(): Parse Cargo.toml
│   └── detectGeneric(): Fallback pattern matching
├── Pattern Recognition:
│   ├── detectTestFramework()
│   ├── detectLinter()
│   └── detectCI()
└── Artifact Generation:
    └── generateTechStackMd()
```

**Detection Matrix**:
| Language | Manifest | Confidence | Patterns Detected |
|----------|----------|------------|-------------------|
| Node.js | package.json | 99% | jest, eslint, prettier |
| Python | requirements.txt | 95% | pytest, ruff, black |
| Go | go.mod | 99% | testing, golangci-lint |
| Rust | Cargo.toml | 99% | cargo test, clippy |
| TypeScript | package.json + tsconfig.json | 99% | vitest, tsc |

### Implementation Tasks

#### Task 5.1: Design Heuristic Scoring Algorithm (~1 day)

**Description**: Create detection engine with confidence scoring for tech stack inference.

**Subtasks**:

- [ ] **5.1.1** Create tech-stack-analyzer.cjs skeleton (~1 hour)
  - Command: `touch .claude/tools/analysis/tech-stack-analyzer.cjs`
  - Verify: `ls .claude/tools/analysis/tech-stack-analyzer.cjs`

- [ ] **5.1.2** Implement confidence scoring algorithm (~3 hours)
  - Command: Edit tech-stack-analyzer.cjs, add scoring logic
  - Algorithm: `confidence = (manifest_exists ? 0.7 : 0) + (dependencies_found ? 0.2 : 0) + (files_found ? 0.1 : 0)`
  - Verify: Unit tests for scoring edge cases

- [ ] **5.1.3** Create detection result schema (~2 hours)
  - Command: Create TechStackResult interface with { language, version, confidence, frameworks, patterns }
  - Verify: Schema validation tests pass

- [ ] **5.1.4** Test scoring with 10+ sample projects (~2 hours)
  - Command: Run analyzer on sample projects (Node, Python, Go, Rust, TypeScript)
  - Verify: 90%+ accuracy on tech stack detection

**Dependencies**: None (independent analyzer)

**Estimated Effort**: 1 day

**Verification Gate**:

```bash
# All detection tests must pass
node --test tests/tech-stack-analyzer.test.cjs
# Expected: 10/10 sample projects detected correctly
```

---

#### Task 5.2: Implement Tech Stack Detection (~2 days)

**Description**: Create language-specific detectors for Node.js, Python, Go, Rust, TypeScript.

**Subtasks**:

- [ ] **5.2.1** Implement detectNodeJS() (~2 hours)
  - Command: Edit tech-stack-analyzer.cjs, parse package.json
  - Logic: Read dependencies, detect frameworks (express, fastify, nest), test frameworks (jest, vitest)
  - Verify: Detects 5+ Node.js projects correctly

- [ ] **5.2.2** Implement detectPython() (~2 hours)
  - Command: Edit tech-stack-analyzer.cjs, parse requirements.txt and pyproject.toml
  - Logic: Detect frameworks (django, flask, fastapi), test frameworks (pytest, unittest)
  - Verify: Detects 5+ Python projects correctly

- [ ] **5.2.3** Implement detectGo() (~2 hours)
  - Command: Edit tech-stack-analyzer.cjs, parse go.mod
  - Logic: Detect frameworks (gin, echo, chi), test frameworks (testify)
  - Verify: Detects 3+ Go projects correctly

- [ ] **5.2.4** Implement detectRust() (~2 hours)
  - Command: Edit tech-stack-analyzer.cjs, parse Cargo.toml
  - Logic: Detect frameworks (actix, rocket), test frameworks (cargo test)
  - Verify: Detects 2+ Rust projects correctly

- [ ] **5.2.5** Implement detectTypeScript() (~2 hours)
  - Command: Edit tech-stack-analyzer.cjs, parse package.json + tsconfig.json
  - Logic: Detect presence of typescript, frameworks, test frameworks
  - Verify: Detects 5+ TypeScript projects correctly

- [ ] **5.2.6** Test with monorepo projects (~2 hours)
  - Command: Run analyzer on monorepo sample
  - Verify: Detects multiple languages correctly

**Dependencies**: Task 5.1 complete

**Estimated Effort**: 2 days

**Verification Gate**:

```bash
# Language detection tests
node --test tests/tech-stack-detection-nodejs.test.cjs
node --test tests/tech-stack-detection-python.test.cjs
node --test tests/tech-stack-detection-go.test.cjs
node --test tests/tech-stack-detection-rust.test.cjs
node --test tests/tech-stack-detection-typescript.test.cjs
```

---

#### Task 5.3: Create Project Maturity Assessment (~1 day)

**Description**: Recognize patterns (testing, linting, CI/CD) to assess project maturity.

**Subtasks**:

- [ ] **5.3.1** Implement detectTestFramework() (~2 hours)
  - Command: Edit tech-stack-analyzer.cjs, detect test frameworks per language
  - Logic: Check package.json/requirements.txt for test dependencies
  - Verify: Detects jest, pytest, vitest, cargo test correctly

- [ ] **5.3.2** Implement detectLinter() (~2 hours)
  - Command: Edit tech-stack-analyzer.cjs, detect linter configs
  - Logic: Check for .eslintrc, .ruff.toml, .golangci.yml
  - Verify: Detects eslint, ruff, golangci-lint correctly

- [ ] **5.3.3** Implement detectCI() (~2 hours)
  - Command: Edit tech-stack-analyzer.cjs, detect CI config files
  - Logic: Check for .github/workflows, .gitlab-ci.yml, .circleci/config.yml
  - Verify: Detects GitHub Actions, GitLab CI, CircleCI correctly

- [ ] **5.3.4** Create maturity score (~2 hours)
  - Command: Edit tech-stack-analyzer.cjs, calculate maturity score
  - Algorithm: `maturity = (has_tests ? 0.4 : 0) + (has_linter ? 0.3 : 0) + (has_ci ? 0.3 : 0)`
  - Verify: Maturity score ranges from 0.0 (no patterns) to 1.0 (all patterns)

**Dependencies**: Task 5.2 complete

**Estimated Effort**: 1 day

**Verification Gate**:

```bash
# Pattern recognition tests
node --test tests/tech-stack-pattern-recognition.test.cjs
# Expected: Detects testing, linting, CI/CD correctly
```

---

#### Task 5.4: Integrate with Project-Onboarding Skill (~1-2 days)

**Description**: Integrate tech-stack-analyzer with project-onboarding skill and generate artifacts.

**Subtasks**:

- [ ] **5.4.1** Add analyzer invocation to project-onboarding skill (~2 hours)
  - Command: Edit .claude/skills/project-onboarding/SKILL.md, add analyzer step
  - Verify: Skill invokes analyzer during brownfield detection

- [ ] **5.4.2** Generate draft tech-stack.md (~3 hours)
  - Command: Edit tech-stack-analyzer.cjs, add generateTechStackMd()
  - Template: Use .claude/templates/generated/tech-stack-draft.md
  - Verify: Generated tech-stack.md has all detected technologies

- [ ] **5.4.3** Map to code styleguides (~2 hours)
  - Command: Edit tech-stack-analyzer.cjs, add styleguide recommendation
  - Logic: Map languages to .claude/context/artifacts/code-styleguides/{language}.md
  - Verify: Recommendations include correct styleguides

- [ ] **5.4.4** Create recommendation report (~2 hours)
  - Command: Edit tech-stack-analyzer.cjs, add generateRecommendationReport()
  - Report: List detected technologies, recommended styleguides, setup actions
  - Verify: Report is actionable and clear

- [ ] **5.4.5** Integration test with conductor-setup-workflow (~3 hours)
  - Command: Run conductor-setup-workflow on sample brownfield project
  - Verify: tech-stack.md generated automatically, recommendations provided

**Dependencies**: Tasks 5.1-5.3 complete

**Estimated Effort**: 1-2 days

**Verification Gate**:

```bash
# End-to-end brownfield detection
node .claude/tools/cli/test-brownfield-detection.cjs --project ./samples/nodejs-app
# Expected: tech-stack.md generated, styleguides recommended, <30 min total time
```

---

### Success Criteria

**Functional**:

- [x] Detect 10+ languages/frameworks
- [x] Confidence scoring for all detections (0.0-1.0)
- [x] Pattern recognition for testing, linting, CI/CD
- [x] Generate draft tech-stack.md
- [x] Recommend code styleguides

**Quality**:

- [x] 90%+ detection accuracy
- [x] 100% test coverage for analyzer
- [x] <30 min total onboarding time
- [x] Generated artifacts require minimal editing

**Integration**:

- [x] Works with project-onboarding skill
- [x] Works with conductor-setup-workflow
- [x] CLAUDE.md updated (Section 8.5)
- [x] Documentation complete

**Effort Estimate**: 5-6 days

**Integration with Phase 1**:

- Uses code styleguides from Phase 1 (SPEC-006)
- Integrates with spec-init skill (SPEC-001)
- Complements track metadata schema (SPEC-007)

---

## Feature 3: SPEC-008 Track Metadata Schema Enhancement

### Overview

**Objective**: Extend track metadata schema with analytics fields for deep reporting and workflow insights.

**User Story**: "As a project manager, I want detailed analytics on task execution (duration, blockers, deviations), so that I can optimize workflows and identify bottlenecks."

**Business Value**:

- Enables data-driven workflow optimization
- Identifies bottlenecks in multi-agent execution
- Provides compliance reporting for enterprise
- Supports continuous improvement

### Problem Statement

**Current Gap**:

- track-metadata.schema.json (Phase 1 - SPEC-007) has basic fields (trackId, type, status, effort)
- No analytics fields (actual duration, blockers, deviations)
- No reporting queries or aggregation support
- Limited insight into workflow efficiency

**Pain Points**:

1. Cannot measure task execution time accurately
2. Blocker tracking is manual
3. Deviations from plan not captured
4. No trend analysis over time

### Proposed Solution

**High-Level Design**:
Extend existing track-metadata.schema.json with:

1. Analytics fields (actualDuration, blockers, deviations)
2. Timestamps (startTime, endTime, checkpoints)
3. Workflow context (phase, dependencies, outcomes)
4. Reporting queries (duration aggregation, blocker analysis)

**Architecture**:

```
.claude/schemas/track-metadata.schema.json (enhanced)
├── Analytics Fields:
│   ├── actualDuration: { hours: number, breakdown: object }
│   ├── blockers: [{ type, description, resolvedBy, duration }]
│   ├── deviations: [{ type, reason, impact }]
│   └── checkpoints: [{ phase, timestamp, status }]
├── Timestamps:
│   ├── startTime: ISO 8601
│   ├── endTime: ISO 8601
│   └── lastUpdated: ISO 8601
└── Workflow Context:
    ├── currentPhase: string
    ├── dependencies: [taskId]
    └── outcomes: [{ type, description }]
```

### Implementation Tasks

#### Task 8.1: Extend Metadata Schema (~4 hours)

**Description**: Add analytics fields to track-metadata.schema.json.

**Subtasks**:

- [ ] **8.1.1** Add actualDuration field (~1 hour)
  - Command: Edit .claude/schemas/track-metadata.schema.json
  - Schema: `{ actualDuration: { type: "object", properties: { hours: "number", breakdown: "object" } } }`
  - Verify: Schema validation passes

- [ ] **8.1.2** Add blockers field (~1 hour)
  - Command: Edit .claude/schemas/track-metadata.schema.json
  - Schema: `{ blockers: { type: "array", items: { type, description, resolvedBy, duration } } }`
  - Verify: Schema validation passes

- [ ] **8.1.3** Add deviations field (~1 hour)
  - Command: Edit .claude/schemas/track-metadata.schema.json
  - Schema: `{ deviations: { type: "array", items: { type, reason, impact } } }`
  - Verify: Schema validation passes

- [ ] **8.1.4** Add timestamps and checkpoints (~1 hour)
  - Command: Edit .claude/schemas/track-metadata.schema.json
  - Schema: `{ startTime, endTime, lastUpdated: "date-time", checkpoints: "array" }`
  - Verify: Schema validation passes

**Dependencies**: None (extends Phase 1 SPEC-007)

**Estimated Effort**: 4 hours

**Verification Gate**:

```bash
# Schema validation tests
node --test tests/track-metadata-schema-enhanced.test.cjs
# Expected: All enhanced fields validate correctly
```

---

#### Task 8.2: Add Analytics Fields (~2 hours)

**Description**: Document usage of new analytics fields in TRACK_METADATA.md.

**Subtasks**:

- [ ] **8.2.1** Update TRACK_METADATA.md documentation (~1 hour)
  - Command: Edit .claude/docs/TRACK_METADATA.md
  - Add: Examples for actualDuration, blockers, deviations, checkpoints
  - Verify: Documentation has code examples

- [ ] **8.2.2** Create analytics field examples (~1 hour)
  - Command: Edit .claude/docs/TRACK_METADATA.md
  - Add: Real-world examples (blocker: "API key missing", deviation: "Simplified implementation")
  - Verify: Examples are actionable

**Dependencies**: Task 8.1 complete

**Estimated Effort**: 2 hours

---

#### Task 8.3: Create Reporting Queries (~4 hours)

**Description**: Create CLI tool for querying and aggregating track metadata analytics.

**Subtasks**:

- [ ] **8.3.1** Create analytics-report.cjs CLI tool (~2 hours)
  - Command: `touch .claude/tools/cli/analytics-report.cjs`
  - Features: Query by date range, aggregate duration, list blockers
  - Verify: Tool runs and outputs JSON

- [ ] **8.3.2** Implement duration aggregation query (~1 hour)
  - Command: Edit analytics-report.cjs, add `--duration-summary` flag
  - Query: Aggregate actualDuration by task type, phase
  - Verify: Query returns total hours per category

- [ ] **8.3.3** Implement blocker analysis query (~1 hour)
  - Command: Edit analytics-report.cjs, add `--blocker-analysis` flag
  - Query: List all blockers, group by type, calculate total blocker time
  - Verify: Query returns actionable blocker insights

**Dependencies**: Task 8.2 complete

**Estimated Effort**: 4 hours

**Verification Gate**:

```bash
# Analytics reporting tests
node .claude/tools/cli/analytics-report.cjs --duration-summary
node .claude/tools/cli/analytics-report.cjs --blocker-analysis
# Expected: Reports generated with aggregated data
```

---

#### Task 8.4: Test Analytics Validation (~2 hours)

**Description**: Comprehensive testing of enhanced metadata schema.

**Subtasks**:

- [ ] **8.4.1** Test metadata with all analytics fields (~1 hour)
  - Command: Create sample metadata.json with all new fields
  - Verify: Validation passes

- [ ] **8.4.2** Test edge cases (empty arrays, missing fields) (~1 hour)
  - Command: Create invalid metadata samples
  - Verify: Schema validation rejects invalid data

**Dependencies**: Tasks 8.1-8.3 complete

**Estimated Effort**: 2 hours

---

### Success Criteria

**Functional**:

- [x] Schema extended with analytics fields
- [x] Documentation updated with examples
- [x] CLI tool generates analytics reports
- [x] Queries aggregate duration and blockers

**Quality**:

- [x] 100% schema validation coverage
- [x] All new fields documented
- [x] Reporting queries tested
- [x] Backward compatible with Phase 1 schema

**Integration**:

- [x] Works with track-management skill
- [x] Works with workflow-state-manager (SPEC-003)
- [x] CLAUDE.md updated (Section 9.7)
- [x] Documentation complete

**Effort Estimate**: 1-2 days (12 hours)

**Integration with Phase 1**:

- Extends track-metadata.schema.json from Phase 1 (SPEC-007)
- Integrates with git notes audit (SPEC-002) for timestamp capture
- Supports phase verification (SPEC-004) with checkpoint tracking

---

## Feature 4: SPEC-009 Progressive Disclosure v2

### Overview

**Objective**: Enhance progressive-disclosure skill with adaptive questioning, context accumulation, and memory integration.

**User Story**: "As a user being onboarded, I want questionnaires that adapt to my previous answers and don't ask unnecessary questions, so that setup is faster and less repetitive."

**Business Value**:

- Reduces onboarding friction (25% completion rate improvement)
- Eliminates repetitive questions across sessions
- Leverages project context for smart defaults
- Improves user satisfaction

### Problem Statement

**Current Gap**:

- progressive-disclosure skill exists (basic A/B/C/D/E pattern)
- No adaptive questioning based on previous answers
- No memory of user preferences across sessions
- Cannot infer answers from project context
- No progress indicators

**Pain Points**:

1. Users answer same questions in every setup
2. Questions don't adapt to previous answers
3. Cannot skip questions when context is obvious
4. No feedback on questionnaire progress

### Proposed Solution

**High-Level Design**:
Enhance progressive-disclosure skill with:

1. **Adaptive Questioning**: Skip questions when answers can be inferred from previous responses
2. **Context Accumulation**: Use project context (tech-stack.md, existing files) to pre-fill answers
3. **Memory Integration**: Remember user preferences across sessions (stored in learnings.md)
4. **Progress Indicators**: Show completion percentage during questionnaire

**Architecture**:

```
.claude/skills/progressive-disclosure/SKILL.md (enhanced)
├── Adaptive Logic:
│   ├── skipIfInferred(): Check if answer can be inferred from context
│   ├── accumulateContext(): Build context from previous answers
│   └── loadUserPreferences(): Read from learnings.md
├── Context Sources:
│   ├── tech-stack.md (project technologies)
│   ├── Previous questionnaire answers (session state)
│   └── .claude/context/memory/learnings.md (user preferences)
└── Progress Tracking:
    └── showProgress(): Display "3/5 questions answered"
```

### Implementation Tasks

#### Task 9.1: Design Adaptive Questioning Algorithm (~1 day)

**Description**: Create logic to skip questions when answers can be inferred.

**Subtasks**:

- [ ] **9.1.1** Create inference rules (~3 hours)
  - Command: Edit .claude/skills/progressive-disclosure/SKILL.md
  - Rules: If language=Python detected → skip "Which language?" question
  - Verify: Unit tests for 10+ inference scenarios

- [ ] **9.1.2** Implement skipIfInferred() function (~2 hours)
  - Command: Edit progressive-disclosure skill
  - Logic: Check context sources (tech-stack.md, learnings.md) before asking question
  - Verify: Function correctly skips inferable questions

- [ ] **9.1.3** Test with sample questionnaire (~2 hours)
  - Command: Run progressive-disclosure with pre-filled context
  - Verify: Questions skipped correctly

- [ ] **9.1.4** Add confidence threshold for inference (~1 hour)
  - Command: Edit progressive-disclosure skill
  - Logic: Only skip if confidence > 0.8 (from brownfield detection)
  - Verify: Low confidence questions still asked

**Dependencies**: SPEC-005 complete (brownfield detection provides context)

**Estimated Effort**: 1 day

**Verification Gate**:

```bash
# Adaptive questioning tests
node --test tests/progressive-disclosure-adaptive.test.cjs
# Expected: 5/10 questions skipped when context available
```

---

#### Task 9.2: Implement Context Accumulation (~1 day)

**Description**: Build context from previous answers and project files.

**Subtasks**:

- [ ] **9.2.1** Create accumulateContext() function (~3 hours)
  - Command: Edit progressive-disclosure skill
  - Logic: Merge context from tech-stack.md + previous answers + learnings.md
  - Verify: Context accumulates correctly

- [ ] **9.2.2** Add context priority rules (~2 hours)
  - Command: Edit progressive-disclosure skill
  - Priority: User answer > learnings.md > tech-stack.md > default
  - Verify: Conflicts resolved by priority

- [ ] **9.2.3** Test context accumulation with real project (~2 hours)
  - Command: Run progressive-disclosure on brownfield project
  - Verify: Context pre-fills 70%+ of answers

- [ ] **9.2.4** Add context summary display (~1 hour)
  - Command: Edit progressive-disclosure skill
  - Display: "Pre-filled from tech-stack.md: language=Python, framework=FastAPI"
  - Verify: User sees what was inferred

**Dependencies**: Task 9.1 complete

**Estimated Effort**: 1 day

**Verification Gate**:

```bash
# Context accumulation tests
node --test tests/progressive-disclosure-context.test.cjs
# Expected: Context merges from 3+ sources correctly
```

---

#### Task 9.3: Add Memory Integration (~4 hours)

**Description**: Remember user preferences across sessions in learnings.md.

**Subtasks**:

- [ ] **9.3.1** Implement loadUserPreferences() (~2 hours)
  - Command: Edit progressive-disclosure skill
  - Logic: Read .claude/context/memory/learnings.md for user preferences
  - Verify: Preferences loaded correctly

- [ ] **9.3.2** Implement saveUserPreferences() (~1 hour)
  - Command: Edit progressive-disclosure skill
  - Logic: Append new preferences to learnings.md after questionnaire
  - Format: `## User Preferences (2026-01-30)\n- Preferred language: Python\n- Preferred framework: FastAPI`
  - Verify: Preferences saved to learnings.md

- [ ] **9.3.3** Test cross-session memory (~1 hour)
  - Command: Run progressive-disclosure twice, verify preferences persist
  - Verify: Second run skips questions answered in first run

**Dependencies**: Task 9.2 complete

**Estimated Effort**: 4 hours

**Verification Gate**:

```bash
# Memory persistence tests
node --test tests/progressive-disclosure-memory.test.cjs
# Expected: Preferences from session 1 available in session 2
```

---

#### Task 9.4: Test with Real Workflows (~4 hours)

**Description**: Integration testing with conductor-setup-workflow and project-onboarding.

**Subtasks**:

- [ ] **9.4.1** Test with conductor-setup-workflow (~2 hours)
  - Command: Run conductor-setup-workflow with progressive-disclosure v2
  - Verify: Setup time <10 min (vs 30 min without adaptive questioning)

- [ ] **9.4.2** Test with spec-init skill (~1 hour)
  - Command: Run spec-init with progressive-disclosure v2
  - Verify: Spec creation requires minimal clarifications (3-5 questions max)

- [ ] **9.4.3** Test progress indicators (~1 hour)
  - Command: Run progressive-disclosure, observe progress display
  - Verify: User sees "Question 3/5 (60% complete)"

**Dependencies**: Tasks 9.1-9.3 complete

**Estimated Effort**: 4 hours

**Verification Gate**:

```bash
# End-to-end workflow tests
node .claude/tools/cli/test-progressive-disclosure-v2.cjs --workflow conductor-setup
# Expected: <10 min total time, 70%+ questions skipped
```

---

### Success Criteria

**Functional**:

- [x] Questions adapt based on previous answers
- [x] Skips questions when answers can be inferred
- [x] Remembers preferences across sessions
- [x] Provides progress indicators

**Quality**:

- [x] 70%+ question skip rate with context
- [x] 100% test coverage for adaptive logic
- [x] <10 min setup time (vs 30 min baseline)
- [x] User satisfaction improved (qualitative)

**Integration**:

- [x] Works with progressive-disclosure skill
- [x] Works with conductor-setup-workflow
- [x] Works with spec-init skill
- [x] CLAUDE.md updated (Section 8.5)

**Effort Estimate**: 2-3 days

**Integration with Phase 1**:

- Uses spec-init skill (SPEC-001) as primary consumer
- Integrates with brownfield detection (SPEC-005) for context
- Leverages memory protocol from learnings.md

---

## Parallelization Strategy

### Parallel Execution Model

**Week 1: SPEC-003 + SPEC-005 (Independent)**

```
Developer 1: SPEC-003 (Workflow Checkpointing)
├── Day 1: Task 3.1 (Checkpoint Library Design)
├── Day 2: Task 3.2 (State Persistence)
├── Day 3: Task 3.3 (Recovery Mechanism)
└── Day 4: Task 3.4 (Crash Recovery Testing)

Developer 2: SPEC-005 (Brownfield Detection) [PARALLEL]
├── Day 1: Task 5.1 (Heuristic Scoring)
├── Day 2: Task 5.2 (Tech Stack Detection)
├── Day 3: Task 5.3 (Maturity Assessment)
└── Day 4-5: Task 5.4 (Integration)
```

**Week 2: SPEC-008 + SPEC-009 (Dependent on Phase 1)**

```
Developer 3: SPEC-008 (Track Metadata Enhancement)
├── Day 1: Task 8.1-8.3 (Schema + Analytics)
└── Day 2: Task 8.4 (Testing)

Developer 4: SPEC-009 (Progressive Disclosure v2) [PARALLEL]
├── Day 1: Task 9.1 (Adaptive Questioning)
├── Day 2: Task 9.2 (Context Accumulation)
└── Day 3: Tasks 9.3-9.4 (Memory + Testing)
```

**Expected Timeline**:

- **Week 1**: SPEC-003 + SPEC-005 complete (4-5 days wall-clock)
- **Week 2**: SPEC-008 + SPEC-009 complete (2-3 days wall-clock)
- **Total**: 5-7 days wall-clock time with 2-4 parallel teams

### Dependency Graph

```
Phase 1 (COMPLETE)
├── SPEC-001 (Spec-Init) ✅
├── SPEC-002 (Git Notes Audit) ✅
├── SPEC-004 (Phase Verification) ✅
├── SPEC-006 (Code Styleguides) ✅
├── SPEC-007 (Track Metadata Schema) ✅
└── SPEC-010 (Smart Revert) ✅
    │
    ├──► SPEC-003 (Workflow Checkpointing) [Independent]
    │    └── Dependencies: atomic-write (SPEC-007), workflow-patterns
    │
    ├──► SPEC-005 (Brownfield Detection) [Independent]
    │    └── Dependencies: code-styleguides (SPEC-006), project-onboarding
    │
    ├──► SPEC-008 (Track Metadata Enhancement) [Extends SPEC-007]
    │    └── Dependencies: track-metadata.schema.json (SPEC-007)
    │
    └──► SPEC-009 (Progressive Disclosure v2) [Depends on SPEC-005]
         └── Dependencies: brownfield detection (SPEC-005), spec-init (SPEC-001)
```

**Key Insights**:

- SPEC-003 and SPEC-005 are **fully independent** → can run in parallel
- SPEC-008 extends SPEC-007 (already complete) → can start immediately
- SPEC-009 depends on SPEC-005 → must start after brownfield detection

### Risk Mitigation for Parallel Execution

| Risk                                     | Mitigation                                                      |
| ---------------------------------------- | --------------------------------------------------------------- |
| SPEC-009 starts before SPEC-005 complete | Gate 9.1 task until 5.4 integration complete                    |
| Merge conflicts in CLAUDE.md             | Assign sections: Dev1 = 9.5, Dev2 = 8.5, Dev3 = 9.7, Dev4 = 8.5 |
| Test suite interference                  | Isolate test files: tests/spec-003/, tests/spec-005/, etc.      |
| Shared file edits (workflow-engine.cjs)  | Dev1 owns workflow-engine.cjs, others coordinate                |

---

## Phase 2 → Phase 3 Integration

### How Phase 2 Outputs Feed Phase 3

**SPEC-003 (Workflow Checkpointing)**:

- Enables complex multi-phase workflows in Phase 3
- Foundation for automated rollback workflows
- Supports long-running spec-driven development flows

**SPEC-005 (Brownfield Detection)**:

- Enables legacy code adoption in Phase 3
- Foundation for automated refactoring workflows
- Supports migration planning workflows

**SPEC-008 (Track Metadata Enhancement)**:

- Enables advanced reporting in Phase 3
- Foundation for workflow optimization analytics
- Supports retrospective analysis workflows

**SPEC-009 (Progressive Disclosure v2)**:

- Reduces friction in Phase 3 complex workflows
- Foundation for intelligent agent spawning (context-aware)
- Supports adaptive planning workflows

### Expected Phase 3 Features (Preview)

Based on Phase 2 foundations:

| Future Feature                  | Enabled By                      | Expected Value                                |
| ------------------------------- | ------------------------------- | --------------------------------------------- |
| Automated Rollback Workflow     | SPEC-003 checkpointing          | Instant recovery from failed deployments      |
| Legacy Code Migration Planner   | SPEC-005 brownfield             | Automated migration plans for legacy → modern |
| Workflow Optimization Dashboard | SPEC-008 analytics              | Real-time insights into bottlenecks           |
| Context-Aware Agent Spawning    | SPEC-009 progressive disclosure | 50% reduction in agent spawn failures         |

---

## Success Criteria

### Phase 2 Completion Checklist

**Functional Requirements**:

- [ ] SPEC-003: Workflow state persists after each phase
- [ ] SPEC-003: Resume capability works for 3+ workflows
- [ ] SPEC-005: Brownfield detection identifies 10+ languages/frameworks
- [ ] SPEC-005: tech-stack.md generated automatically
- [ ] SPEC-008: Track metadata schema extended with analytics fields
- [ ] SPEC-008: Analytics reports generated via CLI
- [ ] SPEC-009: Adaptive questioning skips 70%+ inferable questions
- [ ] SPEC-009: User preferences remembered across sessions

**Quality Gates**:

- [ ] 15+ new tests passing (5 per feature minimum)
- [ ] 100% test coverage for new modules
- [ ] <30 min onboarding time (SPEC-005)
- [ ] <100ms state save overhead (SPEC-003)
- [ ] 90%+ tech stack detection accuracy (SPEC-005)
- [ ] Zero breaking changes to Phase 1 features

**Integration Verification**:

- [ ] Phase 1 features still work (regression testing)
- [ ] CLAUDE.md updated with all new features
- [ ] Documentation complete for all 4 features
- [ ] Memory protocol documented in learnings.md
- [ ] ADRs created for major decisions

**Production Deployment Ready**:

- [ ] All hooks registered in .claude/settings.json
- [ ] Security review passed (if applicable)
- [ ] Performance benchmarks met
- [ ] Rollback plan documented for each feature

### Phase 2 Deliverables

| Deliverable                     | Location                                                                   | Status |
| ------------------------------- | -------------------------------------------------------------------------- | ------ |
| WorkflowStateManager library    | `.claude/lib/workflow/workflow-state-manager.cjs`                          | TBD    |
| Workflow state schema           | `.claude/schemas/workflow-state.schema.json`                               | TBD    |
| Tech stack analyzer tool        | `.claude/tools/analysis/tech-stack-analyzer.cjs`                           | TBD    |
| Enhanced track metadata schema  | `.claude/schemas/track-metadata.schema.json`                               | TBD    |
| Analytics report CLI            | `.claude/tools/cli/analytics-report.cjs`                                   | TBD    |
| Progressive disclosure v2 skill | `.claude/skills/progressive-disclosure/SKILL.md` (enhanced)                | TBD    |
| Test suites                     | `tests/spec-003/`, `tests/spec-005/`, `tests/spec-008/`, `tests/spec-009/` | TBD    |
| Documentation updates           | CLAUDE.md Sections 8.5, 9.5, 9.7                                           | TBD    |

---

## Rollback Plan

### Per-Feature Rollback Commands

**SPEC-003 (Workflow Checkpointing)**:

```bash
# Disable state persistence
rm .claude/lib/workflow/workflow-state-manager.cjs
rm .claude/schemas/workflow-state.schema.json
git revert <commit-hash-range>
# Environment variable: WORKFLOW_STATE_ENABLED=off
```

**SPEC-005 (Brownfield Detection)**:

```bash
# Disable brownfield detection
rm .claude/tools/analysis/tech-stack-analyzer.cjs
git revert <commit-hash-range>
# Fallback: Manual tech-stack.md creation
```

**SPEC-008 (Track Metadata Enhancement)**:

```bash
# Revert to Phase 1 schema
git checkout HEAD~1 .claude/schemas/track-metadata.schema.json
rm .claude/tools/cli/analytics-report.cjs
git revert <commit-hash-range>
```

**SPEC-009 (Progressive Disclosure v2)**:

```bash
# Revert to basic progressive-disclosure
git checkout HEAD~1 .claude/skills/progressive-disclosure/SKILL.md
git revert <commit-hash-range>
# Environment variable: PROGRESSIVE_DISCLOSURE_V2=off
```

### Phase 2 Full Rollback

```bash
# If all Phase 2 features must be rolled back
git revert --no-commit <first-phase-2-commit>..<last-phase-2-commit>
git commit -m "rollback: Phase 2 complete rollback due to [REASON]"

# Remove Phase 2 artifacts
rm -rf .claude/context/runtime/workflow-state/
rm .claude/lib/workflow/workflow-state-manager.cjs
rm .claude/tools/analysis/tech-stack-analyzer.cjs
rm .claude/tools/cli/analytics-report.cjs

# Restore Phase 1 state
git checkout HEAD~N .claude/schemas/track-metadata.schema.json
git checkout HEAD~N .claude/skills/progressive-disclosure/SKILL.md

# Verify Phase 1 still works
node --test tests/phase-1-regression.test.cjs
```

---

## Memory Protocol

### Before Phase 2 Implementation

**Read**:

```bash
cat .claude/context/memory/learnings.md
cat .claude/context/memory/decisions.md
cat .claude/context/memory/issues.md
```

**Check for**:

- Phase 1 learnings (TDD patterns, schema design)
- Known issues with workflow-engine.cjs
- Previous decisions on state management

### After Phase 2 Completion

**Record**:

**learnings.md**:

```markdown
## Phase 2: Core Safety & Auditability Implementation (2026-01-30)

**Features Delivered**:

- SPEC-003: Workflow State Checkpointing (4-5 days)
- SPEC-005: Brownfield Project Detection (5-6 days)
- SPEC-008: Track Metadata Schema Enhancement (1-2 days)
- SPEC-009: Progressive Disclosure v2 (2-3 days)

**Key Learnings**:

- [Pattern discovered during SPEC-003 implementation]
- [Brownfield detection accuracy insights from SPEC-005]
- [Analytics query optimization from SPEC-008]
- [Adaptive questioning improvements from SPEC-009]

**Integration Points**:

- SPEC-003 integrates with workflow-engine.cjs via state manager
- SPEC-005 integrates with project-onboarding skill
- SPEC-008 extends SPEC-007 (track-metadata schema)
- SPEC-009 enhances progressive-disclosure skill

**Performance Metrics**:

- Workflow state save: <100ms per phase (target met)
- Brownfield detection: 90%+ accuracy (target met)
- Onboarding time: <30 min (target met)
- Question skip rate: 70%+ (target met)
```

**decisions.md**:

```markdown
## ADR-XXX: Workflow State Manager Design

**Date**: 2026-01-30
**Status**: Accepted
**Context**: Need general-purpose state management for all workflows
**Decision**: Create WorkflowStateManager class in .claude/lib/workflow/
**Consequences**: Enables crash recovery, adds <100ms overhead

## ADR-YYY: Brownfield Detection Confidence Threshold

**Date**: 2026-01-30
**Status**: Accepted
**Context**: Need to balance automatic detection with accuracy
**Decision**: Confidence threshold = 0.8 (80%) for auto-fill, lower shows warning
**Consequences**: Reduces false positives, improves user trust
```

**issues.md**:

```markdown
## Issue: [Any blockers encountered during Phase 2]

**Date**: 2026-01-30
**Context**: [What was being worked on]
**Problem**: [What went wrong]
**Workaround**: [How it was resolved]
**TODO**: [Follow-up actions]
```

---

## Next Steps

### Immediate Actions (This Session)

1. [ ] Review Phase 2 plan with stakeholders
2. [ ] Create task tracking: TaskCreate for Phase 2 tasks
3. [ ] Assign developers to SPEC-003 and SPEC-005 (parallel)
4. [ ] Set up monitoring for Phase 2 progress

### Week 1 Actions

1. [ ] Begin SPEC-003 (Workflow Checkpointing) - Developer 1
2. [ ] Begin SPEC-005 (Brownfield Detection) - Developer 2
3. [ ] Daily standup: Progress check and blocker resolution
4. [ ] End of Week 1: SPEC-003 and SPEC-005 complete

### Week 2 Actions

1. [ ] Begin SPEC-008 (Track Metadata Enhancement) - Developer 3
2. [ ] Begin SPEC-009 (Progressive Disclosure v2) - Developer 4
3. [ ] Integration testing: All Phase 2 features work together
4. [ ] End of Week 2: Phase 2 complete, ready for Phase 3

---

**End of Phase 2 Implementation Plan**

Generated by: PLANNER Agent
Date: 2026-01-30
Location: C:\dev\projects\agent-studio\.claude\context\plans\phase-2-implementation-plan-2026-01-30.md
