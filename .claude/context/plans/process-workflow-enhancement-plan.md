# Plan: Process and Workflow Enhancement Analysis

## Executive Summary

Comprehensive analysis of process improvements needed for the .claude multi-agent framework, covering hook consolidation, code deduplication, automated security triggers, pre-commit hooks, workflow gaps, and documentation deficiencies.

## Overview

This plan analyzes 6 key areas for process and workflow enhancements based on Task #4 requirements:
1. PROC-001: Hook Consolidation Workflow
2. PROC-002: Code Deduplication Process
3. PROC-003: Automated Security Review Trigger
4. PROC-009: Pre-Commit Security Compliance
5. Workflow Gaps (missing workflows for common patterns)
6. Documentation Deficiencies

---

## Phase 1: Analysis Results

### PROC-001: Hook Consolidation Workflow

**Status**: EXISTS - Comprehensive workflow documented

**Location**: `.claude/workflows/operations/hook-consolidation.md`

**Assessment**: The hook consolidation workflow is **complete and well-documented** with:
- 5-phase process (Analysis -> Planning -> Implementation -> Testing -> Deployment)
- Detailed consolidation candidate criteria
- Performance baseline measurement templates
- Rollback plan templates
- Migration checklists
- Code templates for unified hooks

**Current State**:
| Metric | Value |
|--------|-------|
| Workflow exists | YES |
| Phases documented | 5 |
| Checklists provided | 3 (Before, During, After) |
| Code templates | YES |
| Performance targets | YES |

**Gap Identified**: No automation script to identify consolidation candidates. The workflow is manual.

**Enhancement Proposal**: Create `identify-consolidation-candidates.cjs` script
- **Effort**: 4 hours
- **Impact**: Reduces manual analysis from ~2 hours to ~5 minutes
- **Priority**: P2 (Nice to have)

---

### PROC-002: Code Deduplication Process

**Status**: PARTIAL - Issue documented but no formal process exists

**Current Issues (from issues.md)**:
- **HOOK-001**: ~2000 lines duplicated `parseHookInput()` across 40+ hooks (OPEN)
- **HOOK-002**: ~200 lines duplicated `findProjectRoot()` across 20+ hooks (OPEN)
- **NEW-MED-001**: Duplicated findProjectRoot in self-healing hooks (OPEN)

**Existing Solution**:
Shared utilities EXIST but are underutilized:
- `.claude/lib/utils/hook-input.cjs` - parseHookInput (created but not adopted everywhere)
- `.claude/lib/utils/project-root.cjs` - findProjectRoot (exists)
- `.claude/lib/utils/state-cache.cjs` - state caching (exists)

**Gap Identified**: No documented process for:
1. Identifying duplicated code
2. Creating shared utilities
3. Migrating hooks to shared utilities
4. Validating migration correctness

**Enhancement Proposal**: Create Deduplication Process Document

```markdown
# Proposed: .claude/docs/CODE_DEDUPLICATION_PROCESS.md

## Step 1: Identify Duplication
- grep for common function names across hooks
- Look for patterns: parseHookInput, findProjectRoot, getToolName, extractFilePath

## Step 2: Create/Verify Shared Utility
- Check .claude/lib/utils/ for existing utility
- If missing, create with proper exports
- Add tests in same directory

## Step 3: Migrate Hooks
- Replace inline function with require() import
- Test hook individually
- Run full test suite

## Step 4: Verify Migration
- grep for old function name (should only be in imports)
- Run regression tests
```

**Effort**: 2 hours (document) + 8 hours (migration)
**Impact**: 90% code reduction, single maintenance point
**Priority**: P1 (Important)

---

### PROC-003: Automated Security Review Trigger

**Status**: EXISTS - Implemented but has gaps

**Location**: `.claude/hooks/safety/security-trigger.cjs`

**Current Implementation**:
- Triggers on: PreToolUse (Edit|Write|NotebookEdit)
- Detects: 46 file name patterns, 10 sensitive extensions, 9 directory patterns
- Action: Flags for review (logs to stderr), does NOT block

