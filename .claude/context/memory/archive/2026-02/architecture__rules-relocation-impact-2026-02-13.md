<!-- Agent: architect | Task: #14 | Session: 2026-02-13 -->

# Rules Relocation Impact Assessment

**Date**: 2026-02-13
**Commit**: ca14ff24
**Scope**: 94 rules files relocated from `.claude/rules/` to skills/archive
**Severity**: CRITICAL — Immediate Revert Recommended
**Root Cause**: Claude Code auto-loads `.claude/rules/*.md` into every session by default

---

## Executive Summary

**RECOMMENDATION: REVERT COMMIT ca14ff24 IMMEDIATELY**

Commit ca14ff24 relocated 94 cross-cutting rules files from `.claude/rules/` to `.claude/skills/{name}/rules.md` and `.claude/rules/_archive/`. This breaks Claude Code's built-in auto-loading mechanism.

**Impact**: All relocated rules are now invisible to spawned agents unless explicitly invoked via Skill() tool.

**Critical Finding**: 11 universal rules remain in `.claude/rules/` and are still auto-loaded, but 83 skill-specific rules (api-development-expert, architecture-review, debugging, tdd, etc.) are now **only available when skills are explicitly invoked**.

---

## What Remains in .claude/rules/ (Auto-Loaded)

These 11 files are **still auto-loaded** into every session:

```
.claude/rules/agents.md                    ✅ Universal routing reference
.claude/rules/artifact-integration.md      ✅ Universal integration protocol
.claude/rules/code-standards.md            ✅ Universal code quality standards
.claude/rules/git-workflow.md              ✅ Universal git conventions
.claude/rules/hooks.md                     ✅ Universal hook protocol
.claude/rules/memory-protocol.md           ✅ Universal memory management
.claude/rules/performance.md               ✅ Universal performance guidelines
.claude/rules/security.md                  ✅ Universal security standards
.claude/rules/task-tracking.md             ✅ Universal task protocol
.claude/rules/testing.md                   ✅ Universal testing standards
.claude/rules/workspace-conventions.md     ✅ Universal file placement rules
```

**These are correctly placed** — they apply to ALL agents and should remain auto-loaded.

---

## What Was Moved (Now Invisible Unless Skill Invoked)

### Moved to .claude/skills/{name}/rules.md (15 files)

These rules are **no longer auto-loaded** — only accessible when skill is explicitly invoked:

```
advanced-elicitation/rules.md              (was .claude/rules/advanced-elicitation.md)
agent-creator/rules.md                     (was .claude/rules/agent-creator.md)
ai-ml-expert/rules.md                      (was .claude/rules/ai-ml-expert.md)
best-practices-guidelines/rules.md         (was .claude/rules/best-practices-guidelines.md)
code-analyzer/rules.md                     (was .claude/rules/code-analyzer.md)
code-quality-expert/rules.md               (was .claude/rules/code-quality-expert.md)
code-semantic-search/rules.md              (was .claude/rules/code-semantic-search.md)
code-structural-search/rules.md            (was .claude/rules/code-structural-search.md)
code-style-validator/rules.md              (was .claude/rules/code-style-validator.md)
debugging/rules.md                         (was .claude/rules/debugging.md)
dry-principle/rules.md                     (was .claude/rules/dry-principle.md)
ripgrep/rules.md                           (was .claude/rules/ripgrep.md)
task-management-protocol/rules.md          (was .claude/rules/task-management-protocol.md)
tdd/rules.md                               (was .claude/rules/tdd.md)
verification-before-completion/rules.md    (was .claude/rules/verification-before-completion.md)
```

**Impact**: These rules are now **only available when skills are explicitly invoked via Skill({ skill: "name" })**. Agents do NOT get them by default.

### Moved to .claude/rules/\_archive/ (79 files)

These rules are **archived and completely unavailable**:

```
accessibility.md, android-expert.md, api-development-expert.md, architecture-review.md,
artifact-integrator.md, auth-security-expert.md, binary-analysis-patterns.md,
checklist-generator.md, complexity-assessment.md, consensus-voting.md, container-expert.md,
context-compressor.md, context-driven-development.md, data-expert.md, database-architect.md,
database-expert.md, diagram-generator.md, differential-review.md, doc-generator.md,
docker-compose.md, expo-framework-rule.md, frontend-expert.md, gamedev-expert.md,
git-expert.md, go-expert.md, graphql-expert.md, hook-creator.md, incident-runbook-templates.md,
insecure-defaults.md, insight-extraction.md, interactive-requirements-gathering.md,
ios-expert.md, java-expert.md, k8s-manifest-generator.md, memory-forensics.md,
mobile-first-design-rules.md, nextjs-expert.md, nodejs-expert.md, on-call-handoff-patterns.md,
php-expert.md, plan-generator.md, planning-with-files.md, postmortem-writing.md,
prd-generator.md, project-onboarding.md, protocol-reverse-engineering.md,
python-backend-expert.md, react-expert.md, readme.md, research-synthesis.md,
response-rater.md, schema-creator.md, scientific-skills.md, security-architect.md,
semgrep-rule-creator.md, sentry-monitoring.md, sequential-thinking.md, session-handoff.md,
skill-creator.md, sparc-methodology.md, spec-gathering.md, spec-init.md, static-analysis.md,
summarize-changes.md, svelte-expert.md, swarm-coordination.md, tauri-native-api-integration.md,
template-creator.md, terraform-infra.md, test-generator.md, text-to-sql.md, thinking-tools.md,
track-management.md, typescript-expert.md, variant-analysis.md, web3-expert.md,
workflow-creator.md, workflow-patterns.md, writing-skills.md
```

