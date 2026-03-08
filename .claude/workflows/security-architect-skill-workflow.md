---
name: security-architect-workflow
description: Comprehensive security audit workflow for vulnerability assessment, threat modeling, and remediation planning
version: 1.0.0
agents: [security-architect, code-reviewer, developer, devops]
phases: 5
triggers:
  - security audit
  - vulnerability assessment
  - pre-release security review
  - penetration testing
  - compliance check
  - security gate
---

# Security Architect Workflow

Orchestrate comprehensive security audits using multi-phase threat analysis, vulnerability scanning, and remediation planning with OWASP Top 10 coverage.

## Overview

This workflow provides a systematic approach to security assessment that covers the full lifecycle from threat identification to remediation. It integrates multiple specialized agents and follows industry-standard frameworks (OWASP, STRIDE, CWE) to ensure thorough security coverage.

**Related Skill**: `.claude/skills/security-architect/SKILL.md` - Core security architecture skill with OWASP Top 10 analysis, threat modeling (STRIDE), and vulnerability assessment capabilities.

**Extended Thinking**: Security is not a one-time activity but a continuous process. This workflow ensures that security considerations are embedded throughout the development lifecycle. Each phase builds on the previous, creating a comprehensive security posture that addresses both immediate vulnerabilities and systemic weaknesses.

## When to Use

| Trigger               | Description                              | Recommended Frequency      |
| --------------------- | ---------------------------------------- | -------------------------- |
| **Pre-Release**       | Before deploying to production           | Every release              |
| **Post-Incident**     | After security breach or near-miss       | Immediately after incident |
| **Periodic Audit**    | Scheduled security review                | Quarterly                  |
| **New Feature**       | Major feature with security implications | Before feature GA          |
| **Dependency Update** | After major dependency changes           | As needed                  |
| **Compliance**        | Regulatory or certification requirements | Per compliance schedule    |

## Configuration Options

### Audit Scope

- **full**: Complete security audit (all 5 phases)
- **quick**: Rapid assessment (Phases 1-3 only)
- **targeted**: Specific vulnerability focus
- **compliance**: Regulatory compliance focus (SOC2, GDPR, HIPAA)

### Risk Appetite

- **conservative**: Block on any Medium+ findings
- **balanced**: Block on High+ findings (default)
- **aggressive**: Block on Critical only

## Phase 0: Research Synthesis (MANDATORY FIRST STEP)

**Agent**: Security Architect
**Action**: Invoke `Skill({ skill: 'research-synthesis' })` to gather current security research before any analysis begins.
**Purpose**: Ensures threat modeling and vulnerability assessment are grounded in up-to-date CVEs, OWASP findings, and threat intelligence.
**Duration**: 30-60 minutes

---

## Phase 1: Threat Modeling

**Agent**: Security Architect
**Skill**: `security-architect`
**Duration**: 2-4 hours

### Step 1.1: Attack Surface Identification

```javascript
Task({
  task_id: 'task-1',
  subagent_type: 'general-purpose',
  model: 'opus',
  description: 'Threat modeling - attack surface identification',
  prompt: `You are the SECURITY-ARCHITECT agent.

## PROJECT CONTEXT
PROJECT_ROOT: C:\\dev\\projects\\agent-studio

## Task
Identify attack surfaces for: $TARGET_SYSTEM

## Instructions
1. Read your agent definition: .claude/agents/specialized/security-architect.md
2. **Invoke skill**: Skill({ skill: "security-architect" })
3. Map all entry points: APIs, UI inputs, file uploads, external integrations
4. Identify trust boundaries and data flows
5. Document authentication and authorization boundaries
6. Create attack surface diagram
7. Save output to: .claude/context/reports/security/attack-surface.md

## STRIDE Analysis Required
For each entry point, analyze:
- **S**poofing: Can identity be faked?
- **T**ampering: Can data be modified?
- **R**epudiation: Can actions be denied?
- **I**nformation Disclosure: Can data leak?
- **D**enial of Service: Can service be disrupted?
- **E**levation of Privilege: Can access be escalated?

## Memory Protocol
1. Read .claude/context/memory/learnings.md first
2. Record findings to .claude/context/memory/issues.md
`,
});
```

**Expected Output**: Attack surface map, STRIDE analysis, trust boundary diagram

### Step 1.2: Threat Prioritization

```javascript
Task({
  task_id: 'task-2',
  subagent_type: 'general-purpose',
  model: 'opus',
  description: 'Threat prioritization using DREAD',
  prompt: `You are the SECURITY-ARCHITECT agent.

## Task
Prioritize threats identified in attack surface analysis.