**Coverage Analysis**:

| Category | Patterns | Coverage |
|----------|----------|----------|
| Auth/AuthZ | 14 patterns | Good (auth, login, session, jwt, oauth, etc.) |
| Cryptography | 12 patterns | Good (crypt, encrypt, hash, bcrypt, etc.) |
| Secrets | 6 patterns | Good (secret, credential, password, apikey) |
| Input Validation | 7 patterns | Good (sanitiz, validat, xss, csrf, injection) |
| Security Infrastructure | 7 patterns | Good (firewall, guard, security) |

**Gaps Identified**:

1. **Content-Based Detection Not Active**: `SECURITY_CONTENT_PATTERNS` array exists but is NOT USED
   - Patterns like `process.env.`, `crypto.`, `jwt.sign` are documented but not checked
   - **Fix**: Add content scanning for new file writes

2. **No Router State Update**: Comment says "In a full implementation, this would update router-state.json" but it doesn't
   - **Fix**: Actually update router state for security-review-guard.cjs to enforce

3. **Missing API Key Patterns**:
   - Does not catch: `AWS_ACCESS_KEY`, `STRIPE_SECRET`, `OPENAI_API_KEY`
   - **Fix**: Add common API key environment variable patterns

4. **Missing Webhook/Callback Patterns**:
   - Webhook endpoints often handle sensitive data
   - **Fix**: Add `/webhook/`, `/callback/`, `/notify/` patterns

**Enhancement Proposal**:

```javascript
// Add to security-trigger.cjs

// 1. Enable content-based detection
const SECURITY_CONTENT_PATTERNS = [
  /process\.env\./,          // Environment variable access
  /crypto\./,                 // Node crypto module
  /bcrypt\./,                // bcrypt usage
  /jwt\.sign/,               // JWT signing
  /jwt\.verify/,             // JWT verification
  /createCipher/,            // Cipher creation
  /createHash/,              // Hash creation
  /randomBytes/,             // Random generation
  /pbkdf2/,                  // Key derivation
  /AWS_ACCESS_KEY/i,         // AWS credentials
  /STRIPE_SECRET/i,          // Stripe credentials
  /OPENAI_API_KEY/i,         // OpenAI credentials
];

// 2. Add missing patterns
const ADDITIONAL_PATTERNS = [
  /webhook/i,
  /callback/i,
  /notify/i,
  /AWS_/i,
  /STRIPE_/i,
  /OPENAI_/i,
];
```

**Effort**: 4 hours
**Impact**: +30% security coverage
**Priority**: P1 (Important)

---

### PROC-009: Pre-Commit Security Compliance

**Status**: DOES NOT EXIST

**Current State**:
- `.git/hooks/` contains only sample files (*.sample)
- No `.husky/` directory exists
- No pre-commit hooks are configured

**Gap Analysis**:
Security fixes (SEC-001 through SEC-AUDIT-010) were applied manually with no automated regression prevention.

**Enhancement Proposal**: Implement Pre-Commit Security Checks

```bash
# Proposed: .claude/tools/cli/security-lint.cjs

#!/usr/bin/env node
/**
 * Security lint tool for pre-commit validation
 * Checks for common security issues in staged files
 */

const checks = [
  // 1. Hardcoded secrets detection
  { pattern: /password\s*=\s*['"][^'"]+['"]/gi, message: 'Hardcoded password' },
  { pattern: /api[_-]?key\s*=\s*['"][^'"]+['"]/gi, message: 'Hardcoded API key' },

  // 2. Unsafe patterns
  { pattern: /eval\s*\(/g, message: 'eval() usage detected' },
  { pattern: /process\.exit\s*\(\s*0\s*\).*catch/gs, message: 'Error swallowed with exit(0)' },

  // 3. Path traversal risks
  { pattern: /path\.join\s*\([^)]*\.\.[^)]*\)/g, message: 'Potential path traversal' },

  // 4. Missing input validation
  { pattern: /JSON\.parse\s*\([^)]*\)\s*(?!.*try)/g, message: 'JSON.parse without try/catch' },
];
```