**Impact**: These are **completely unavailable unless restored**.

---

## Broken References Found

### Agent References to workspace-conventions.md (SAFE)

29 agents reference `.claude/rules/workspace-conventions.md`:

```
.claude/agents/core/architect.md
.claude/agents/core/context-compressor.md
.claude/agents/core/developer.md
.claude/agents/core/planner.md
.claude/agents/core/pm.md
.claude/agents/core/qa.md
.claude/agents/core/reflection-agent.md
.claude/agents/core/router.md
.claude/agents/core/technical-writer.md
.claude/agents/domain/ai-ml-specialist.md
.claude/agents/domain/android-pro.md
.claude/agents/domain/api-designer.md
.claude/agents/domain/data-engineer.md
.claude/agents/domain/expo-mobile-developer.md
.claude/agents/domain/fastapi-pro.md
.claude/agents/domain/frontend-pro.md
.claude/agents/domain/gamedev-pro.md
.claude/agents/domain/golang-pro.md
.claude/agents/domain/graphql-pro.md
.claude/agents/domain/ios-pro.md
.claude/agents/domain/java-pro.md
.claude/agents/domain/llm-architect.md
.claude/agents/domain/mcp-developer.md
.claude/agents/domain/microservices-architect.md
.claude/agents/domain/mobile-ux-reviewer.md
.claude/agents/domain/nextjs-pro.md
.claude/agents/domain/nodejs-pro.md
.claude/agents/domain/php-pro.md
.claude/agents/domain/prompt-engineer.md
```

**Status**: ✅ **SAFE** — workspace-conventions.md was NOT moved (still in `.claude/rules/`)

### Tool References to .claude/rules/ (SAFE)

2 tool references found:

```
.claude/tools/cli/bootstrap-artifact-graph.cjs:      // .claude/rules/{filename}.md -> rule:{filename}
.claude/tools/cli/bootstrap-artifact-graph.cjs:  // 7. Rules: .claude/rules/*.md
```

**Status**: ✅ **SAFE** — artifact graph builder still expects `.claude/rules/*.md` (unchanged behavior)

---

## Architecture Impact Analysis

### Claude Code Auto-Loading Mechanism

**How it works:**

1. Claude Code auto-loads **ALL files in `.claude/rules/*.md`** into every session
2. This provides universal context for all agents
3. Files outside `.claude/rules/` are **NOT auto-loaded** unless explicitly read

**Current behavior after ca14ff24:**

- ✅ 11 universal rules (agents.md, memory-protocol.md, etc.) are **still auto-loaded**
- ❌ 15 skill-specific rules (debugging.md, tdd.md, etc.) are **no longer auto-loaded**
- ❌ 79 archived rules are **completely unavailable**

### Cross-Cutting Concerns Lost

These rules had **universal applicability** and are now invisible unless explicitly invoked:

| Rule                                    | Affected Agents | Universal Concern |
| --------------------------------------- | --------------- | ----------------- |
| verification-before-completion/rules.md | ALL agents      | Quality gates     |
| debugging/rules.md                      | developer, qa   | Debugging process |
| tdd/rules.md                            | developer, qa   | TDD methodology   |
| task-management-protocol/rules.md       | ALL agents      | Task coordination |

**Example Impact**: `verification-before-completion` is a **pre-completion gate** used by ALL agents. Moving it to skills means agents must explicitly invoke `Skill({ skill: "verification-before-completion" })` instead of having it auto-loaded.

### Skill Invocation vs Auto-Loading

**Before ca14ff24:**

```
Agent spawned → Rules auto-loaded (including debugging.md, tdd.md, etc.)
```

**After ca14ff24:**

```
Agent spawned → Only 11 universal rules auto-loaded
Agent must explicitly: Skill({ skill: "debugging" }) → debugging/rules.md loaded
```

**Problem**: Agents must **know to invoke skills** instead of having rules available by default.

---

## Recommendation: REVERT ca14ff24

### Revert Immediately (Priority 1)

**Reason**: 15 skill-specific rules moved to `.claude/skills/{name}/rules.md` are **no longer auto-loaded** into sessions.

**Action**:

```bash
git revert ca14ff24
```

This will restore all 94 rules to `.claude/rules/`.

### Alternative: Selective Restoration (Priority 2)

If full revert is not desired, restore these **cross-cutting rules** to `.claude/rules/`:

```bash
# Restore universal quality gates
git checkout ca14ff24~1 -- .claude/rules/verification-before-completion.md
git checkout ca14ff24~1 -- .claude/rules/task-management-protocol.md

# Restore core development practices
git checkout ca14ff24~1 -- .claude/rules/debugging.md
git checkout ca14ff24~1 -- .claude/rules/tdd.md

# Restore architecture/review patterns
git checkout ca14ff24~1 -- .claude/rules/architecture-review.md
git checkout ca14ff24~1 -- .claude/rules/security-architect.md
git checkout ca14ff24~1 -- .claude/rules/database-architect.md
git checkout ca14ff24~1 -- .claude/rules/checklist-generator.md

# Restore creator workflows
git checkout ca14ff24~1 -- .claude/rules/agent-creator.md
git checkout ca14ff24~1 -- .claude/rules/skill-creator.md
git checkout ca14ff24~1 -- .claude/rules/workflow-creator.md
git checkout ca14ff24~1 -- .claude/rules/hook-creator.md
```

### Forward Fix: Skill() Invocation Enforcement (Priority 3)

If rules remain in `.claude/skills/{name}/rules.md`, add explicit skill invocations to spawn prompts:

**Example for developer agent:**

```markdown
**Mandatory Skills:**

- Invoke `Skill({ skill: "tdd" })` before implementing features
- Invoke `Skill({ skill: "debugging" })` when debugging issues
- Invoke `Skill({ skill: "verification-before-completion" })` before marking tasks complete
```

**Problem**: This adds cognitive load and increases spawn prompt size.

---

## Affected Workflows

### Broken Workflows (No Auto-Loading)

1. **TDD Workflow**: developer agent no longer has TDD rules auto-loaded
2. **Debugging Workflow**: developer agent no longer has debugging rules auto-loaded
3. **Verification Gates**: ALL agents no longer have verification-before-completion auto-loaded
4. **Architecture Review**: architect agent no longer has architecture-review rules auto-loaded
5. **Security Review**: security-architect agent no longer has security-architect rules auto-loaded

### Working Workflows (Still Auto-Loaded)

1. **Memory Protocol**: ALL agents still have memory-protocol.md
2. **Task Tracking**: ALL agents still have task-tracking.md
3. **Git Workflow**: ALL agents still have git-workflow.md
4. **Security Standards**: ALL agents still have security.md
5. **Testing Standards**: ALL agents still have testing.md

---

## Conclusion

**CRITICAL ISSUE**: Commit ca14ff24 relocated 94 rules files, breaking Claude Code's auto-loading mechanism for 15 skill-specific rules and archiving 79 others.

**Impact Radius**: ALL agents lose access to skill-specific rules unless explicitly invoked via Skill() tool.

**Immediate Action Required**: Revert ca14ff24 to restore auto-loading behavior.

**Alternative**: Selective restoration of cross-cutting rules (verification-before-completion, debugging, tdd, architecture-review, security-architect, creator workflows).

**Forward Fix**: Add explicit Skill() invocations to all spawn prompts (increases prompt size and cognitive load).

---

## Appendix: Rules Classification

### Universal Rules (KEEP in .claude/rules/)

These apply to ALL agents and should remain auto-loaded:

- agents.md
- artifact-integration.md
- code-standards.md
- git-workflow.md
- hooks.md
- memory-protocol.md
- performance.md
- security.md
- task-tracking.md
- testing.md
- workspace-conventions.md

### Skill-Specific Rules (MOVE BACK to .claude/rules/ or Invoke Explicitly)

These are skill-specific but have **cross-cutting concerns**:

- verification-before-completion.md (used by ALL agents before completion)
- task-management-protocol.md (used by ALL agents for task coordination)
- debugging.md (used by developer, qa for debugging)
- tdd.md (used by developer, qa for TDD)
- architecture-review.md (used by architect for reviews)
- security-architect.md (used by security-architect for reviews)
- database-architect.md (used by database-architect for reviews)
- checklist-generator.md (used by qa, code-reviewer for validation)

### Archive Candidates (Keep in .claude/rules/\_archive/)

These are truly skill-specific and only used when explicitly invoked:

- android-expert.md, ios-expert.md, expo-framework-rule.md (mobile-specific)
- go-expert.md, java-expert.md, php-expert.md, python-backend-expert.md (language-specific)
- docker-compose.md, terraform-infra.md, k8s-manifest-generator.md (infra-specific)
- react-expert.md, svelte-expert.md, nextjs-expert.md (frontend-specific)
- semgrep-rule-creator.md, variant-analysis.md, protocol-reverse-engineering.md (advanced security)

---

**END OF REPORT**
