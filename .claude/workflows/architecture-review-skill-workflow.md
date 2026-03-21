---
name: architecture-review-workflow
description: Multi-agent architecture review workflow with parallel security analysis
version: 1.0.0
agents: [architect, security-architect, code-reviewer, developer]
phases: 4
complexity: medium-to-high
triggers:
  - architecture review
  - codebase assessment
  - technical debt analysis
  - system health check
---

# Architecture Review Workflow

**Extended Thinking**: Architecture reviews require multiple expert perspectives to identify structural issues, security vulnerabilities, and improvement opportunities. This workflow orchestrates specialized agents through four phases - from initial context gathering through analysis, security review, and actionable recommendations. By spawning agents in parallel where appropriate, the workflow maximizes efficiency while ensuring comprehensive coverage of architectural concerns.

## Overview

This workflow performs comprehensive architecture reviews by:

1. Gathering codebase context and existing documentation
2. Analyzing architectural patterns, dependencies, and technical debt
3. Reviewing security posture and identifying vulnerabilities
4. Synthesizing findings into prioritized recommendations

## When to Use

**Recommended triggers:**

- Before major feature development (validate existing architecture can support new features)
- After significant codebase changes (ensure architectural integrity is maintained)
- During technical debt assessment cycles (identify refactoring priorities)
- Onboarding new team members (document current architecture state)
- Pre-security audit preparation (identify issues before external review)
- Post-incident analysis (determine if architecture contributed to issues)

**Complexity indicators:**

| Indicator             | Simple Review | Full Review   |
| --------------------- | ------------- | ------------- |
| Codebase size         | < 10k LOC     | > 10k LOC     |
| Service count         | Monolith      | Multi-service |
| Team size             | 1-3           | 4+            |
| External dependencies | < 5           | 5+            |
| Security sensitivity  | Low           | Medium-High   |

## Phase 1: Context Gathering

**Purpose**: Build comprehensive understanding of the codebase before analysis.

**Agent**: Developer (exploration mode)

**Parallel exploration**: If codebase has distinct domains, spawn multiple explorers.

### Step 1.1: Codebase Structure Exploration

```javascript
Task({
  task_id: 'task-1',
  subagent_type: 'developer',
  description: 'Exploring codebase structure for architecture review',
  prompt: `You are the DEVELOPER agent in exploration mode.

## PROJECT CONTEXT (CRITICAL)
PROJECT_ROOT: $PROJECT_ROOT
All file operations MUST be relative to PROJECT_ROOT.

## Task
Explore codebase structure to gather context for architecture review.

## Instructions
1. Read your agent definition: .claude/agents/core/developer.md
2. **Invoke skills**:
   - Skill({ skill: "code-analyzer" })
   - Skill({ skill: "project-onboarding" })
3. Map directory structure, identify major components and modules
4. Catalog technologies, frameworks, and external dependencies
5. Identify entry points, API boundaries, and data flow paths
6. Document build system, configuration, and deployment artifacts
7. Save findings to: .claude/context/exploration/architecture-review-structure.md

## Output Format
- Directory tree with component descriptions
- Technology stack summary
- Dependency graph (major components)
- Entry point catalog

## Memory Protocol
1. Read .claude/context/memory/learnings.md first
2. Record discoveries to .claude/context/memory/learnings.md
`,
});
```

**Expected Output**: Codebase map with technology stack, component boundaries, and dependency graph.

### Step 1.2: Documentation Audit

```javascript
Task({
  task_id: 'task-2',
  subagent_type: 'developer',
  description: 'Auditing existing architecture documentation',
  prompt: `You are the DEVELOPER agent.

## PROJECT CONTEXT
PROJECT_ROOT: $PROJECT_ROOT

## Task
Audit existing architecture documentation.

## Instructions
1. Read your agent definition: .claude/agents/core/developer.md
2. Search for existing documentation:
   - README files, architecture decision records (ADRs)
   - API documentation, design documents
   - Diagrams (C4, sequence, ERD)
3. Assess documentation completeness and currency
4. Identify gaps between documented and actual architecture
5. Save findings to: .claude/context/exploration/architecture-review-docs.md

## Output Format
- Documentation inventory
- Coverage assessment (0-100%)
- Currency assessment (stale/current)
- Gap analysis

## Memory Protocol
1. Record documentation gaps to .claude/context/memory/issues.md
`,
});
```

**Expected Output**: Documentation inventory with gap analysis.

**Phase 1 Deliverables**:

- `architecture-review-structure.md` - Codebase structure analysis
- `architecture-review-docs.md` - Documentation audit results

---

## Phase 2: Architecture Analysis

**Purpose**: Deep analysis of architectural patterns, quality metrics, and technical debt.

**Agent**: Architect