**Git Hook Setup Options**:

**Option A: Simple `.git/hooks/pre-commit`**
```bash
#!/bin/bash
node .claude/tools/cli/security-lint.cjs $(git diff --cached --name-only --diff-filter=ACM)
```

**Option B: Husky + lint-staged (Recommended)**
```json
// package.json addition
{
  "husky": {
    "hooks": {
      "pre-commit": "lint-staged"
    }
  },
  "lint-staged": {
    "*.cjs": "node .claude/tools/cli/security-lint.cjs"
  }
}
```

**Effort**: 6 hours
**Impact**: Prevents security regression
**Priority**: P1 (Important)

---

### Workflow Gaps Analysis

**Current Workflows** (17 total):
- core/: 5 (router-decision, skill-lifecycle, external-integration, evolution-workflow, reflection-workflow)
- enterprise/: 3 (feature-development, c4-architecture, swarm-coordination)
- operations/: 2 (incident-response, hook-consolidation)
- root/: 7 skill workflows

**Identified Missing Workflows**:

| Missing Workflow | Description | Priority |
|------------------|-------------|----------|
| `code-review-workflow.md` | End-to-end PR review with code-reviewer agent | P1 |
| `onboarding-workflow.md` | New project onboarding with project-onboarding skill | P2 |
| `debugging-workflow.md` | Systematic debugging with devops-troubleshooter | P2 |
| `testing-workflow.md` | Full testing cycle with QA agent | P1 |
| `deployment-workflow.md` | CI/CD pipeline with devops agent | P2 |

**Workflow Gap Details**:

1. **code-review-workflow.md** (P1)
   - Triggers: PR review request
   - Agents: code-reviewer, security-architect (if sensitive)
   - Phases: Checkout -> Review -> Comment -> Approve/Request Changes

2. **testing-workflow.md** (P1)
   - Triggers: Before merge, after feature completion
   - Agents: qa, developer (for fixes)
   - Phases: Unit -> Integration -> E2E -> Coverage Check

**Effort**: 3 hours per workflow
**Total**: 15 hours for all 5 workflows
**Priority**: P1-P2 mixed

---

### Creator Workflow Completeness Analysis

**skill-creator** (`.claude/skills/skill-creator/SKILL.md`):
- **Lines**: 1144
- **Completeness**: EXCELLENT
- **Features**:
  - Create, validate, convert, install, consolidate skills
  - MCP server conversion with auto-registration
  - CLAUDE.md update enforcement
  - Skill catalog update enforcement
  - Agent assignment enforcement
  - System impact analysis
  - Iron Laws (11 documented)
  - Reference skill comparison (tdd)

**agent-creator** (`.claude/skills/agent-creator/SKILL.md`):
- **Lines**: 979
- **Completeness**: EXCELLENT
- **Features**:
  - Agent creation with skill assignment
  - Keyword research requirement (Step 2.5)
  - CLAUDE.md routing table update
  - Router-enforcer update (Step 7.5)
  - Reference agent comparison (python-pro)
  - Iron Laws (10 documented)
  - System impact analysis

**Gaps in Creator Workflows**:

| Creator | Missing Feature | Priority |
|---------|-----------------|----------|
| skill-creator | Automated CLAUDE.md update verification | P2 |
| agent-creator | Automated router-enforcer verification | P2 |
| Both | Rollback mechanism if creation fails mid-process | P3 |

---

### Documentation Deficiencies Analysis