## Instructions
1. **Invoke skill**: Skill({ skill: "security-architect" })
2. Read attack surface: .claude/context/reports/security/attack-surface.md
3. Apply DREAD scoring to each threat:
   - Damage: How severe is the impact?
   - Reproducibility: How easy to exploit?
   - Exploitability: How much skill required?
   - Affected Users: How many users impacted?
   - Discoverability: How easy to find?
4. Create prioritized threat matrix
5. Save output to: .claude/context/reports/security/threat-matrix.md

## Memory Protocol
1. Record prioritization decisions to .claude/context/memory/decisions.md
`,
});
```

**Expected Output**: DREAD-scored threat matrix, prioritized vulnerability list

## Phase 2: Security Code Review

**Agent**: Security Architect + Code Reviewer
**Skills**: `security-architect`, `code-analyzer`
**Duration**: 4-8 hours

### Step 2.1: OWASP Top 10 Vulnerability Scan

```javascript
Task({
  task_id: 'task-3',
  subagent_type: 'general-purpose',
  model: 'opus',
  description: 'OWASP Top 10 vulnerability analysis',
  prompt: `You are the SECURITY-ARCHITECT agent.

## Task
Scan codebase for OWASP Top 10 (2021) vulnerabilities.

## Instructions
1. **Invoke skill**: Skill({ skill: "security-architect" })
2. Read threat matrix: .claude/context/reports/security/threat-matrix.md
3. For EACH OWASP category, check:

### A01: Broken Access Control
- Missing authorization checks on endpoints
- IDOR vulnerabilities (direct object references)
- Missing function-level access control
- CORS misconfiguration

### A02: Cryptographic Failures
- Hardcoded secrets or credentials
- Weak encryption algorithms (MD5, SHA1, DES)
- Missing encryption for sensitive data at rest/transit
- Improper key management

### A03: Injection
- SQL injection in database queries
- NoSQL injection
- Command injection in shell calls
- XSS in HTML output
- LDAP injection

### A04: Insecure Design
- Missing rate limiting
- Business logic flaws
- Insufficient security controls by design

### A05: Security Misconfiguration
- Default credentials
- Verbose error messages
- Unnecessary features enabled
- Missing security headers

### A06: Vulnerable Components
- Outdated dependencies with known CVEs
- Components with security advisories
- Unsupported libraries

### A07: Authentication Failures
- Weak password policies
- Missing brute force protection
- Session fixation vulnerabilities
- Missing MFA options

### A08: Software/Data Integrity Failures
- Unsigned updates
- Insecure deserialization
- CI/CD pipeline vulnerabilities

### A09: Security Logging Failures
- Missing audit logs
- Sensitive data in logs
- Missing intrusion detection

### A10: Server-Side Request Forgery (SSRF)
- Unvalidated URL inputs
- Missing allowlist for external requests

4. Save findings to: .claude/context/reports/security/owasp-findings.md

## Memory Protocol
1. Record all vulnerabilities to .claude/context/memory/issues.md
`,
});
```

**Expected Output**: OWASP vulnerability report with file locations and remediation guidance

### Step 2.2: Secrets and Credentials Scan

```javascript
Task({
  task_id: 'task-4',
  subagent_type: 'general-purpose',
  description: 'Secrets and credentials scanning',
  prompt: `You are the SECURITY-ARCHITECT agent.

## Task
Scan for exposed secrets and credentials.

## Instructions
1. **Invoke skill**: Skill({ skill: "security-architect" })
2. Search for patterns:
   - API keys, tokens, secrets
   - Database credentials
   - Private keys and certificates
   - OAuth client secrets
   - Webhook secrets
3. Check .env files, config files, source code
4. Verify .gitignore coverage
5. Check for secrets in git history
6. Save findings to: .claude/context/reports/security/secrets-scan.md

## Memory Protocol
1. Flag critical exposures in .claude/context/memory/issues.md
`,
});
```

## Phase 3: Dependency Audit

**Agent**: Developer + Security Architect
**Skills**: `security-architect`
**Duration**: 1-2 hours

### Step 3.1: CVE Database Check

```javascript
Task({
  task_id: 'task-5',
  subagent_type: 'general-purpose',
  description: 'Dependency CVE analysis',
  prompt: `You are the DEVELOPER agent.

## Task
Audit all dependencies for known vulnerabilities.

## Instructions
1. Read your agent definition: .claude/agents/core/developer.md
2. Run dependency audit tools:
   - npm audit (for Node.js)
   - pip-audit (for Python)
   - cargo audit (for Rust)
   - OWASP Dependency-Check
3. Cross-reference with NVD/CVE databases
4. Check for:
   - Critical CVEs (CVSS >= 9.0)
   - High CVEs (CVSS >= 7.0)
   - Dependencies with security advisories
   - End-of-life dependencies
5. Save findings to: .claude/context/reports/security/dependency-audit.md