**Prerequisite**: Phase 1 completed (structure exploration available).

### Step 2.1: Pattern Analysis

```javascript
Task({
  task_id: 'task-3',
  subagent_type: 'developer',
  model: 'opus', // Complex reasoning required
  description: 'Analyzing architectural patterns and quality',
  prompt: `You are the ARCHITECT agent.

## PROJECT CONTEXT
PROJECT_ROOT: $PROJECT_ROOT

## Task
Analyze architectural patterns and quality metrics.

## Instructions
1. Read your agent definition: .claude/agents/core/architect.md
2. Read Phase 1 outputs:
   - .claude/context/exploration/architecture-review-structure.md
   - .claude/context/exploration/architecture-review-docs.md
3. **Invoke skills**:
   - Skill({ skill: "code-analyzer" })
4. Analyze against established patterns:
   - Layered architecture / Hexagonal / Microservices
   - SOLID principles adherence
   - DRY/KISS/YAGNI compliance
5. Assess coupling, cohesion, and modularity
6. Identify architectural anti-patterns and smell indicators
7. Save analysis to: .claude/context/reports/architecture/architecture-review-patterns.md

## Analysis Framework
| Dimension | Indicators | Rating Scale |
|-----------|-----------|--------------|
| Modularity | Clear boundaries, single responsibility | 1-5 |
| Coupling | Dependency direction, abstraction levels | 1-5 |
| Cohesion | Related functionality grouping | 1-5 |
| Extensibility | Plugin points, configuration | 1-5 |
| Testability | Dependency injection, isolation | 1-5 |

## Output Format
- Pattern identification (what patterns are used)
- Pattern adherence score (how well followed)
- Anti-pattern catalog with locations
- Complexity hotspots map

## Memory Protocol
1. Read .claude/context/memory/learnings.md first
2. Record architectural decisions to .claude/context/memory/decisions.md
`,
});
```

**Expected Output**: Pattern analysis with quality metrics and anti-pattern catalog.

### Step 2.2: Technical Debt Assessment

```javascript
Task({
  task_id: 'task-4',
  subagent_type: 'developer',
  description: 'Assessing technical debt and maintenance burden',
  prompt: `You are the ARCHITECT agent.

## PROJECT CONTEXT
PROJECT_ROOT: $PROJECT_ROOT

## Task
Assess technical debt and maintenance burden.

## Instructions
1. Read your agent definition: .claude/agents/core/architect.md
2. Read pattern analysis: .claude/context/reports/architecture/architecture-review-patterns.md
3. **Invoke skill**: Skill({ skill: "code-analyzer" })
4. Identify and categorize technical debt:
   - Code debt (duplication, complexity, outdated patterns)
   - Design debt (poor abstractions, tight coupling)
   - Infrastructure debt (outdated dependencies, missing automation)
   - Documentation debt (stale docs, missing comments)
5. Estimate remediation effort for each item
6. Prioritize based on impact and effort
7. Save assessment to: .claude/context/reports/architecture/architecture-review-techdebt.md

## Debt Categorization Matrix
| Category | Impact | Effort | Priority |
|----------|--------|--------|----------|
| Critical | Blocks development | Any | P0 |
| High | Slows development | Low-Medium | P1 |
| Medium | Causes bugs | Low | P2 |
| Low | Aesthetic | Low | P3 |

## Output Format
- Technical debt inventory
- Impact assessment per item
- Remediation effort estimates
- Prioritized backlog

## Memory Protocol
1. Record critical debt to .claude/context/memory/issues.md
`,
});
```

**Expected Output**: Technical debt inventory with prioritization.

**Phase 2 Deliverables**:

- `architecture-review-patterns.md` - Pattern analysis and quality metrics
- `architecture-review-techdebt.md` - Technical debt assessment

---

## Phase 3: Security Review

**Purpose**: Identify security vulnerabilities and compliance gaps.

**Agent**: Security Architect

**Prerequisite**: Phase 2 completed (architecture analysis available).

**Parallel execution**: This phase can run in parallel with Phase 2 if Phase 1 is complete.

### Step 3.1: Security Posture Assessment

```javascript
Task({
  task_id: 'task-5',
  subagent_type: 'developer',
  model: 'opus', // Security requires careful reasoning
  description: 'Security architecture review',
  prompt: `You are the SECURITY-ARCHITECT agent.

## PROJECT CONTEXT
PROJECT_ROOT: $PROJECT_ROOT

## Task
Perform comprehensive security architecture review.

## Instructions
1. Read your agent definition: .claude/agents/specialized/security-architect.md
2. Read Phase 1 outputs:
   - .claude/context/exploration/architecture-review-structure.md
3. **Invoke skill**: Skill({ skill: "security-architect" })
4. Apply STRIDE threat modeling:
   - Spoofing, Tampering, Repudiation
   - Information Disclosure, Denial of Service
   - Elevation of Privilege