**Current Documentation** (19 files in `.claude/docs/`):
- AGENTS.md, ARCHITECTURE.md, CHANGELOG.md, CONFIGURATION.md
- DEVELOPER_WORKFLOW.md, FILE_PLACEMENT_RULES.md, GETTING_STARTED.md
- HOOKS_REFERENCE.md, HOOK_DEVELOPMENT_GUIDE.md, MEMORY_SYSTEM.md
- ROUTER_ENFORCEMENT.md, ROUTER_KEYWORD_GUIDE.md, ROUTER_PROTOCOL.md
- ROUTER_TRAINING_EXAMPLES.md, SECURITY_VALIDATORS.md, SELF_EVOLUTION.md
- SKILLS.md, SKILL_WORKFLOW_REFERENCE.md, USER_GUIDE.md

**Documentation Coverage Assessment**:

| Area | Coverage | Notes |
|------|----------|-------|
| Router Protocol | EXCELLENT | 4 docs + training examples |
| Hooks | GOOD | Reference + development guide |
| Memory System | GOOD | Comprehensive doc |
| Security | GOOD | Validators documented |
| Skills | GOOD | Catalog + workflow reference |
| Testing | MISSING | No testing guide for framework |
| Performance | MISSING | No performance tuning guide |
| Troubleshooting | MISSING | No troubleshooting guide |

**Missing Documentation**:

1. **TESTING_GUIDE.md** (P1)
   - How to run framework tests
   - Test file conventions
   - Mocking patterns for hooks
   - Coverage requirements

2. **PERFORMANCE_TUNING.md** (P2)
   - Hook latency optimization
   - State caching strategies
   - Consolidation opportunities

3. **TROUBLESHOOTING.md** (P1)
   - Common errors and solutions
   - Debug environment variables
   - State file corruption recovery

4. **CONTRIBUTING.md** (P2)
   - Contribution guidelines
   - Code style requirements
   - PR process

**CLAUDE.md Outdated Sections**:

| Section | Issue | Fix |
|---------|-------|-----|
| 10.2 hooks/ | Shows 8 categories but _legacy not mentioned | Add _legacy note |
| 8.6 Workflows | Missing chrome-browser-skill-workflow.md | Add to table |

---

## Phase 2: Enhancement Prioritization

### Priority Matrix

| Enhancement | Effort | Impact | Priority | ROI |
|-------------|--------|--------|----------|-----|
| PROC-002 Code deduplication | 10h | 90% reduction | P1 | High |
| PROC-003 Security trigger gaps | 4h | +30% coverage | P1 | High |
| PROC-009 Pre-commit hooks | 6h | Regression prevention | P1 | High |
| Testing workflow | 3h | Test standardization | P1 | Medium |
| Code review workflow | 3h | PR process | P1 | Medium |
| TESTING_GUIDE.md | 4h | Onboarding | P1 | Medium |
| TROUBLESHOOTING.md | 4h | Support reduction | P1 | Medium |
| PROC-001 Auto-identify candidates | 4h | Analysis speed | P2 | Low |
| Missing workflows (3) | 9h | Process standardization | P2 | Medium |
| PERFORMANCE_TUNING.md | 4h | Optimization guidance | P2 | Low |
| Creator rollback mechanism | 8h | Error recovery | P3 | Low |

### Recommended Implementation Order

1. **Week 1 (20h)**: PROC-002 + PROC-003 + PROC-009
2. **Week 2 (14h)**: Testing workflow + Code review workflow + TESTING_GUIDE.md + TROUBLESHOOTING.md
3. **Week 3 (17h)**: Remaining P2 items

---

## Phase 3: Concrete Enhancements

### Enhancement E-001: Code Deduplication Process Document

**File**: `.claude/docs/CODE_DEDUPLICATION_PROCESS.md`

**Content Outline**:
```markdown
# Code Deduplication Process

## Purpose
Standardize the process for identifying and resolving code duplication in hooks.

## Step 1: Identify Duplication
Commands to find duplicated code patterns.

## Step 2: Create Shared Utility
How to create/extend utilities in .claude/lib/utils/

## Step 3: Migrate Hooks
Migration procedure with testing requirements.

## Step 4: Validate Migration
Verification commands and regression testing.

## Appendix: Known Utilities
List of existing shared utilities with usage examples.
```