## Output Format
| Dependency | Version | CVE | CVSS | Fix Version | Impact |
|------------|---------|-----|------|-------------|--------|

## Memory Protocol
1. Record all high/critical CVEs to .claude/context/memory/issues.md
`,
});
```

### Step 3.2: Supply Chain Analysis

```javascript
Task({
  task_id: 'task-6',
  subagent_type: 'general-purpose',
  description: 'Supply chain security analysis',
  prompt: `You are the SECURITY-ARCHITECT agent.

## Task
Analyze supply chain security risks.

## Instructions
1. **Invoke skill**: Skill({ skill: "security-architect" })
2. Analyze:
   - Dependency tree depth and breadth
   - Transitive dependency risks
   - Package maintainer reputation
   - Package download trends (anomaly detection)
   - Typosquatting risks
3. Check CI/CD pipeline security:
   - Third-party action/plugin security
   - Build artifact integrity
   - Deployment secret handling
4. Save findings to: .claude/context/reports/security/supply-chain.md

## Memory Protocol
1. Record supply chain risks to .claude/context/memory/issues.md
`,
});
```

## Phase 4: Penetration Testing

**Agent**: Security Architect + DevOps
**Skills**: `security-architect`, `debugging`
**Duration**: 4-8 hours

### Step 4.1: Automated Vulnerability Testing

```javascript
Task({
  task_id: 'task-7',
  subagent_type: 'general-purpose',
  description: 'Automated penetration testing',
  prompt: `You are the SECURITY-ARCHITECT agent.

## Task
Execute automated vulnerability tests on identified attack surfaces.

## Instructions
1. **Invoke skills**: Skill({ skill: "security-architect" }), Skill({ skill: "debugging" })
2. Read attack surface: .claude/context/reports/security/attack-surface.md
3. For each endpoint, test:
   - Authentication bypass attempts
   - Authorization escalation
   - Input validation bypass
   - Session management weaknesses
   - Rate limiting effectiveness
4. Document test cases and results
5. Save findings to: .claude/context/reports/security/pentest-results.md

## Test Categories
- SQL/NoSQL injection probes
- XSS payload testing
- CSRF token validation
- Authentication brute force (controlled)
- Authorization boundary tests
- File upload security
- API abuse scenarios

## Memory Protocol
1. Record all confirmed vulnerabilities to .claude/context/memory/issues.md
`,
});
```

### Step 4.2: Manual Security Testing

```javascript
Task({
  task_id: 'task-8',
  subagent_type: 'general-purpose',
  description: 'Manual security testing scenarios',
  prompt: `You are the SECURITY-ARCHITECT agent.

## Task
Design manual security test scenarios for complex vulnerabilities.

## Instructions
1. **Invoke skill**: Skill({ skill: "security-architect" })
2. Create test scenarios for:
   - Business logic vulnerabilities
   - Race conditions
   - Time-of-check/time-of-use (TOCTOU)
   - Multi-step authentication bypass
   - Privilege escalation chains
3. Document step-by-step test procedures
4. Save test plans to: .claude/context/reports/security/manual-tests.md

## Memory Protocol
1. Record testing requirements to .claude/context/memory/decisions.md
`,
});
```

## Phase 5: Remediation Planning

**Agent**: Security Architect + Developer + DevOps
**Skills**: `security-architect`, `tdd`
**Duration**: 2-4 hours

### Step 5.1: Vulnerability Prioritization

```javascript
Task({
  task_id: 'task-9',
  subagent_type: 'general-purpose',
  model: 'opus',
  description: 'Vulnerability prioritization and remediation planning',
  prompt: `You are the SECURITY-ARCHITECT agent.

## Task
Consolidate all findings and create prioritized remediation plan.

## Instructions
1. **Invoke skill**: Skill({ skill: "security-architect" })
2. Read all security reports:
   - .claude/context/reports/security/owasp-findings.md
   - .claude/context/reports/security/dependency-audit.md
   - .claude/context/reports/security/pentest-results.md
3. Prioritize using severity + exploitability:
   - **CRITICAL**: Fix immediately (blocks release)
   - **HIGH**: Fix before release
   - **MEDIUM**: Fix within 2 sprints
   - **LOW**: Add to backlog
4. Create remediation timeline
5. Save plan to: .claude/context/reports/security/remediation-plan.md

## Memory Protocol
1. Record prioritization decisions to .claude/context/memory/decisions.md
`,
});
```

### Step 5.2: Security Ticket Creation

```javascript
Task({
  task_id: 'task-10',
  subagent_type: 'general-purpose',
  description: 'Create security fix tickets',
  prompt: `You are the SECURITY-ARCHITECT agent.

## Task
Create actionable security fix tickets from remediation plan.