5. Check OWASP Top 10 vulnerabilities
6. Review authentication and authorization patterns
7. Assess data protection (encryption, masking, retention)
8. Identify attack surfaces and trust boundaries
9. Save findings to: .claude/context/reports/architecture/architecture-review-security.md

## Security Checklist
- [ ] Authentication mechanisms reviewed
- [ ] Authorization patterns validated
- [ ] Input validation assessed
- [ ] Cryptographic implementations checked
- [ ] Secrets management evaluated
- [ ] Logging and audit trails verified
- [ ] Error handling reviewed (no info leakage)
- [ ] Dependency vulnerabilities scanned

## Output Format
- Threat model (STRIDE analysis)
- Vulnerability catalog with severity
- Attack surface map
- Trust boundary diagram
- Remediation recommendations

## Memory Protocol
1. Read .claude/context/memory/learnings.md first
2. Record security issues to .claude/context/memory/issues.md
`,
});
```

**Expected Output**: Security assessment with threat model and vulnerability catalog.

### Step 3.2: Dependency Security Scan

```javascript
Task({
  task_id: 'task-6',
  subagent_type: 'developer',
  description: 'Scanning dependencies for known vulnerabilities',
  prompt: `You are the SECURITY-ARCHITECT agent.

## PROJECT CONTEXT
PROJECT_ROOT: $PROJECT_ROOT

## Task
Scan dependencies for security vulnerabilities.

## Instructions
1. Read your agent definition: .claude/agents/specialized/security-architect.md
2. Identify all dependency manifests:
   - package.json, requirements.txt, go.mod, Cargo.toml, etc.
3. Check dependencies against CVE databases
4. Identify outdated dependencies with known vulnerabilities
5. Assess transitive dependency risks
6. Create upgrade recommendations
7. Save scan results to: .claude/context/reports/architecture/architecture-review-deps.md

## Output Format
- Dependency inventory with versions
- Known vulnerabilities (CVE references)
- Risk severity ratings
- Upgrade recommendations

## Memory Protocol
1. Record critical vulnerabilities to .claude/context/memory/issues.md
`,
});
```

**Expected Output**: Dependency security scan with CVE findings.

**Phase 3 Deliverables**:

- `architecture-review-security.md` - Security posture assessment
- `architecture-review-deps.md` - Dependency vulnerability scan

---

## Phase 4: Recommendations

**Purpose**: Synthesize all findings into actionable recommendations.

**Agent**: Code Reviewer (synthesis mode)

**Prerequisite**: Phases 2 and 3 completed.

### Step 4.1: Findings Consolidation

```javascript
Task({
  task_id: 'task-7',
  subagent_type: 'developer',
  description: 'Consolidating architecture review findings',
  prompt: `You are the CODE-REVIEWER agent.

## PROJECT CONTEXT
PROJECT_ROOT: $PROJECT_ROOT

## Task
Consolidate all architecture review findings into actionable recommendations.

## Instructions
1. Read your agent definition: .claude/agents/specialized/code-reviewer.md
2. Read all previous phase outputs:
   - .claude/context/exploration/architecture-review-structure.md
   - .claude/context/exploration/architecture-review-docs.md
   - .claude/context/reports/architecture/architecture-review-patterns.md
   - .claude/context/reports/architecture/architecture-review-techdebt.md
   - .claude/context/reports/architecture/architecture-review-security.md
   - .claude/context/reports/architecture/architecture-review-deps.md
3. Synthesize findings across all dimensions
4. Remove duplicates and consolidate related issues
5. Create unified prioritization based on:
   - Business impact (feature velocity, reliability)
   - Security risk (vulnerability severity)
   - Technical debt cost (maintenance burden)
6. Generate executive summary for stakeholders
7. Save consolidated report to: .claude/context/reports/architecture/architecture-review-final.md

## Output Format (architecture-review-final.md)

### Executive Summary
- Overall health score (A-F rating)
- Top 3 critical findings
- Recommended immediate actions

### Findings by Category
| Category | Finding Count | Critical | High | Medium | Low |
|----------|--------------|----------|------|--------|-----|
| Architecture | N | X | Y | Z | W |
| Security | N | X | Y | Z | W |
| Technical Debt | N | X | Y | Z | W |

### Prioritized Recommendations
1. [P0] Critical - Immediate action required
2. [P1] High - Address within 1 sprint
3. [P2] Medium - Address within 1 quarter
4. [P3] Low - Backlog for future consideration

### Roadmap Suggestion
- Week 1-2: Critical security fixes
- Month 1: High-priority refactoring
- Quarter 1: Technical debt reduction
- Ongoing: Documentation improvements