### Enhancement E-002: Security Trigger Improvements

**File**: `.claude/hooks/safety/security-trigger.cjs`

**Changes**:
1. Enable content-based detection
2. Add missing API key patterns
3. Add webhook/callback patterns
4. Actually update router-state.json

### Enhancement E-003: Pre-Commit Security Lint

**Files**:
- `.claude/tools/cli/security-lint.cjs` (new)
- `.git/hooks/pre-commit` (new)

### Enhancement E-004: Testing Workflow

**File**: `.claude/workflows/operations/testing-workflow.md`

### Enhancement E-005: TESTING_GUIDE.md

**File**: `.claude/docs/TESTING_GUIDE.md`

---

## Phase 4: Verification & Success Criteria

### Success Criteria

| Enhancement | Success Criteria |
|-------------|------------------|
| E-001 | Document created, reviewed, linked from CLAUDE.md |
| E-002 | Content detection enabled, 4+ new patterns added |
| E-003 | Pre-commit hook catches hardcoded secrets |
| E-004 | Workflow used successfully for 1+ test cycles |
| E-005 | New contributor can run tests following guide |

### Verification Commands

```bash
# E-001: Document exists
ls .claude/docs/CODE_DEDUPLICATION_PROCESS.md

# E-002: Content patterns enabled
grep "SECURITY_CONTENT_PATTERNS" .claude/hooks/safety/security-trigger.cjs | grep -v "Currently not used"

# E-003: Pre-commit hook exists and executable
test -x .git/hooks/pre-commit && echo "Pre-commit hook ready"

# E-004: Workflow exists
ls .claude/workflows/operations/testing-workflow.md

# E-005: Guide exists
ls .claude/docs/TESTING_GUIDE.md
```

---

## Phase FINAL: Evolution & Reflection Check

**Purpose**: Quality assessment and learning extraction

**Tasks**:
1. Spawn reflection-agent to analyze completed work
2. Extract learnings and update memory files
3. Check for evolution opportunities (new agents/skills needed)

**Spawn Command**:
```javascript
Task({
  subagent_type: "reflection-agent",
  description: "Session reflection and learning extraction",
  prompt: "You are REFLECTION-AGENT. Read .claude/agents/core/reflection-agent.md. Analyze the completed work from this plan, extract learnings to memory files, and check for evolution opportunities (patterns that suggest new agents or skills should be created)."
})
```

**Success Criteria**:
- Reflection-agent spawned and completed
- Learnings extracted to `.claude/context/memory/learnings.md`
- Evolution opportunities logged if any detected

---

## Summary Table

| Area | Current State | Enhancement | Priority |
|------|---------------|-------------|----------|
| Hook Consolidation | Workflow EXISTS | Add automation script | P2 |
| Code Deduplication | Issues documented | Create formal process | P1 |
| Security Trigger | Partial implementation | Fill coverage gaps | P1 |
| Pre-Commit Hooks | NONE | Implement security lint | P1 |
| Workflows | 17 exist | Add 5 missing | P1-P2 |
| Documentation | 19 docs | Add 4 missing | P1-P2 |
| Creator Workflows | Excellent | Minor improvements | P2-P3 |

**Total Estimated Effort**: 51 hours
**High Priority (P1)**: 35 hours
**Medium Priority (P2)**: 16 hours

---

## Appendix: Issue Cross-Reference

| Issue ID | Status | Related Enhancement |
|----------|--------|---------------------|
| PROC-001 | OPEN | E-001 (automation script) |
| PROC-002 | OPEN | E-001 (process document) |
| PROC-003 | OPEN | E-002 (security trigger) |
| PROC-009 | OPEN | E-003 (pre-commit hooks) |
| HOOK-001 | OPEN | E-001 (migration target) |
| HOOK-002 | OPEN | E-001 (migration target) |
| NEW-MED-001 | OPEN | E-001 (migration target) |