## Instructions
1. Read remediation plan: .claude/context/reports/security/remediation-plan.md
2. For each vulnerability, create ticket with:
   - Title: Clear vulnerability description
   - Severity: CRITICAL/HIGH/MEDIUM/LOW
   - CWE ID: Common Weakness Enumeration reference
   - Affected files: Specific file paths
   - Remediation steps: Step-by-step fix instructions
   - Test criteria: How to verify fix
3. Assign to appropriate teams
4. Save tickets to: .claude/context/reports/security/security-tickets.md

## Memory Protocol
1. Log ticket creation to .claude/context/memory/decisions.md
`,
});
```

## Severity Classification

| Severity     | CVSS Range | SLA      | Blocks Release | Example                                   |
| ------------ | ---------- | -------- | -------------- | ----------------------------------------- |
| **CRITICAL** | 9.0 - 10.0 | 24 hours | YES            | RCE, SQL injection with data exfil        |
| **HIGH**     | 7.0 - 8.9  | 7 days   | YES            | Auth bypass, sensitive data exposure      |
| **MEDIUM**   | 4.0 - 6.9  | 30 days  | NO             | XSS, CSRF, limited information disclosure |
| **LOW**      | 0.1 - 3.9  | 90 days  | NO             | Information disclosure (non-sensitive)    |

## Security Gates

### Pre-Release Gate Criteria

The following conditions BLOCK deployment:

| Gate              | Condition                       | Override Authority |
| ----------------- | ------------------------------- | ------------------ |
| **CRITICAL CVE**  | Any CRITICAL severity finding   | CISO only          |
| **HIGH CVE**      | Unpatched HIGH severity CVE     | Security Lead      |
| **Auth Failure**  | Authentication bypass confirmed | Security Lead      |
| **Data Exposure** | PII/secrets exposure confirmed  | CISO only          |
| **Injection**     | Confirmed SQL/Command injection | Security Lead      |

### Gate Override Process

1. Document override request with business justification
2. Implement compensating controls
3. Create time-bound remediation plan
4. Obtain required approval signature
5. Add monitoring for the vulnerability

## OWASP Top 10 Coverage Matrix

| OWASP Category                 | Phase 1 | Phase 2 | Phase 3 | Phase 4 | Phase 5 |
| ------------------------------ | ------- | ------- | ------- | ------- | ------- |
| A01: Broken Access Control     | X       | X       |         | X       | X       |
| A02: Cryptographic Failures    | X       | X       |         | X       | X       |
| A03: Injection                 |         | X       |         | X       | X       |
| A04: Insecure Design           | X       |         |         |         | X       |
| A05: Security Misconfiguration | X       | X       |         | X       | X       |
| A06: Vulnerable Components     |         |         | X       |         | X       |
| A07: Authentication Failures   | X       | X       |         | X       | X       |
| A08: Software/Data Integrity   |         |         | X       |         | X       |
| A09: Security Logging Failures |         | X       |         |         | X       |
| A10: SSRF                      |         | X       |         | X       | X       |

## Success Criteria

### Workflow Completion

- [ ] Attack surface fully mapped
- [ ] STRIDE analysis completed for all entry points
- [ ] OWASP Top 10 scan executed with findings documented
- [ ] Dependency audit completed with CVE list
- [ ] Penetration tests executed on critical paths
- [ ] Remediation plan created with severity assignments
- [ ] Security tickets created and assigned

### Quality Metrics

- All CRITICAL/HIGH findings have remediation plans
- 100% of findings have CWE classifications
- All security tickets have clear acceptance criteria
- Gate criteria explicitly documented

## Usage Example

```javascript
// Router spawning security audit workflow
Task({
  task_id: 'task-11',
  subagent_type: 'general-purpose',
  model: 'opus',
  description: 'Orchestrating security audit workflow',
  prompt: `Execute security architect workflow.

## Parameters
- Target: User authentication module
- Scope: full
- Risk Appetite: balanced

## Instructions
Follow the phased workflow in: .claude/workflows/security-architect-skill-workflow.md

Execute each phase sequentially, spawning appropriate agents with correct skills.
`,
});
```

## Related Workflows

- **Feature Development Workflow**: `.claude/workflows/enterprise/feature-development-workflow.md` - Includes security review phase
- **Incident Response Workflow**: `.claude/workflows/operations/incident-response.md` - Post-breach response
- **Router Decision Workflow**: `.claude/workflows/core/router-decision.md` - Routing security requests

## Notes

- This workflow integrates with the Task tracking system for multi-phase coordination
- All agents follow Memory Protocol (read learnings.md, write to memory files)
- Agents use Skill() tool to invoke specialized capabilities
- Each phase builds on previous outputs via saved artifacts in .claude/context/reports/security/
- Use opus model for complex threat analysis and prioritization decisions
- All findings should reference CWE IDs for standardization