## Memory Protocol
1. Record key decisions to .claude/context/memory/decisions.md
2. Record learnings to .claude/context/memory/learnings.md
`,
});
```

**Expected Output**: Consolidated architecture review report with prioritized recommendations.

**Phase 4 Deliverables**:

- `architecture-review-final.md` - Complete review with recommendations

---

## Success Criteria

The architecture review is complete when:

- [ ] Codebase structure fully documented
- [ ] All major components and their interactions identified
- [ ] Architectural patterns analyzed with quality scores
- [ ] Technical debt cataloged and prioritized
- [ ] Security posture assessed with threat model
- [ ] Dependencies scanned for vulnerabilities
- [ ] Findings consolidated into actionable recommendations
- [ ] Executive summary prepared for stakeholders
- [ ] Remediation roadmap created with timeline

## Error Recovery

### Phase 1 Failures

**Codebase too large to explore**:

1. Split exploration by domain/module
2. Spawn parallel explorers for independent areas
3. Set exploration depth limits for initial pass

**Missing documentation**:

1. Document gap in findings
2. Proceed with code-based analysis
3. Flag documentation as high-priority recommendation

### Phase 2 Failures

**Unable to identify patterns**:

1. Check if codebase is too small/simple for formal patterns
2. Look for emerging patterns vs. established patterns
3. Document as "pattern-free" if truly ad-hoc

**Complexity analysis timeout**:

1. Focus on hotspot analysis rather than full coverage
2. Use sampling for large codebases
3. Prioritize recently-changed code

### Phase 3 Failures

**Security scan incomplete**:

1. Document what was and wasn't scanned
2. Flag gaps as recommendations for manual review
3. Focus on highest-risk areas first

**Dependency scan failures**:

1. Check for unsupported package managers
2. Fall back to manual dependency review
3. Document unscannable dependencies

### Phase 4 Failures

**Conflicting recommendations**:

1. Architect arbitrates conflicts
2. Document trade-offs for stakeholder decision
3. Provide multiple options with pros/cons

## Execution Parameters

### Required Parameters

- **--project-root**: Absolute path to project root
- **--scope**: Review scope (full|focused) [default: full]

### Optional Parameters

- **--focus-areas**: Comma-separated list of areas to prioritize
- **--exclude-paths**: Paths to exclude from analysis
- **--security-level**: Security review depth (basic|standard|deep) [default: standard]
- **--parallel-explorers**: Number of parallel exploration agents [default: 1]
- **--output-format**: Report format (markdown|html|json) [default: markdown]

## Usage Example

```javascript
// Router spawning architecture review workflow
Task({
  task_id: 'task-8',
  subagent_type: 'developer',
  description: 'Executing architecture review workflow',
  prompt: `Execute architecture review workflow.

## Parameters
- Project Root: C:\\dev\\projects\\my-app
- Scope: full
- Security Level: deep
- Focus Areas: backend-services, data-layer

## Instructions
Follow the phased workflow in: .claude/workflows/architecture-review-skill-workflow.md

Execute each phase sequentially, spawning appropriate agents with correct skills.
Wait for phase completion before proceeding to next phase.
Phases 2 and 3 may run in parallel after Phase 1 completes.
`,
});
```

## Related Skill

This workflow implements the structured process for the corresponding skill:

- **Skill**: `.claude/skills/architecture-review/SKILL.md`
- **Invoke skill**: `Skill({ skill: "architecture-review" })`
- **Relationship**: Workflow provides multi-agent orchestration; skill provides core capabilities

## Agent-Skill Mapping Reference

| Phase | Agent              | Required Skills                   |
| ----- | ------------------ | --------------------------------- |
| 1.1   | developer          | code-analyzer, project-onboarding |
| 1.2   | developer          | -                                 |
| 2.1   | architect          | code-analyzer                     |
| 2.2   | architect          | code-analyzer                     |
| 3.1   | security-architect | security-architect                |
| 3.2   | security-architect | -                                 |
| 4.1   | code-reviewer      | -                                 |

## Related Workflows

- **Feature Development Workflow**: `.claude/workflows/enterprise/feature-development-workflow.md`
- **C4 Architecture Workflow**: `.claude/workflows/enterprise/c4-architecture-workflow.md`
- **Incident Response Workflow**: `.claude/workflows/operations/incident-response.md`

## Notes

- This workflow integrates with the Task tracking system for multi-phase coordination
- All agents follow Memory Protocol (read learnings.md, write to memory files)
- Agents use Skill() tool to invoke specialized capabilities
- Each phase builds on previous outputs via saved artifacts in .claude/context/
- Phases 2 and 3 can execute in parallel after Phase 1 completes for efficiency
- For large codebases (>100k LOC), consider spawning parallel explorers in Phase 1
